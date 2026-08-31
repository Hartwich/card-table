/**
 * Gemeinsame Kartentypen für alle Regelwerke dieses Spiels.
 *
 * Ein Deck besteht aus Kartensorten; beim Rundenstart entstehen daraus konkrete
 * Karteninstanzen mit eigener Id. Server, Host und Controller arbeiten mit
 * demselben Anzeigemodell (`CardFace`), damit beide Seiten identisch aussehen.
 */

export type CardSuitId = string;

export type CardColor = "red" | "black" | "green" | "blue" | "yellow" | "neutral";

export interface CardSuitDefinition {
  /** Stabile Id, z. B. "hearts" oder "eichel". */
  id: CardSuitId;
  /** Symbol für Ecke und Kartenmitte. */
  symbol: string;
  /** Ausgeschriebener Name für Ansagen und Wunschfarben. */
  label: string;
  color: CardColor;
}

export interface CardRankDefinition {
  /** Stabile Id, z. B. "7", "queen", "joker". */
  id: string;
  /** Kurzlabel für die Kartenecke, z. B. "7", "D", "A". */
  label: string;
  /** Sortier- und Vergleichswert innerhalb des Decks. */
  order: number;
  /** Punktwert, falls ein Regelwerk damit rechnet. */
  points?: number;
  /** Text in der Kartenmitte für farblose Karten, z. B. "ZAUBERER". */
  centerLabel?: string;
  /** Symbol für farblose Karten, wenn es keine Farbe gibt. */
  symbol?: string;
  /** Farbe für farblose Karten. */
  color?: CardColor;
}

/** Eine Kartensorte. `copies` erlaubt Doppeldecks und mehrere Joker. */
export interface CardDefinition {
  id: string;
  suitId: CardSuitId | null;
  rankId: string;
  copies?: number;
  /** Freie Marker für Regelwerke, z. B. "joker" oder "wild". */
  tags?: string[];
}

export type CardBackStyle = "classic" | "diamond" | "wave" | "grid";

export interface DeckDefinition {
  id: string;
  label: string;
  suits: CardSuitDefinition[];
  ranks: CardRankDefinition[];
  cards: CardDefinition[];
  backStyle?: CardBackStyle;
  /** Ränge, die immer gelegt werden dürfen (Bube, Joker, Wild). */
  wildRankIds?: string[];
}

/** Konkrete Karte einer laufenden Runde. */
export interface CardInstance {
  /** Eindeutig innerhalb einer Runde, z. B. "hearts:queen#1". */
  id: string;
  definitionId: string;
  suitId: CardSuitId | null;
  rankId: string;
  tags: string[];
}

/** Sichtbare Beschreibung einer Karte - die einzige Quelle für das Rendering. */
export interface CardFace {
  cardId: string;
  suitId: CardSuitId | null;
  suitSymbol: string;
  suitLabel: string;
  rankLabel: string;
  color: CardColor;
  /** Text in der Kartenmitte, z. B. "JOKER". */
  centerLabel?: string;
  points?: number;
}

export const cardColorPalette: Record<CardColor, { ink: string; accent: string }> = {
  red: { ink: "#b3382c", accent: "#f6d9d3" },
  black: { ink: "#24313a", accent: "#e0e3e0" },
  green: { ink: "#4b7150", accent: "#dfe9df" },
  blue: { ink: "#3a6183", accent: "#d8e3ee" },
  yellow: { ink: "#a9762c", accent: "#f7e7cd" },
  neutral: { ink: "#697178", accent: "#ece7dd" }
};
