import Phaser from "phaser";
import { cardTableManifest } from "../manifest.js";
import type { CardTablePublicState } from "../protocol.js";
import { tokens } from "./platformTheme.js";

/**
 * Runden-Intro und Ergebnis.
 *
 * Die Plattform bringt keine eigenen Zwischenbildschirme mit: Alles, was nach
 * dem Rundenstart zu sehen ist, gehört dem Spiel. Beide Screens werden hier
 * komplett neu gezeichnet, damit die Szene keine Zustandsreste behält.
 */

const introPhases = new Set(["round_intro", "countdown"]);
const resultPhases = new Set(["result", "scoreboard", "finished"]);

interface RoundScreenStateLike {
  game?: {
    phase?: string;
    message?: string;
    state?: unknown;
  } | null;
  room?: {
    language?: "de" | "en";
    players?: Array<{ id: string; name: string; color: string; connected: boolean }>;
  } | null;
  scoreboard?: {
    entries: Array<{ playerId: string; delta: number; total: number }>;
  } | null;
}

const hex = (color: string): number => Number.parseInt(color.replace("#", ""), 16);

function labels(language?: "de" | "en") {
  const en = language === "en";

  return {
    getReady: en ? "Shuffling the deck" : "Die Karten werden gemischt",
    players: en ? "Players" : "Spieler",
    deck: en ? "Deck" : "Deck",
    result: en ? "Round result" : "Rundenergebnis",
    winner: en ? "Winner" : "Gewinner",
    noWinner: en ? "No winner this round." : "Diese Runde ohne Sieger.",
    points: en ? "pts" : "Pkt."
  };
}

function drawFrame(scene: Phaser.Scene, title: string, subtitle: string): { x: number; y: number; width: number } {
  const width = scene.scale.width;
  const height = scene.scale.height;
  const panelWidth = Math.min(760, width - 120);
  const panelX = (width - panelWidth) / 2;
  const panelY = 74;

  scene.children.removeAll(true);
  scene.cameras.main.setBackgroundColor(tokens().color.background);

  scene.add
    .rectangle(width / 2, height / 2, panelWidth, height - 140, hex(tokens().color.surface), 1)
    .setStrokeStyle(1, hex(tokens().color.line), 1);

  scene.add
    .text(width / 2, panelY + 32, title, {
      fontFamily: tokens().font.display,
      fontSize: "44px",
      color: tokens().color.text
    })
    .setOrigin(0.5, 0);

  scene.add
    .text(width / 2, panelY + 96, subtitle, {
      fontFamily: tokens().font.body,
      fontSize: "20px",
      color: tokens().color.muted,
      align: "center",
      wordWrap: { width: panelWidth - 80 }
    })
    .setOrigin(0.5, 0);

  return { x: panelX, y: panelY + 150, width: panelWidth };
}

/** Zeichnet Intro oder Ergebnis und meldet, ob der Tisch übersprungen wird. */
export function renderRoundScreens(scene: Phaser.Scene, state: RoundScreenStateLike): boolean {
  const phase = state.game?.phase ?? "";
  const language = state.room?.language;
  const text = labels(language);
  const gameState = state.game?.state as CardTablePublicState | undefined;

  if (introPhases.has(phase)) {
    const frame = drawFrame(
      scene,
      gameState?.title ?? cardTableManifest.displayName,
      state.game?.message ?? text.getReady
    );

    scene.add
      .text(
        scene.scale.width / 2,
        frame.y,
        `${text.deck}: ${gameState?.deckLabel ?? "-"}\n${text.players}: ${gameState?.seats.length ?? state.room?.players?.length ?? 0}`,
        {
          fontFamily: tokens().font.body,
          fontSize: "22px",
          color: tokens().color.textSoft,
          align: "center",
          lineSpacing: 10
        }
      )
      .setOrigin(0.5, 0);

    return true;
  }

  if (!resultPhases.has(phase)) {
    return false;
  }

  const winnerLine = gameState?.winnerName
    ? `${text.winner}: ${gameState.winnerName}`
    : text.noWinner;
  const frame = drawFrame(scene, text.result, winnerLine);
  const names = new Map((state.room?.players ?? []).map((player) => [player.id, player]));
  const entries = [...(state.scoreboard?.entries ?? [])].sort((left, right) => right.total - left.total);
  let cursor = frame.y;

  for (const [index, entry] of entries.entries()) {
    const player = names.get(entry.playerId);
    const rowY = cursor + 26;

    scene.add
      .rectangle(scene.scale.width / 2, rowY, frame.width - 80, 46, hex(tokens().color.surfaceMuted), 1)
      .setStrokeStyle(1, hex(tokens().color.line), 1);

    scene.add
      .text(frame.x + 56, rowY, `${index + 1}. ${player?.name ?? entry.playerId}`, {
        fontFamily: tokens().font.body,
        fontSize: "21px",
        color: tokens().color.text
      })
      .setOrigin(0, 0.5);

    scene.add
      .text(
        frame.x + frame.width - 56,
        rowY,
        `${entry.total} ${text.points}${entry.delta ? `  (+${entry.delta})` : ""}`,
        {
          fontFamily: tokens().font.body,
          fontSize: "21px",
          color: entry.delta ? tokens().color.success : tokens().color.muted
        }
      )
      .setOrigin(1, 0.5);

    cursor += 54;

    if (cursor > scene.scale.height - 130) {
      break;
    }
  }

  if (entries.length === 0) {
    scene.add
      .text(scene.scale.width / 2, frame.y + 20, state.game?.message ?? "", {
        fontFamily: tokens().font.body,
        fontSize: "20px",
        color: tokens().color.muted,
        align: "center",
        wordWrap: { width: frame.width - 80 }
      })
      .setOrigin(0.5, 0);
  }

  return true;
}
