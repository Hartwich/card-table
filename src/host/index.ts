import Phaser from "phaser";
import { cardTableManifest } from "../manifest.js";
import type { CardTablePublicState } from "../protocol.js";
import { roundScreenHtml, type RoundScreenStateLike } from "./roundScreens.js";
import { cardTableLabels, cardTableStyles, renderCardTableHtml } from "./tableHtml.js";
import { bindPlatformTheme, tokens } from "./platformTheme.js";
import { playCardDrop, playTrickSweep, resumeTableAudio } from "./tableSounds.js";

/**
 * Der Spieltisch auf dem geteilten Bildschirm.
 *
 * Gezeichnet wird als DOM-Overlay über der Phaser-Bühne: Karten sind dasselbe
 * SVG wie auf dem Handy, Layout und Schriften kommen aus dem Plattform-Theme,
 * und die Host-Buttons sind echte Buttons. Die Szene selbst hält nur noch das
 * Overlay und das Abo auf den Raumzustand - Spiellogik steht ausschließlich im
 * Server.
 */

type SupportedLanguage = "de" | "en";

interface HostClientLike {
  subscribe(callback: (state: HostAppStateLike) => void): () => void;
  sendGameHostAction?(gameId: string, action: unknown): void;
}

interface HostAppStateLike extends RoundScreenStateLike {
  game?: {
    phase?: string;
    state?: unknown;
    message?: string;
  } | null;
  room?: {
    language?: SupportedLanguage;
    players?: Array<{ id: string; name: string; color: string; connected: boolean }>;
  } | null;
}

export class CardTableHostScene extends Phaser.Scene {
  private unsubscribe?: () => void;
  private client: HostClientLike | null = null;
  private root: HTMLDivElement | null = null;
  private body: HTMLDivElement | null = null;
  private signature = "";
  private latest: HostAppStateLike | null = null;
  private rulesOpen = false;
  private lastTrickOpen = false;
  private ghosts: HTMLDivElement | null = null;
  private previous: CardTablePublicState | null = null;
  /** Gewinner des gerade abgeräumten Stichs, bis der Redraw ihn abgeholt hat. */
  private pendingSweep: string | null = null;

  constructor() {
    super(cardTableManifest.hostView);
  }

