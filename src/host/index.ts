import Phaser from "phaser";
import { cardTableManifest } from "../manifest.js";
import type {
  CardTableActionState,
  CardTableCardState,
  CardTablePublicState,
  CardTableSeatState
} from "../protocol.js";
import { ensureCardBackTexture, ensureCardTexture } from "./cardTextures.js";
import { renderRoundScreens } from "./roundScreens.js";
import { bindPlatformTheme, tokens } from "./platformTheme.js";

/**
 * Der Spieltisch auf dem geteilten Bildschirm.
 *
 * Die Szene kennt keine Spielregeln: Sie zeichnet Sitzplätze, Stapel und die
 * vom Server gelieferten Host-Buttons. Ein neues Kartenspiel auf demselben
 * Protokoll bekommt diesen Tisch geschenkt.
 */

type SupportedLanguage = "de" | "en";

interface HostClientLike {
  subscribe(callback: (state: HostAppStateLike) => void): () => void;
  sendGameHostAction?(gameId: string, action: unknown): void;
}

interface HostAppStateLike {
  game?: {
    phase?: string;
    state?: unknown;
    message?: string;
  } | null;
  room?: {
    language?: SupportedLanguage;
    players?: Array<{ id: string; name: string; color: string; connected: boolean }>;
  } | null;
  scoreboard?: {
    entries: Array<{ playerId: string; delta: number; total: number }>;
  } | null;
}

const theme = {
  get body() {
    return tokens().font.body;
  },
  get display() {
    return tokens().font.display;
  },
  get text() {
    return tokens().color.text;
  },
  get muted() {
    return tokens().color.muted;
  },
  get accent() {
    return tokens().color.accent;
  },
  get danger() {
    return tokens().color.danger;
  },
  get success() {
    return tokens().color.success;
  }
};

const hex = (color: string): number => Number.parseInt(color.replace("#", ""), 16);

const felt = 0x4b6b58;
const feltEdge = 0x3c5748;
const panelFill = 0x2b2620;

function labels(language?: SupportedLanguage) {
  const en = language === "en";

  return {
    waiting: en ? "Waiting for the card table." : "Warte auf den Kartentisch.",
    turn: en ? "Turn" : "Am Zug",
    deck: en ? "Deck" : "Deck",
    cards: en ? "cards" : "Karten",
    direction: en ? "Direction" : "Richtung",
    log: en ? "Table log" : "Verlauf",
    winner: en ? "Winner" : "Gewinner",
    empty: en ? "Nothing played yet." : "Noch nichts gespielt."
  };
}

