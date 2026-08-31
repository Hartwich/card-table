import type {
  CardDefinition,
  CardRankDefinition,
  CardSuitDefinition,
  DeckDefinition
} from "./cardTypes.js";

/**
 * Fertige Decks und der Bauplan für eigene.
 *
 * Ein neues Kartenspiel braucht hier nichts zu ändern: Es wählt eine Deck-Id
 * aus `cardDeckOptions` oder liefert über `createCustomDeck` ein eigenes Deck.
 */

const frenchSuits: CardSuitDefinition[] = [
  { id: "spades", symbol: "♠", label: "Pik", color: "black" },
  { id: "hearts", symbol: "♥", label: "Herz", color: "red" },
  { id: "diamonds", symbol: "♦", label: "Karo", color: "red" },
  { id: "clubs", symbol: "♣", label: "Kreuz", color: "black" }
];

const germanSuits: CardSuitDefinition[] = [
  { id: "eichel", symbol: "♣", label: "Eichel", color: "black" },
  { id: "gruen", symbol: "♠", label: "Grün", color: "green" },
  { id: "herz", symbol: "♥", label: "Herz", color: "red" },
  { id: "schellen", symbol: "♦", label: "Schellen", color: "yellow" }
];

const partySuits: CardSuitDefinition[] = [
  { id: "sonne", symbol: "☀", label: "Sonne", color: "yellow" },
  { id: "welle", symbol: "≈", label: "Welle", color: "blue" },
  { id: "blatt", symbol: "❦", label: "Blatt", color: "green" },
  { id: "funke", symbol: "✦", label: "Funke", color: "red" }
];

const frenchRanks: CardRankDefinition[] = [
  { id: "2", label: "2", order: 2, points: 2 },
  { id: "3", label: "3", order: 3, points: 3 },
  { id: "4", label: "4", order: 4, points: 4 },
  { id: "5", label: "5", order: 5, points: 5 },
  { id: "6", label: "6", order: 6, points: 6 },
  { id: "7", label: "7", order: 7, points: 7 },
  { id: "8", label: "8", order: 8, points: 8 },
  { id: "9", label: "9", order: 9, points: 9 },
  { id: "10", label: "10", order: 10, points: 10 },
  { id: "jack", label: "B", order: 11, points: 2 },
  { id: "queen", label: "D", order: 12, points: 3 },
  { id: "king", label: "K", order: 13, points: 4 },
  { id: "ace", label: "A", order: 14, points: 11 }
];

const skatRanks: CardRankDefinition[] = [
  { id: "7", label: "7", order: 7, points: 0 },
  { id: "8", label: "8", order: 8, points: 0 },
  { id: "9", label: "9", order: 9, points: 0 },
  { id: "10", label: "10", order: 10, points: 10 },
  { id: "unter", label: "U", order: 11, points: 2 },
  { id: "ober", label: "O", order: 12, points: 3 },
  { id: "koenig", label: "K", order: 13, points: 4 },
  { id: "ass", label: "A", order: 14, points: 11 }
];

const partyRanks: CardRankDefinition[] = [
  { id: "1", label: "1", order: 1, points: 1 },
  { id: "2", label: "2", order: 2, points: 2 },
  { id: "3", label: "3", order: 3, points: 3 },
  { id: "4", label: "4", order: 4, points: 4 },
  { id: "5", label: "5", order: 5, points: 5 },
  { id: "6", label: "6", order: 6, points: 6 },
  { id: "7", label: "7", order: 7, points: 7 },
  { id: "8", label: "8", order: 8, points: 8 },
  { id: "9", label: "9", order: 9, points: 9 },
  { id: "10", label: "10", order: 10, points: 10 }
];

export const jokerRank: CardRankDefinition = { id: "joker", label: "J", order: 99, points: 20 };

function buildFullDeck(suits: CardSuitDefinition[], ranks: CardRankDefinition[]): CardDefinition[] {
  const cards: CardDefinition[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      cards.push({ id: `${suit.id}:${rank.id}`, suitId: suit.id, rankId: rank.id });
    }
  }

  return cards;
}

/** Baut aus eigenen Farben und Rängen ein spielbares Deck. */
export function createCustomDeck(input: {
  id: string;
  label: string;
  suits: CardSuitDefinition[];
  ranks: CardRankDefinition[];
  cards?: CardDefinition[];
  backStyle?: DeckDefinition["backStyle"];
  wildRankIds?: string[];
}): DeckDefinition {
  return {
    id: input.id,
    label: input.label,
    suits: input.suits,
    ranks: input.ranks,
    cards: input.cards ?? buildFullDeck(input.suits, input.ranks),
    backStyle: input.backStyle ?? "classic",
    wildRankIds: input.wildRankIds
  };
}

