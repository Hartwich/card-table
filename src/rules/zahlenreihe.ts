import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { advanceTurn, createCardTable, drawCards, handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type {
  CardTableActionState,
  CardTableRuleSectionState,
  CardTableStackState
} from "../protocol.js";
import { bestOf } from "../bots/tactics.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  readNumber,
  withError,
  writeExtra,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Zahlenreihe.
 *
 * Vier Farbreihen von 1 bis 20. Eröffnet wird jede Reihe mit der Elf, danach
 * wird an beiden Enden um genau eins verlängert. Wer am Zug ist, legt so viele
 * Karten an, wie er will, mindestens eine. Wer gar nicht anlegen kann, zieht
 * einzeln bis zu drei Karten; die erste passende beendet nach dem Legen den Zug.
 *
 * Zeigt auf dem Fundament, wie ein Regelwerk mehrere offene Ablagereihen statt
 * eines einzelnen Ablagestapels benutzt und wie ein Zug aus mehreren Aktionen
 * bestehen kann.
 */

const startRank = 11;
const laidKey = "laidThisTurn";
const openingKey = "openingCardId";

function openingCard(state: CardGameState): string | undefined {
  for (const suit of ["rot", "gelb", "gruen", "blau"]) {
    const id = Object.values(state.table.hands).flat().find((id) => {
      const card = state.table.cards[id];
      return card?.suitId === suit && card.rankId === "11";
    });
    if (id) return id;
  }
  return undefined;
}

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Zahlenreihe: Jede Farbreihe beginnt mit der 11, danach legst du nach oben oder unten an.",
    draw: "Ziehen",
    done: "Fertig",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    needEleven: "Diese Reihe beginnt mit der 11.",
    noFit: "Passt an keinem Ende der Reihe.",
    canStillPlay: "Du kannst noch anlegen.",
    nothingYet: "Leg an oder zieh eine Karte.",
    plays: "legt",
    opens: "eröffnet",
    drew: "zieht eine Karte",
    passed: "beendet den Zug",
    empty: "Der Stapel ist leer.",
    noDraw: "kann nicht ziehen und setzt aus",
    wins: "hat alle Karten abgelegt.",
    startHint: "Start: 11",
    next: "Anlegen",
    complete: "vollständig",
    skip: "Aussetzen",
    playable: "Spielbar",
    lastCard: "letzte Karte",
    end: "Runde beenden",
    ended: "Der Host hat die Runde beendet."
  },
  en: {
    intro: "Number Rows: every colour row starts with the 11, then you extend it up or down.",
    draw: "Draw",
    done: "Done",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    needEleven: "This row starts with the 11.",
    noFit: "Does not fit either end of the row.",
    canStillPlay: "You can still play a card.",
    nothingYet: "Play a card or draw one.",
    plays: "plays",
    opens: "opens",
    drew: "draws a card",
    passed: "ends the turn",
    empty: "The pile is empty.",
    noDraw: "cannot draw and passes",
    wins: "played their last card.",
    startHint: "Start: 11",
    next: "Next",
    complete: "complete",
    skip: "Pass",
    playable: "Playable",
    lastCard: "last card",
    end: "End round",
    ended: "The host ended the round."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function rankValue(card: CardInstance): number {
  const value = Number.parseInt(card.rankId, 10);
  return Number.isFinite(value) ? value : 0;
}

function rowCards(state: CardGameState, suitId: string): CardInstance[] {
  return (state.table.zones[suitId] ?? [])
    .map((cardId) => state.table.cards[cardId])
    .filter((card): card is CardInstance => Boolean(card));
}

/** Tiefstes und höchstes Ende einer Farbreihe. */
function rowEnds(state: CardGameState, suitId: string): { low: number; high: number } | null {
  const cards = rowCards(state, suitId);

  if (cards.length === 0) {
    return null;
  }

  const values = cards.map(rankValue);

  return { low: Math.min(...values), high: Math.max(...values) };
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function playableCount(state: CardGameState, context: CardRulesetContext, playerId: string): number {
  return handOf(state.table, playerId).filter(
    (cardId) => numberRowsRuleset.canPlayCard(state, context, playerId, cardId).allowed
  ).length;
}

/** Gibt an den nächsten Spieler ab und setzt die Zugzähler zurück. */
function endTurn(state: CardGameState, context: CardRulesetContext): CardGameState {
  return writeExtra(
    {
      ...state,
      table: advanceTurn(state.table),
      drawnThisTurn: 0,
      turnNumber: state.turnNumber + 1,
      updatedAt: context.now
    },
    { [laidKey]: 0 }
  );
}

export const numberRowsRuleset: CardRuleset = {
  id: "zahlenreihe",
  label: { de: "Zahlenreihe", en: "Number Rows" },
  defaultDeckId: "zahlen-80",
  fixedDeckId: "zahlen-80",
  defaultHandSize: 10,
  /** Zu zweit spielbar. */
  minSeats: 2,
  openStartCard: false,
  turnBased: true,

  handSizeFor({ playerCount }) {
    return playerCount <= 3 ? 20 : playerCount === 4 ? 15 : playerCount === 5 ? 12 : 10;
  },

  setupRound(state, context) {
    // A deal without an eleven is invalid: reshuffle before choosing the starter.
    let first = openingCard(state);
    while (!first) {
      state = { ...state, table: createCardTable({ deck: context.deck,
        playerIds: state.table.turnOrder, handSize: state.handSize }) };
      first = openingCard(state);
    }
    const zones: Record<string, string[]> = { ...state.table.zones };

    for (const suit of context.deck.suits) {
      zones[suit.id] = [];
    }

    return { ...state, table: { ...state.table, zones, direction: 1,
      activeIndex: state.table.turnOrder.findIndex((id) => handOf(state.table, id).includes(first)) },
      extra: { ...state.extra, [laidKey]: 0, [openingKey]: first } };
  },

  rules(context): CardTableRuleSectionState[] {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: ["Be the first to play every card in your hand."]
          },
          {
            title: "The deck",
            lines: [
              "Four colours, each with the numbers 1 to 20.",
              "Every colour builds its own row on the table; each colour has exactly one eleven.",
              "Deal 20 cards each for 2–3 players, 15 for 4, 12 for 5 and 10 for 6. The rest is the draw pile."
            ]
          },
          {
            title: "Opening a row",
            lines: [
              "An empty row can only be started with the 11 of that colour.",
              "The holder of the red eleven starts; otherwise yellow, green, then blue has priority. Redeal if nobody holds an eleven.",
              "After playing the starting eleven, the next player takes their turn.",
              "Until a row is open, no other card of that colour can be played."
            ]
          },
          {
            title: "Extending a row",
            lines: [
              "A row grows at both ends, always by exactly one.",
              "A row showing 9 to 13 accepts the 8 and the 14 — nothing else.",
              "Rows stop naturally at 1 and at 20."
            ]
          },
          {
            title: "Your turn",
            lines: [
              "Play at least one matching card. You may play more or press Done to keep the rest.",
              "If nothing fits, draw cards one at a time, up to three. A matching drawn card must be played and immediately ends your turn.",
              "With an empty draw pile a player who cannot play simply passes."
            ]
          },
          {
            title: "End of the round",
            lines: ["The first empty hand ends the round. Everyone loses points equal to the sum of their remaining cards; the winner loses none. Highest total (fewest penalties) wins the series; ties are shared."]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: ["Lege als Erster alle Karten deiner Hand ab."]
          },
          {
            title: "Das Blatt",
            lines: [
              "Vier Farben mit den Zahlen 1 bis 20.",
              "Jede Farbe bildet eine eigene Reihe und enthält genau eine Elf.",
              "Bei 2–3 Spielern erhält jeder 20 Karten, bei 4 Spielern 15, bei 5 Spielern 12 und bei 6 Spielern 10. Der Rest bildet den Nachziehstapel."
            ]
          },
          {
            title: "Eine Reihe eröffnen",
            lines: [
              "Eine leere Reihe wird ausschließlich mit der 11 dieser Farbe eröffnet.",
              "Die rote Elf beginnt; fehlt sie auf allen Händen, gilt Gelb vor Grün vor Blau. Ohne Elf auf einer Hand wird neu gemischt und ausgeteilt.",
              "Nach der Start-Elf ist sofort der nächste Spieler dran.",
              "Solange eine Reihe nicht offen ist, kann keine andere Karte dieser Farbe gelegt werden."
            ]
          },
          {
            title: "Anlegen",
            lines: [
              "Eine Reihe wächst an beiden Enden, immer um genau eins.",
              "An eine Reihe von 9 bis 13 passen die 8 und die 14 — sonst nichts.",
              "Bei 1 und 20 ist eine Reihe zu Ende."
            ]
          },
          {
            title: "Dein Zug",
            lines: [
              "Lege mindestens eine passende Karte. Danach darfst du weitere legen oder mit „Fertig“ Karten zurückhalten.",
              "Passt nichts, ziehst du einzeln bis zu drei Karten. Eine passende gezogene Karte musst du sofort legen; damit endet dein Zug.",
              "Ist der Nachziehstapel leer, setzt aus, wer nicht anlegen kann."
            ]
          },
          {
            title: "Rundenende",
            lines: ["Die erste leere Hand beendet die Runde. Jeder erhält die Summe seiner übrigen Karten als Minuspunkte; der Sieger erhält keine. Der höchste Serienstand (wenigste Minuspunkte) gewinnt; Gleichstände teilen den Sieg."]
          }
        ];
  },

  introMessage(context) {
    return words(context).intro as string;
  },

  canPlayCard(state, context, playerId, cardId) {
    const text = words(context);

    if (!handOf(state.table, playerId).includes(cardId)) {
      return { allowed: false, hint: text.notInHand as string };
    }

    if (!isActive(state, playerId)) {
      return { allowed: false, hint: text.notYourTurn as string };
    }

    const card = state.table.cards[cardId];

    if (typeof state.extra[openingKey] === "string" && cardId !== state.extra[openingKey]) {
      return { allowed: false, hint: context.language === "en" ? "Play the starting eleven first." : "Lege zuerst die Start-Elf." };
    }

    if (!card || !card.suitId) {
      return { allowed: false };
    }

    const ends = rowEnds(state, card.suitId);
    const value = rankValue(card);

    if (!ends) {
      return value === startRank
        ? { allowed: true }
        : { allowed: false, hint: text.needEleven as string };
    }

    return value === ends.low - 1 || value === ends.high + 1
      ? { allowed: true }
      : { allowed: false, hint: text.noFit as string };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = numberRowsRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.noFit as string));
    }

    const card = state.table.cards[cardId] as CardInstance;
    const suitId = card.suitId as string;
    const ends = rowEnds(state, suitId);
    const value = rankValue(card);
    const face = toCardFace(context.deck, card);
    const table = moveCard(
      state.table,
      cardId,
      { kind: "zone", zoneId: suitId },
      !ends || value < ends.low ? "top" : "bottom"
    );

    const played = appendLog(
      clearError(
        writeExtra({ ...state, table, updatedAt: context.now }, { [laidKey]: readNumber(state, laidKey) + 1, [openingKey]: null })
      ),
      playerName(context, playerId),
      `${ends ? text.plays : text.opens} ${face.rankLabel} ${face.suitSymbol}`
    );

    if (handOf(table, playerId).length === 0) {
      return finishGame(
        played,
        playerId,
        playerName(context, playerId),
        `${playerName(context, playerId)} ${text.wins}`
      );
    }

    if (state.extra[openingKey] || state.drawnThisTurn > 0) return endTurn(played, context);
    // Nach mindestens einer Karte dürfen weitere gelegt oder zurückgehalten werden.
    return playableCount(played, context, playerId) > 0 ? played : endTurn(played, context);
  },

  drawCard(state, context, playerId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    if (playableCount(state, context, playerId) > 0) {
      return withError(state, text.canStillPlay as string);
    }

    if (readNumber(state, laidKey) > 0 || state.drawnThisTurn >= 3) {
      return endTurn(state, context);
    }

    const result = drawCards(state.table, playerId, 1);

    if (result.exhausted) {
      return appendLog(clearError(endTurn(state, context)), playerName(context, playerId), text.noDraw as string);
    }

    const drawn = clearError({
      ...state,
      table: result.state,
      drawnThisTurn: state.drawnThisTurn + 1,
      updatedAt: context.now
    });

    if (playableCount(drawn, context, playerId) > 0) {
      return appendLog(drawn, playerName(context, playerId), text.drew as string);
    }

    return drawn.drawnThisTurn >= 3 || drawn.table.drawPile.length === 0
      ? appendLog(endTurn(drawn, context), playerName(context, playerId), `${text.drew} - ${text.passed}`)
      : appendLog(drawn, playerName(context, playerId), text.drew as string);
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (actionId !== "pass" || !isActive(state, playerId)) {
      return state;
    }

    if (readNumber(state, laidKey) === 0) {
      return withError(state, text.nothingYet as string);
    }

    return appendLog(clearError(endTurn(state, context)), playerName(context, playerId), text.passed as string);
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const text = words(context);
    const active = isActive(state, playerId) && state.phase === "playing" && !state.gameOver;
    const canPlay = active && playableCount(state, context, playerId) > 0;

    return [
      {
        id: "draw",
        label: (state.table.drawPile.length === 0 ? text.skip : text.draw) as string,
        kind: "primary",
        enabled: active && !canPlay && state.drawnThisTurn < 3 && readNumber(state, laidKey) === 0,
        hint: canPlay ? (text.canStillPlay as string) : undefined
      },
      {
        id: "pass",
        label: text.done as string,
        kind: "secondary",
        enabled: active && readNumber(state, laidKey) > 0
      }
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    const text = words(context);
    const enabled = state.phase === "playing" && !state.gameOver;

    const active = state.table.turnOrder[state.table.activeIndex] ?? "";
    return [
      ...numberRowsRuleset.controllerActions(state, context, active),
      { id: "end", label: text.end as string, kind: "danger", enabled }
    ];
  },

  runHostAction(state, context, actionId) {
    const active = state.table.turnOrder[state.table.activeIndex];

    if (actionId === "draw" && active) {
      return numberRowsRuleset.drawCard(state, context, active);
    }

    if (actionId === "pass" && active) {
      return numberRowsRuleset.runAction(state, context, active, "pass");
    }

    if (actionId === "end") {
      return finishGame(state, null, null, words(context).ended as string);
    }

    return state;
  },

  choiceForCard() {
    return undefined;
  },

  tableStacks(state, context): CardTableStackState[] {
    return context.deck.suits.map((suit) => {
      const cards = rowCards(state, suit.id).sort((left, right) => rankValue(left) - rankValue(right));
      const shown = cards.length > 1 ? [cards[0] as CardInstance, cards[cards.length - 1] as CardInstance] : cards;
      const ends = rowEnds(state, suit.id);
      const next = ends ? [ends.low > 1 ? ends.low - 1 : null, ends.high < 20 ? ends.high + 1 : null].filter((value) => value !== null) : [startRank];
      const text = words(context);
      const hint = next.length ? `${text.next}: ${next.join(" / ")}` : text.complete;

      return {
        id: suit.id,
        label: `${suit.symbol} ${suit.label} · ${hint}`,
        kind: "zone" as const,
        layout: "spread" as const,
        capacity: 2,
        count: cards.length,
        cards: shown.map((card) => toCardFace(context.deck, card)),
        faceDown: false
      };
    });
  },

  condition(state, context) {
    const opening = state.extra[openingKey];
    if (typeof opening === "string" && state.table.cards[opening]) {
      const face = toCardFace(context.deck, state.table.cards[opening]);
      return { label: `Start: ${face.rankLabel} ${face.suitLabel}`, symbol: face.suitSymbol, color: face.color };
    }
    const opened = context.deck.suits.some((suit) => rowCards(state, suit.id).length > 0);

    return opened ? undefined : { label: words(context).startHint as string, color: "neutral" };
  },

  privateNote(state, context, playerId) {
    const drawn = isActive(state, playerId) && state.drawnThisTurn > 0
      ? ` · ${context.language === "en" ? "Drawn" : "Gezogen"}: ${state.drawnThisTurn}/3` : "";
    return `${words(context).playable}: ${playableCount(state, context, playerId)}${drawn}`;
  },

  seatStatus(state, context, playerId) {
    return handOf(state.table, playerId).length === 1 ? (words(context).lastCard as string) : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    if (!state.winnerPlayerId) return [];
    return state.table.turnOrder.map((playerId) => ({ playerId,
      delta: -handOf(state.table, playerId).reduce((sum, id) => sum + rankValue(state.table.cards[id] as CardInstance), 0) || 0,
      reason: "Zahlenreihe" }));
  },

  /**
   * KI-Zug.
   *
   * Ein Zug besteht aus beliebig vielen Karten, also legt der Bot so lange, wie
   * etwas passt - Ziel ist die leere Hand. Er beginnt mit den Karten, die
   * direkt an ein Reihenende anschließen, damit er sich keine Lücke aufreißt,
   * in die er später selbst nicht mehr hineinkommt.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const playable = handOf(state.table, playerId).filter(
      (cardId) => numberRowsRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    const cardId = bestOf(playable, (entry) => {
      const card = state.table.cards[entry];

      if (!card?.suitId) {
        return -100;
      }

      const ends = rowEnds(state, card.suitId);

      if (!ends) {
        // Eine Reihe eröffnen ist immer gut: sie schafft neue Anlegeplätze.
        return 10;
      }

      const value = rankValue(card);

      return -Math.min(Math.abs(value - ends.low), Math.abs(value - ends.high));
    });

    if (cardId) {
      return { kind: "play", cardId };
    }

    if (readNumber(state, laidKey) === 0 && state.drawnThisTurn < 3) {
      return { kind: "draw" };
    }

    return { kind: "action", actionId: "pass" };
  }
};
