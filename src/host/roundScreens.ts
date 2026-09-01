import { cardTableManifest } from "../manifest.js";
import type { CardTablePublicState } from "../protocol.js";
import { escapeHtml } from "./cardHtml.js";

/**
 * Runden-Intro und Ergebnis.
 *
 * Die Plattform bringt keine eigenen Zwischenbildschirme mit: Alles, was nach
 * dem Rundenstart zu sehen ist, gehört dem Spiel. Beide Screens sind hier
 * einfaches HTML und liegen im selben Overlay wie der Spieltisch.
 */

const introPhases = new Set(["round_intro", "countdown"]);
const resultPhases = new Set(["result", "scoreboard", "finished"]);

export interface RoundScreenStateLike {
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

function labels(language?: "de" | "en") {
  const en = language === "en";

  return {
    shuffling: en ? "The deck is being shuffled" : "Die Karten werden gemischt",
    players: en ? "Players" : "Spieler",
    deck: en ? "Deck" : "Deck",
    result: en ? "Round result" : "Rundenergebnis",
    winner: en ? "Winner" : "Gewinner",
    noWinner: en ? "No winner this round." : "Diese Runde ohne Sieger.",
    points: en ? "pts" : "Pkt.",
    bot: en ? "AI" : "KI"
  };
}

/** HTML für Intro oder Ergebnis, oder null solange gespielt wird. */
export function roundScreenHtml(state: RoundScreenStateLike): string | null {
  const phase = state.game?.phase ?? "";
  const language = state.room?.language;
  const text = labels(language);
  const gameState = state.game?.state as CardTablePublicState | undefined;

  if (introPhases.has(phase)) {
    const title = escapeHtml(gameState?.title ?? cardTableManifest.displayName);
    const message = escapeHtml(state.game?.message ?? text.shuffling);
    const deck = escapeHtml(gameState?.deckLabel ?? "-");
    const players = gameState?.seats.length ?? state.room?.players?.length ?? 0;

    return `<section class="ct-screen">
      <h1>${title}</h1>
      <p class="ct-screen-lead">${message}</p>
      <dl class="ct-screen-meta">
        <div><dt>${text.deck}</dt><dd>${deck}</dd></div>
        <div><dt>${text.players}</dt><dd>${players}</dd></div>
      </dl>
    </section>`;
  }

  if (!resultPhases.has(phase)) {
    return null;
  }

  const names = new Map((state.room?.players ?? []).map((player) => [player.id, player]));
  const deltas = new Map((state.scoreboard?.entries ?? []).map((entry) => [entry.playerId, entry.delta]));
  const totals = new Map((state.scoreboard?.entries ?? []).map((entry) => [entry.playerId, entry.total]));

  // Die Plattform zählt nur echte Spieler. Sitzen KI-Spieler am Tisch, kommt
  // die Rangliste deshalb aus den Sitzplätzen des Spiels - dort stehen beide.
  const seats = gameState?.seats ?? [];
  const rowModels = (
    seats.length > 0
      ? seats.map((seat) => ({
          playerId: seat.playerId,
          name: seat.name,
          color: seat.color,
          isBot: Boolean(seat.isBot),
          total: totals.get(seat.playerId) ?? seat.score,
          delta: deltas.get(seat.playerId) ?? 0
        }))
      : (state.scoreboard?.entries ?? []).map((entry) => ({
          playerId: entry.playerId,
          name: names.get(entry.playerId)?.name ?? entry.playerId,
          color: names.get(entry.playerId)?.color ?? "#8d5f4a",
          isBot: false,
          total: entry.total,
          delta: entry.delta
        }))
  ).sort((left, right) => right.total - left.total);

  const winnerLine = gameState?.winnerName
    ? `${text.winner}: ${escapeHtml(gameState.winnerName)}`
    : escapeHtml(state.game?.message ?? text.noWinner);
  const rows =
    rowModels.length === 0
      ? `<li class="ct-score-empty">${escapeHtml(state.game?.message ?? "")}</li>`
      : rowModels
          .map((row, index) => {
            const delta = row.delta ? `<em>${row.delta > 0 ? "+" : ""}${row.delta}</em>` : "";
            const badge = row.isBot ? `<em class="ct-seat-bot">${escapeHtml(text.bot)}</em>` : "";

            return `<li${index === 0 ? ' class="is-lead"' : ""}>
              <span class="ct-score-rank">${index + 1}</span>
              <span class="ct-score-dot" style="background:${escapeHtml(row.color)}"></span>
              <span class="ct-score-name">${escapeHtml(row.name)}${badge}</span>
              <span class="ct-score-total">${row.total} ${text.points} ${delta}</span>
            </li>`;
          })
          .join("");

  return `<section class="ct-screen">
    <h1>${text.result}</h1>
    <p class="ct-screen-lead">${winnerLine}</p>
    <ol class="ct-score">${rows}</ol>
  </section>`;
}