/** Ergänzt ein Deck um Joker und/oder weitere komplette Decks. */
export function extendDeck(
  base: DeckDefinition,
  options: { deckCount?: number; jokerCount?: number; id?: string; label?: string }
): DeckDefinition {
  const deckCount = Math.max(1, options.deckCount ?? 1);
  const jokerCount = Math.max(0, options.jokerCount ?? 0);

  if (deckCount === 1 && jokerCount === 0) {
    return base;
  }

  const cards: CardDefinition[] = base.cards.map((card) => ({
    ...card,
    copies: (card.copies ?? 1) * deckCount
  }));

  if (jokerCount > 0) {
    cards.push({
      id: "joker",
      suitId: null,
      rankId: jokerRank.id,
      copies: jokerCount,
      tags: ["joker"]
    });
  }

  return {
    ...base,
    id: options.id ?? `${base.id}-x${deckCount}-j${jokerCount}`,
    label: options.label ?? base.label,
    ranks: jokerCount > 0 ? [...base.ranks, jokerRank] : base.ranks,
    cards,
    wildRankIds: jokerCount > 0 ? [...(base.wildRankIds ?? []), jokerRank.id] : base.wildRankIds
  };
}

export const french52Deck: DeckDefinition = {
  id: "french-52",
  label: "Französisches Blatt (52)",
  suits: frenchSuits,
  ranks: frenchRanks,
  cards: buildFullDeck(frenchSuits, frenchRanks),
  backStyle: "diamond",
  wildRankIds: ["jack"]
};

export const french54Deck: DeckDefinition = extendDeck(french52Deck, {
  jokerCount: 2,
  id: "french-54",
  label: "Französisches Blatt + 2 Joker (54)"
});

export const french104Deck: DeckDefinition = extendDeck(french52Deck, {
  deckCount: 2,
  jokerCount: 4,
  id: "french-104",
  label: "Doppeldeck + 4 Joker (108)"
});

export const skat32Deck: DeckDefinition = {
  id: "skat-32",
  label: "Deutsches Blatt (32)",
  suits: germanSuits,
  ranks: skatRanks,
  cards: buildFullDeck(germanSuits, skatRanks),
  backStyle: "wave",
  wildRankIds: ["unter"]
};

/** Beispiel für ein frei definiertes Deck. */
export const party40Deck: DeckDefinition = createCustomDeck({
  id: "party-40",
  label: "Party-Deck (40)",
  suits: partySuits,
  ranks: partyRanks,
  backStyle: "grid",
  wildRankIds: ["10"]
});


const elferSuits: CardSuitDefinition[] = [
  { id: "rot", symbol: "◆", label: "Rot", color: "red" },
  { id: "gelb", symbol: "●", label: "Gelb", color: "yellow" },
  { id: "gruen", symbol: "■", label: "Grün", color: "green" },
  { id: "blau", symbol: "▲", label: "Blau", color: "blue" }
];

const elferRanks: CardRankDefinition[] = Array.from({ length: 20 }, (_, index) => ({
  id: `${index + 1}`,
  label: `${index + 1}`,
  order: index + 1,
  points: index + 1
}));

export const wizardRank: CardRankDefinition = {
  id: "wizard",
  label: "Z",
  order: 100,
  centerLabel: "ZAUBERER",
  symbol: "✦",
  color: "blue"
};

export const jesterRank: CardRankDefinition = {
  id: "jester",
  label: "N",
  order: 0,
  centerLabel: "NARR",
  symbol: "✿",
  color: "green"
};

/** Wizard-Blatt: 52 Karten plus vier Zauberer und vier Narren. */
export const wizard60Deck: DeckDefinition = {
  id: "wizard-60",
  label: "Wizard-Blatt (60)",
  suits: frenchSuits,
  ranks: [...frenchRanks, wizardRank, jesterRank],
  cards: [
    ...buildFullDeck(frenchSuits, frenchRanks),
    { id: "wizard", suitId: null, rankId: "wizard", copies: 4, tags: ["wizard"] },
    { id: "jester", suitId: null, rankId: "jester", copies: 4, tags: ["jester"] }
  ],
  backStyle: "classic"
};

/** Vier Farbreihen von 1 bis 20 für Anlegespiele. */
export const elfer80Deck: DeckDefinition = createCustomDeck({
  id: "elfer-80",
  label: "Zahlenblatt 1-20 (80)",
  suits: elferSuits,
  ranks: elferRanks,
  backStyle: "grid"
});

export interface CardDeckOption {
  id: string;
  label: string;
  deck: DeckDefinition;
}

/** Auswahlliste für das Host-Setup. Neue Decks hier eintragen. */
export const cardDeckOptions: CardDeckOption[] = [
  { id: french52Deck.id, label: french52Deck.label, deck: french52Deck },
  { id: french54Deck.id, label: french54Deck.label, deck: french54Deck },
  { id: skat32Deck.id, label: skat32Deck.label, deck: skat32Deck },
  { id: party40Deck.id, label: party40Deck.label, deck: party40Deck },
  { id: french104Deck.id, label: french104Deck.label, deck: french104Deck }
];

export const defaultCardDeckId = french52Deck.id;

/**
 * Alle bekannten Decks, auch die, die nicht im Host-Setup zur Auswahl stehen.
 * Regelwerke mit festem Deck (Wizard, Elfer raus) greifen hierauf zu.
 */
export const allCardDecks: DeckDefinition[] = [
  ...cardDeckOptions.map((option) => option.deck),
  wizard60Deck,
  elfer80Deck
];

export function resolveCardDeck(deckId: string | null | undefined): DeckDefinition {
  return allCardDecks.find((deck) => deck.id === deckId) ?? french52Deck;
}

/** Wie viele Karten liegen in diesem Deck? */
export function countDeckCards(deck: DeckDefinition): number {
  return deck.cards.reduce((total, card) => total + Math.max(1, card.copies ?? 1), 0);
}