  create(): void {
    bindPlatformTheme(this.registry);
    this.client = this.registry.get("hostClient") as HostClientLike;
    this.cameras.main.setBackgroundColor(tokens().color.background);
    this.mountOverlay();

    this.unsubscribe = this.client.subscribe((state) => this.render(state));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.root?.remove();
      this.root = null;
      this.body = null;
      this.latest = null;
      this.previous = null;
      this.pendingSweep = null;
      this.ghosts = null;
      this.rulesOpen = false;
      this.lastTrickOpen = false;
      this.signature = "";
    });
  }

  private mountOverlay(): void {
    const parent = document.getElementById("app");

    if (!parent) {
      return;
    }

    parent.style.position = "relative";

    const root = document.createElement("div");
    root.className = "ct-root";

    const style = document.createElement("style");
    style.textContent = cardTableStyles;
    root.appendChild(style);

    const body = document.createElement("div");
    body.style.display = "contents";
    root.appendChild(body);

    // Eigene Ebene für die fliegenden Karten. Sie liegt über dem Tisch und wird
    // beim Redraw nicht angefasst - deshalb überlebt eine laufende Animation
    // den nächsten Spielzug.
    const ghosts = document.createElement("div");
    ghosts.className = "ct-ghosts";
    root.appendChild(ghosts);

    root.addEventListener("click", (event) => {
      // Browser geben Audio erst nach einer Nutzeraktion frei.
      resumeTableAudio();

      const element = event.target as HTMLElement | null;
      const panel = element?.closest("[data-card-table-panel]")?.getAttribute("data-card-table-panel");

      if (panel) {
        this.rulesOpen = panel === "rules";
        this.lastTrickOpen = panel === "last-trick" ? !this.lastTrickOpen : false;
        this.redraw();
        return;
      }

      const actionId = element
        ?.closest("[data-card-table-action]")
        ?.getAttribute("data-card-table-action");

      if (!actionId) {
        return;
      }

      this.client?.sendGameHostAction?.(cardTableManifest.id, {
        type: "card-table:host-action",
        actionId
      });
    });

    parent.appendChild(root);
    this.root = root;
    this.body = body;
    this.ghosts = ghosts;
  }

  /** Übernimmt die Theme-Farben, die die Plattform im Registry hält. */
  private applyTheme(): void {
    const theme = tokens();
    const root = this.root;

    if (!root) {
      return;
    }

    root.style.setProperty("--ct-paper", theme.color.background);
    root.style.setProperty("--ct-surface", theme.color.surface);
    root.style.setProperty("--ct-surface-muted", theme.color.surfaceMuted);
    root.style.setProperty("--ct-line", theme.color.line);
    root.style.setProperty("--ct-ink", theme.color.text);
    root.style.setProperty("--ct-muted", theme.color.muted);
    root.style.setProperty("--ct-accent", theme.color.accent);
    root.style.setProperty("--ct-success", theme.color.success);
    root.style.setProperty("--ct-danger", theme.color.danger);
    root.style.setProperty("--ct-display", theme.font.display);
    root.style.setProperty("--ct-body", theme.font.body);
  }

  private render(state: HostAppStateLike): void {
    const next = state.game?.state as CardTablePublicState | undefined;

    this.reactToChange(this.previous, next ?? null);
    this.previous = next ?? null;
    this.latest = state;
    this.redraw();
  }

  /**
   * Was hat sich am Tisch geändert - und was soll man davon hören und sehen?
   *
   * Bewusst aus dem Vergleich zweier Zustände abgeleitet und nicht aus einem
   * Ereignisstrom: Der Host bekommt Zustände, keine Ereignisse, und ein
   * verpasstes Update darf höchstens ein Geräusch kosten.
   */
  private reactToChange(
    previous: CardTablePublicState | null,
    next: CardTablePublicState | null
  ): void {
    if (!next || !previous) {
      return;
    }

    const sweptTrick = (next.lastTrickSerial ?? 0) > (previous.lastTrickSerial ?? 0);

    if (sweptTrick) {
      this.pendingSweep = next.lastTrickWinnerId ?? null;
      // Sobald weitergespielt wird, verschwindet der letzte Stich wieder.
      this.lastTrickOpen = false;
      playTrickSweep();
      return;
    }

    if (next.turnNumber !== previous.turnNumber) {
      this.lastTrickOpen = false;
    }

    if (playedCardCount(next) > playedCardCount(previous)) {
      playCardDrop();
    }
  }

  /**
   * Lässt die Karten des Stichs zum Sitzplatz des Gewinners fliegen.
   *
   * Gemessen wird im alten DOM, gezeichnet in einer eigenen Ebene darüber: Der
   * Tisch darunter rendert ganz normal neu, der Stich ist dort also schon weg.
   * Ein echtes FLIP würde verlangen, dass die Kartenelemente den Redraw
   * überleben - das hieße gekeyte Diffs statt innerHTML, ein deutlich grösserer
   * Umbau für eine reine Gefälligkeit.
   */
  private flyTrickToSeat(winnerId: string): void {
    const root = this.root;
    const ghosts = this.ghosts;

    if (!root || !ghosts) {
      return;
    }

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      return;
    }

    const seat = root.querySelector(`[data-seat="${cssEscape(winnerId)}"]`);
    const cards = [...root.querySelectorAll('[data-stack] .ct-fan')];

    if (!seat || cards.length === 0) {
      return;
    }

    const frame = root.getBoundingClientRect();
    const target = seat.getBoundingClientRect();
    const targetX = target.left + target.width / 2 - frame.left;
    const targetY = target.top + target.height / 2 - frame.top;

    cards.forEach((card, index) => {
      const box = card.getBoundingClientRect();
      const ghost = document.createElement("div");

      ghost.className = "ct-ghost";
      ghost.style.left = `${box.left - frame.left}px`;
      ghost.style.top = `${box.top - frame.top}px`;
      ghost.style.width = `${box.width}px`;
      ghost.style.height = `${box.height}px`;
      ghost.innerHTML = card.innerHTML;
      ghosts.appendChild(ghost);

      const shiftX = targetX - (box.left - frame.left) - box.width / 2;
      const shiftY = targetY - (box.top - frame.top) - box.height / 2;

      // Ein Frame Vorlauf, damit der Browser den Startzustand übernimmt.
      requestAnimationFrame(() => {
        ghost.style.transition = `transform 460ms cubic-bezier(.34,.06,.2,1) ${index * 40}ms, opacity 460ms linear ${index * 40}ms`;
        ghost.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(.34) rotate(${(index - 1.5) * 4}deg)`;
        ghost.style.opacity = "0";
      });

      window.setTimeout(() => ghost.remove(), 700 + index * 40);
    });
  }

  private redraw(): void {
    const state = this.latest;

    if (!this.root || !this.body || !state) {
      return;
    }

    this.applyTheme();

    const gameState = state.game?.state as CardTablePublicState | undefined;
    const screen = roundScreenHtml(state);

    if (screen) {
      // Zwischen den Runden gibt es nichts nachzulesen.
      this.rulesOpen = false;
      this.lastTrickOpen = false;
    }

    const html = screen
      ? screen
      : gameState && gameState.seats.length > 0
        ? renderCardTableHtml(gameState, state.room?.language, {
            rulesOpen: this.rulesOpen,
            lastTrickOpen: this.lastTrickOpen
          })
        : `<p class="ct-wait">${cardTableLabels(state.room?.language).waiting}</p>`;

    if (html === this.signature) {
      return;
    }

    // Erst messen und die Klone setzen, dann den Tisch neu zeichnen - danach
    // wären die Karten des Stichs nicht mehr da.
    const sweep = this.pendingSweep;
    this.pendingSweep = null;

    if (sweep) {
      this.flyTrickToSeat(sweep);
    }

    this.signature = html;
    this.root.classList.toggle("is-screen", Boolean(screen) || !gameState);
    this.body.innerHTML = html;
  }
}

/** Karten, die offen auf dem Tisch liegen - ohne die Stapel auf Anforderung. */
function playedCardCount(state: CardTablePublicState): number {
  return state.stacks
    .filter((stack) => !stack.onDemand && stack.kind !== "draw")
    .reduce((sum, stack) => sum + stack.count, 0);
}

/** Spieler-Ids sind frei gewählt - im Selektor müssen sie escaped werden. */
function cssEscape(value: string): string {
  const api = (window as unknown as { CSS?: { escape?: (input: string) => string } }).CSS;

  return api?.escape ? api.escape(value) : value.replace(/["\\]/g, "\\$&");
}

export const hostGame = {
  id: cardTableManifest.id,
  displayName: cardTableManifest.displayName,
  sceneKey: cardTableManifest.hostView,
  scene: CardTableHostScene
} as const;