export class CardTableHostScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private client: HostClientLike | null = null;
  private latest: HostAppStateLike | null = null;
  private onTextureAdded?: () => void;

  constructor() {
    super(cardTableManifest.hostView);
  }

  create(): void {
    bindPlatformTheme(this.registry);
    this.client = this.registry.get("hostClient") as HostClientLike;

    this.unsubscribe = this.client.subscribe((state) => {
      this.latest = state;
      this.draw();
    });

    this.onTextureAdded = () => {
      if (this.latest) {
        this.draw();
      }
    };
    this.textures.on(Phaser.Textures.Events.ADD, this.onTextureAdded);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;

      if (this.onTextureAdded) {
        this.textures.off(Phaser.Textures.Events.ADD, this.onTextureAdded);
        this.onTextureAdded = undefined;
      }
    });
  }

  private draw(): void {
    const state = this.latest;
    const language = state?.room?.language;
    const text = labels(language);
    const gameState = state?.game?.state as CardTablePublicState | undefined;

    // Intro und Ergebnis gehören dem Spiel, nicht der Plattform.
    if (state && renderRoundScreens(this, state)) {
      return;
    }

    this.children.removeAll(true);
    this.cameras.main.setBackgroundColor(tokens().color.background);

    if (!gameState || gameState.seats.length === 0) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, text.waiting, {
          fontFamily: theme.body,
          fontSize: "28px",
          color: theme.text
        })
        .setOrigin(0.5);
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = Math.min(340, Math.max(260, width * 0.26));
    const panelX = width - panelWidth - 22;
    const tableWidth = panelX - 44;

    this.drawTable(gameState, 22, 18, tableWidth, height - 36, language);
    this.drawPanel(gameState, panelX, 18, panelWidth, height - 36, language, state?.game?.message);
  }

  private drawTable(
    state: CardTablePublicState,
    x: number,
    y: number,
    width: number,
    height: number,
    language?: SupportedLanguage
  ): void {
    this.add
      .rectangle(x + width / 2, y + height / 2, width, height, felt, 1)
      .setStrokeStyle(6, feltEdge, 1);
    this.add
      .rectangle(x + width / 2, y + height / 2, width - 26, height - 26, felt, 1)
      .setStrokeStyle(2, 0xffffff, 0.12);

    this.drawSeats(state, x + 26, y + 26, width - 52);
    this.drawStacks(state, x + 26, y + height * 0.5, width - 52, height, language);
    this.drawHostActions(state, x + 26, y + height - 84, width - 52);
  }

  /**
   * Zeichnet alle Tischstapel nebeneinander: verdeckte Stapel als Kartenrücken
   * mit Zahl, offene Stapel als aufgefächerte Karten. So passen Ablage, Stich,
   * offene Tischkarten und mehrere Farbreihen in dieselbe Fläche.
   */
  private drawStacks(
    state: CardTablePublicState,
    x: number,
    centerY: number,
    width: number,
    tableHeight: number,
    language?: SupportedLanguage
  ): void {
    const text = labels(language);
    const stacks = state.stacks;

    if (stacks.length === 0) {
      return;
    }

    const gap = 26;
    const maxHeight = Math.min(210, tableHeight * 0.36);
    const visibleCards = (stack: CardTablePublicState["stacks"][number]): number =>
      stack.faceDown ? 1 : Math.max(1, Math.min(3, stack.cards.length));
    const slotUnits = stacks.reduce(
      (total, stack) => total + 0.71 * (1 + (visibleCards(stack) - 1) * 0.5),
      0
    );
    const usableWidth = width - gap * (stacks.length - 1);
    const cardHeight = Math.max(78, Math.min(maxHeight, usableWidth / Math.max(0.71, slotUnits)));
    const cardWidth = cardHeight * 0.71;
    const slotWidth = (stack: CardTablePublicState["stacks"][number]): number =>
      cardWidth * (1 + (visibleCards(stack) - 1) * 0.5);
    const totalWidth =
      stacks.reduce((total, stack) => total + slotWidth(stack), 0) + gap * (stacks.length - 1);
    let cursor = x + Math.max(0, (width - totalWidth) / 2);

    this.add
      .text(x + width / 2, centerY - cardHeight / 2 - 34, `${text.deck}: ${state.deckLabel}`, {
        fontFamily: theme.body,
        fontSize: "16px",
        color: "#dfe9df"
      })
      .setOrigin(0.5);

    for (const stack of stacks) {
      const slot = slotWidth(stack);
      this.drawStack(state, stack, cursor + slot / 2, centerY, cardWidth, cardHeight);
      cursor += slot + gap;
    }
  }

  private drawStack(
    state: CardTablePublicState,
    stack: CardTablePublicState["stacks"][number],
    centerX: number,
    centerY: number,
    cardWidth: number,
    cardHeight: number
  ): void {
    if (stack.faceDown) {
      const backKey = ensureCardBackTexture(this, state.backStyle);
      const layers = stack.count > 0 ? Math.min(4, Math.max(1, Math.ceil(stack.count / 8))) : 0;

      if (layers === 0) {
        this.add
          .rectangle(centerX, centerY, cardWidth, cardHeight, 0x3c5748, 1)
          .setStrokeStyle(2, 0xfffbf4, 0.25);
      }

      for (let index = layers - 1; index >= 0; index -= 1) {
        const offset = index * 4;

        if (backKey) {
          this.add
            .image(centerX + offset, centerY - offset, backKey)
            .setDisplaySize(cardWidth, cardHeight);
        } else {
          this.add
            .rectangle(centerX + offset, centerY - offset, cardWidth, cardHeight, 0x8d5f4a, 1)
            .setStrokeStyle(2, 0xfffbf4, 0.8);
        }
      }
    } else if (stack.cards.length === 0) {
      this.add
        .rectangle(centerX, centerY, cardWidth, cardHeight, 0x3c5748, 1)
        .setStrokeStyle(2, 0xfffbf4, 0.25);
    } else {
      const cards = stack.cards.slice(0, 3);
      const step = cardWidth * 0.5;
      const left = centerX - ((cards.length - 1) * step) / 2;

      for (let index = cards.length - 1; index >= 0; index -= 1) {
        const card = cards[index] as CardTableCardState;
        this.drawCard(
          card,
          left + index * step,
          centerY,
          cardWidth,
          cardHeight,
          index === 0 ? 1 : 0.85,
          index === 0 && stack.kind !== "zone"
        );
      }
    }

    this.add
      .text(centerX, centerY + cardHeight / 2 + 20, `${stack.label}: ${stack.count}`, {
        fontFamily: theme.body,
        fontSize: "17px",
        color: "#f3ece0"
      })
      .setOrigin(0.5);
  }

  private drawSeats(state: CardTablePublicState, x: number, y: number, width: number): void {
    const seats = state.seats;
    const gap = 12;
    const seatWidth = Math.min(230, (width - gap * (seats.length - 1)) / Math.max(1, seats.length));
    const seatHeight = 96;
    const totalWidth = seatWidth * seats.length + gap * (seats.length - 1);
    let seatX = x + (width - totalWidth) / 2;

    for (const seat of seats) {
      this.drawSeat(state, seat, seatX, y, seatWidth, seatHeight);
      seatX += seatWidth + gap;
    }
  }

  private drawSeat(
    state: CardTablePublicState,
    seat: CardTableSeatState,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    this.add
      .rectangle(x + width / 2, y + height / 2, width, height, panelFill, seat.isActive ? 0.94 : 0.72)
      .setStrokeStyle(seat.isActive ? 3 : 1, seat.isActive ? hex(theme.accent) : 0xffffff, seat.isActive ? 1 : 0.16);

    this.add
      .rectangle(x + 14, y + height / 2, 8, height - 24, hex(seat.color), seat.connected ? 1 : 0.35)
      .setOrigin(0.5);

    this.add
      .text(x + 28, y + 12, seat.name, {
        fontFamily: theme.display,
        fontSize: "19px",
        color: seat.connected ? theme.text : theme.muted
      })
      .setOrigin(0, 0);

    this.add
      .text(x + 28, y + 36, `${seat.handCount}`, {
        fontFamily: theme.display,
        fontSize: "28px",
        color: theme.text
      })
      .setOrigin(0, 0);

    if (seat.statusLabel) {
      this.add
        .text(x + 28, y + height - 24, seat.statusLabel, {
          fontFamily: theme.body,
          fontSize: "15px",
          color: theme.accent
        })
        .setOrigin(0, 0);
    }

    this.drawMiniHand(state, seat, x + width - 18, y + height - 18);
  }

  private drawMiniHand(
    state: CardTablePublicState,
    seat: CardTableSeatState,
    right: number,
    bottom: number
  ): void {
    const backKey = ensureCardBackTexture(this, state.backStyle);
    const shown = Math.min(6, seat.handCount);
    const cardWidth = 24;
    const cardHeight = 34;
    const step = 11;

    for (let index = 0; index < shown; index += 1) {
      const cardX = right - index * step;
      const cardY = bottom - cardHeight / 2;

      if (backKey) {
        this.add.image(cardX, cardY, backKey).setDisplaySize(cardWidth, cardHeight).setOrigin(1, 0.5);
      } else {
        this.add
          .rectangle(cardX, cardY, cardWidth, cardHeight, 0x8d5f4a, 1)
          .setStrokeStyle(1, 0xfffbf4, 0.8)
          .setOrigin(1, 0.5);
      }
    }
  }

  private drawCard(
    card: CardTableCardState,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha: number,
    highlight: boolean
  ): void {
    const key = ensureCardTexture(this, card);

    if (key) {
      const image = this.add.image(x, y, key).setDisplaySize(width, height).setAlpha(alpha);

      if (highlight) {
        this.add
          .rectangle(x, y, width + 10, height + 10, 0x000000, 0)
          .setStrokeStyle(3, hex(theme.accent), 0.9);
        image.setDepth(1);
      }

      return;
    }

    this.add
      .rectangle(x, y, width, height, 0xfffbf4, alpha)
      .setStrokeStyle(2, highlight ? hex(theme.accent) : 0xded5c7, 1);
    this.add
      .text(x, y, `${card.rankLabel}\n${card.suitSymbol}`, {
        fontFamily: theme.display,
        fontSize: `${Math.floor(width * 0.32)}px`,
        color: "#24313a",
        align: "center"
      })
      .setOrigin(0.5)
      .setAlpha(alpha);
  }

  private drawHostActions(
    state: CardTablePublicState,
    x: number,
    y: number,
    width: number
  ): void {
    const actions = state.hostActions;

    if (actions.length === 0) {
      return;
    }

    const gap = 12;
    const buttonWidth = Math.min(210, (width - gap * (actions.length - 1)) / actions.length);
    const buttonHeight = 52;
    const totalWidth = buttonWidth * actions.length + gap * (actions.length - 1);
    let buttonX = x + (width - totalWidth) / 2;

    for (const action of actions) {
      this.drawHostActionButton(action, buttonX, y, buttonWidth, buttonHeight);
      buttonX += buttonWidth + gap;
    }
  }

  private drawHostActionButton(
    action: CardTableActionState,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const fill =
      action.kind === "primary"
        ? hex(theme.accent)
        : action.kind === "danger"
          ? hex(theme.danger)
          : panelFill;
    const background = this.add
      .rectangle(x + width / 2, y + height / 2, width, height, fill, action.enabled ? 0.96 : 0.4)
      .setStrokeStyle(2, 0xfffbf4, action.enabled ? 0.85 : 0.3);

    this.add
      .text(x + width / 2, y + height / 2, action.label, {
        fontFamily: theme.display,
        fontSize: "20px",
        color: "#fffbf4"
      })
      .setOrigin(0.5)
      .setAlpha(action.enabled ? 1 : 0.55);

    if (!action.enabled) {
      return;
    }

    const zone = this.add
      .zone(x, y, width, height)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    zone.on("pointerover", () => background.setStrokeStyle(3, 0xfffbf4, 1));
    zone.on("pointerout", () => background.setStrokeStyle(2, 0xfffbf4, 0.85));
    zone.on("pointerdown", () => {
      this.client?.sendGameHostAction?.(cardTableManifest.id, {
        type: "card-table:host-action",
        actionId: action.id
      });
    });
  }

  private drawPanel(
    state: CardTablePublicState,
    x: number,
    y: number,
    width: number,
    height: number,
    language: SupportedLanguage | undefined,
    message: string | undefined
  ): void {
    const text = labels(language);

    this.add
      .rectangle(x + width / 2, y + height / 2, width, height, hex(tokens().color.surface), 1)
      .setStrokeStyle(1, hex(tokens().color.line), 1);

    this.add
      .text(x + 20, y + 20, state.title, {
        fontFamily: theme.display,
        fontSize: "34px",
        color: theme.text
      })
      .setOrigin(0, 0);

    this.add
      .text(x + 20, y + 66, state.deckLabel, {
        fontFamily: theme.body,
        fontSize: "16px",
        color: theme.muted
      })
      .setOrigin(0, 0);

    const turnLine = state.gameOver
      ? `${text.winner}: ${state.winnerName ?? "-"}`
      : `${text.turn}: ${state.activePlayerName ?? "-"}`;

    this.add
      .text(x + 20, y + 100, turnLine, {
        fontFamily: theme.display,
        fontSize: "23px",
        color: state.gameOver ? theme.success : theme.accent
      })
      .setOrigin(0, 0);

    this.add
      .text(
        x + 20,
        y + 134,
        `${text.direction}: ${state.direction === 1 ? "→" : "←"}    #${state.turnNumber}`,
        {
          fontFamily: theme.body,
          fontSize: "16px",
          color: theme.muted
        }
      )
      .setOrigin(0, 0);

    let cursor = y + 168;

    if (state.conditionLabel) {
      this.add
        .rectangle(x + width / 2, cursor + 22, width - 40, 44, hex(theme.accent), 0.16)
        .setStrokeStyle(1, hex(theme.accent), 0.6);
      this.add
        .text(x + 20 + 12, cursor + 22, `${state.conditionSymbol ?? ""} ${state.conditionLabel}`.trim(), {
          fontFamily: theme.display,
          fontSize: "20px",
          color: theme.text
        })
        .setOrigin(0, 0.5);
      cursor += 60;
    }

    if (message) {
      this.add
        .text(x + 20, cursor, message, {
          fontFamily: theme.body,
          fontSize: "17px",
          color: state.lastError ? theme.danger : theme.text,
          lineSpacing: 5,
          wordWrap: { width: width - 40 }
        })
        .setOrigin(0, 0);
      cursor += 60;
    }

    this.add
      .text(x + 20, cursor, text.log, {
        fontFamily: theme.display,
        fontSize: "20px",
        color: theme.text
      })
      .setOrigin(0, 0);
    cursor += 32;

    const maxEntries = Math.max(0, Math.floor((y + height - cursor - 20) / 34));

    for (const entry of state.log.slice(0, maxEntries)) {
      const line = entry.playerName ? `${entry.playerName} ${entry.text}` : entry.text;

      this.add
        .text(x + 20, cursor, line, {
          fontFamily: theme.body,
          fontSize: "16px",
          color: theme.muted,
          wordWrap: { width: width - 40 }
        })
        .setOrigin(0, 0);
      cursor += 34;
    }
  }
}

export const hostGame = {
  id: cardTableManifest.id,
  displayName: cardTableManifest.displayName,
  sceneKey: cardTableManifest.hostView,
  scene: CardTableHostScene
} as const;
