import Phaser from "phaser";
import { cardTableManifest } from "../manifest.js";
import type { CardTablePublicState } from "../protocol.js";
import { roundScreenHtml, type RoundScreenStateLike } from "./roundScreens.js";
import { cardTableLabels, cardTableStyles, renderCardTableHtml } from "./tableHtml.js";
import { bindPlatformTheme, tokens } from "./platformTheme.js";

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
      this.rulesOpen = false;
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

    root.addEventListener("click", (event) => {
      const element = event.target as HTMLElement | null;
      const panel = element?.closest("[data-card-table-panel]")?.getAttribute("data-card-table-panel");

      if (panel) {
        this.rulesOpen = panel === "rules";
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
    this.latest = state;
    this.redraw();
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
    }

    const html = screen
      ? screen
      : gameState && gameState.seats.length > 0
        ? renderCardTableHtml(gameState, state.room?.language, { rulesOpen: this.rulesOpen })
        : `<p class="ct-wait">${cardTableLabels(state.room?.language).waiting}</p>`;

    if (html === this.signature) {
      return;
    }

    this.signature = html;
    this.root.classList.toggle("is-screen", Boolean(screen) || !gameState);
    this.body.innerHTML = html;
  }
}

export const hostGame = {
  id: cardTableManifest.id,
  displayName: cardTableManifest.displayName,
  sceneKey: cardTableManifest.hostView,
  scene: CardTableHostScene
} as const;
