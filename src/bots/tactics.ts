import { handOf } from "../cards/cardTable.js";
import type { CardGameState } from "../rules/types.js";

/**
 * Kleine gemeinsame Bausteine für die Regelwerk-Heuristiken.
 *
 * Bewusst regelfrei: Wer als Nächstes dran ist, wie viele Karten jemand hält,
 * wie man eine Liste gewichtet. Was daraus folgt, entscheidet jedes Regelwerk
 * für sich.
 */

/** Sitz, der nach dem aktiven Spieler an der Reihe wäre. */
export function nextSeatId(state: CardGameState, steps = 1): string | null {
  const order = state.table.turnOrder;

  if (order.length === 0) {
    return null;
  }

  const raw = state.table.activeIndex + state.table.direction * steps;

  return order[((raw % order.length) + order.length) % order.length] ?? null;
}

export function handSizeOf(state: CardGameState, playerId: string): number {
  return handOf(state.table, playerId).length;
}

/** Kleinste Handkartenzahl aller Gegner - je kleiner, desto dringender. */
export function smallestOpponentHand(state: CardGameState, playerId: string): number {
  const sizes = state.table.turnOrder
    .filter((seatId) => seatId !== playerId)
    .map((seatId) => handSizeOf(state, seatId))
    .filter((size) => size > 0);

  return sizes.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...sizes);
}

/** Wählt den Eintrag mit dem höchsten Gewicht; bei Gleichstand zufällig. */
export function bestOf<T>(entries: readonly T[], weight: (entry: T) => number): T | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  let best = Number.NEGATIVE_INFINITY;
  let winners: T[] = [];

  for (const entry of entries) {
    const value = weight(entry);

    if (value > best) {
      best = value;
      winners = [entry];
    } else if (value === best) {
      winners.push(entry);
    }
  }

  return winners[Math.floor(Math.random() * winners.length)];
}

/** Zählt die Farben einer Hand. */
export function suitCounts(state: CardGameState, playerId: string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const cardId of handOf(state.table, playerId)) {
    const suitId = state.table.cards[cardId]?.suitId;

    if (suitId) {
      counts.set(suitId, (counts.get(suitId) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Stabiler Zufall aus einem Text.
 *
 * Der Antrieb fragt jeden Tick nach; ein echter Würfel würde eine seltene
 * Entscheidung deshalb trotzdem irgendwann auslösen. Diese Funktion würfelt
 * einmal pro Situation und bleibt bei ihrer Antwort, solange sich die Lage
 * nicht ändert.
 */
export function stableChance(seed: string, probability: number): boolean {
  let hash = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return ((hash >>> 0) % 10_000) / 10_000 < probability;
}
