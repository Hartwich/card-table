import { moveCard } from "../cards/cardTable.js";
import {
  readNumber,
  readText,
  writeExtra,
  type CardGameState,
  type CardRulesetContext
} from "./types.js";

/**
 * Die Pause nach einem vollen Stich.
 *
 * Ein Stich, der in derselben Sekunde verschwindet, in der die letzte Karte
 * fällt, ist nie zu sehen - man erfährt nie, womit der Gegner gestochen hat.
 * Deshalb bleibt der vollständige Stich einen Moment offen liegen, und erst
 * danach wandert er weg.
 *
 * Die Mechanik steht hier und nicht in den Regelwerken, weil sie in jedem
 * Stichspiel identisch ist: Stichwette, Herzeln und Doppelkopf teilen sie. Was
 * ein Stich *bedeutet*, bleibt Sache des Regelwerks.
 */

/** Wie lange der fertige Stich offen liegen bleibt. */
export const trickPauseMs = 5_000;

const sweepAtKey = "sweepAt";
const winnerKey = "lastTrickWinner";

export interface TrickZones {
  trickZoneId: string;
  lastTrickZoneId: string;
  wonZoneId: string;
}

/** Liegt gerade ein fertiger Stich und wartet aufs Abräumen? */
export function isTrickPending(state: CardGameState): boolean {
  return readNumber(state, sweepAtKey) > 0;
}

/** Wer den zuletzt fertigen Stich gemacht hat - auch nach dem Abräumen. */
export function trickWinnerId(state: CardGameState): string | null {
  return readText(state, winnerKey);
}

/**
 * Schliesst einen Stich ab, ohne ihn wegzuräumen.
 *
 * Der Zug geht schon an den Gewinner über; gespielt werden darf aber erst, wenn
 * die Pause vorbei ist - dafür fragen die Regelwerke `isTrickPending` ab.
 */
export function beginTrickPause(
  state: CardGameState,
  context: CardRulesetContext,
  winnerId: string
): CardGameState {
  return writeExtra(state, {
    [sweepAtKey]: context.now + trickPauseMs,
    [winnerKey]: winnerId
  });
}

/**
 * Räumt den Stich ab, sobald die Pause abgelaufen ist.
 *
 * Gibt `null` zurück, solange nichts zu tun ist - die Regelwerke können das
 * Ergebnis also direkt aus ihrem `tick` zurückgeben.
 */
export function sweepTrick(
  state: CardGameState,
  context: CardRulesetContext,
  zones: TrickZones
): CardGameState | null {
  const sweepAt = readNumber(state, sweepAtKey);

  if (sweepAt <= 0 || context.now < sweepAt) {
    return null;
  }

  const winnerId = readText(state, winnerKey);
  let table = state.table;

  // Der vorige Stich hat lange genug gelegen - er wandert ins Archiv, damit
  // der gerade fertige seinen Platz bekommt.
  for (const archivedId of [...(table.zones[zones.lastTrickZoneId] ?? [])]) {
    table = moveCard(table, archivedId, { kind: "zone", zoneId: zones.wonZoneId }, "bottom");
  }

  for (const cardId of [...(table.zones[zones.trickZoneId] ?? [])]) {
    table = moveCard(table, cardId, { kind: "zone", zoneId: zones.lastTrickZoneId }, "bottom");
  }

  return writeExtra(
    {
      ...state,
      table,
      // Jetzt erst fliegen die Karten auf dem Host zum Sitzplatz.
      lastTrickWinnerId: winnerId ?? undefined,
      lastTrickSerial: (state.lastTrickSerial ?? 0) + 1,
      updatedAt: context.now
    },
    { [sweepAtKey]: 0 }
  );
}

/**
 * Den letzten Stich einblenden oder wieder verstecken.
 *
 * Angefordert wird am Handy, gezeigt wird auf dem Tisch - deshalb läuft es über
 * den Zustand und nicht über eine Anzeige-Umschaltung im Host.
 */
export function toggleLastTrick(state: CardGameState): CardGameState {
  return { ...state, showOnDemand: !state.showOnDemand };
}

/** Versteckt ihn wieder - sobald weitergespielt wird. */
export function hideLastTrick(state: CardGameState): CardGameState {
  return state.showOnDemand ? { ...state, showOnDemand: false } : state;
}

/** Hält niemand mehr Karten? Dann ist der Durchgang vorbei. */
export function handsEmpty(state: CardGameState): boolean {
  return state.table.turnOrder.every((playerId) => (state.table.hands[playerId] ?? []).length === 0);
}
