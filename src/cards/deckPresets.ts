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

/** Romméblatt: zwei französische Pakete und vier Joker. */
export const romme108Deck = extendDeck(french52Deck, {
  deckCount: 2,
  jokerCount: 4,
  id: "romme-108",
  label: "Romméblatt (108)"
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


const numberSuits: CardSuitDefinition[] = [
  { id: "rot", symbol: "◆", label: "Rot", color: "red" },
  { id: "gelb", symbol: "●", label: "Gelb", color: "yellow" },
  { id: "gruen", symbol: "■", label: "Grün", color: "green" },
  { id: "blau", symbol: "▲", label: "Blau", color: "blue" }
];

const numberRanks: CardRankDefinition[] = Array.from({ length: 20 }, (_, index) => ({
  id: `${index + 1}`,
  label: `${index + 1}`,
  order: index + 1,
  points: index + 1
}));

/** Sticht jede andere Karte. */
export const crownRank: CardRankDefinition = {
  id: "crown",
  label: "Z",
  order: 100,
  centerLabel: "ZAUBERER",
  symbol: "✦",
  color: "yellow"
};

/** Verliert jeden Stich. */
export const featherRank: CardRankDefinition = {
  id: "feather",
  label: "N",
  order: 0,
  centerLabel: "NARR",
  symbol: "☾",
  color: "green"
};

/** Stichwette-Blatt: 52 Karten plus vier Kronen und vier Federn. */
const arcaneSuits: CardSuitDefinition[] = [
  { id: "hearts", label: "Flamme", symbol: "✹", color: "red" },
  { id: "diamonds", label: "Stern", symbol: "✧", color: "yellow" },
  { id: "clubs", label: "Hain", symbol: "❧", color: "green" },
  { id: "spades", label: "Mond", symbol: "☽", color: "blue" }
];
const arcaneRanks = frenchRanks.map((rank, index) => ({ ...rank, label: String(index + 1), order: index + 1 }));

export const trickBet60Deck: DeckDefinition = {
  id: "stichwette-60",
  label: "Stichwette-Blatt (60)",
  suits: arcaneSuits,
  ranks: [...arcaneRanks, crownRank, featherRank],
  cards: [
    ...buildFullDeck(arcaneSuits, arcaneRanks),
    { id: "crown", suitId: null, rankId: "crown", copies: 4, tags: ["crown"] },
    { id: "feather", suitId: null, rankId: "feather", copies: 4, tags: ["feather"] }
  ],
  backStyle: "diamond"
};

/** Vier Farbreihen von 1 bis 20 für Anlegespiele. */
export const numbers80Deck: DeckDefinition = createCustomDeck({
  id: "zahlen-80",
  label: "Zahlenblatt 1-20 (80)",
  suits: numberSuits,
  ranks: numberRanks,
  backStyle: "grid"
});

/** Bildmotive für die drei exakt konstruierten Symboljagd-Sets. */
export const symboljagdSymbols = [
  "fox", "owl", "key", "moon", "sun", "cactus", "dragon", "apple", "mushroom", "anchor", "teapot", "crown", "feather", "fish", "carrot", "ghost", "spider", "butterfly", "snowflake", "lightning", "heart", "clover", "candle", "hourglass", "compass", "telescope", "glasses", "hammer", "violin", "wand", "potion", "crystal", "balloon", "paper-boat", "turtle", "cat", "dog", "bee", "ladybug", "orange", "cheese", "ice-cream", "top-hat", "ring", "bell", "umbrella", "sailboat", "lighthouse", "diamond", "pearl", "shell", "planet", "shooting-star", "phoenix-feather", "castle", "frog", "blue-flame",
  "accordion", "fire-truck", "bicycle", "camera", "cupcake", "soccer-ball", "roller-skate", "watering-can", "paint-palette", "trophy", "folded-map", "backpack", "drum", "sewing-spool", "traffic-cone", "garden-hose", "alarm-clock", "mitten", "rubber-boot", "train", "flamingo-float", "chess-rook", "opera-mask", "books", "vase", "yo-yo", "boxing-glove", "rocking-horse", "suitcase", "glass-marble", "paint-roller", "traffic-light", "radio", "magnifying-glass"
] as const;

const symboljagdSuits: CardSuitDefinition[] = [{ id: "symbols", symbol: "✦", label: "Symbole", color: "neutral" }];
function symbolField(order: number): { add(a: number, b: number): number; multiply(a: number, b: number): number } {
  if (order === 7) return {
    add: (a, b) => (a + b) % 7,
    multiply: (a, b) => (a * b) % 7
  };
  if (order === 8) {
    // GF(2³) with irreducible polynomial x³ + x + 1.
    const multiply = (left: number, right: number) => {
      let a = left;
      let b = right;
      let result = 0;
      while (b > 0) {
        if (b & 1) result ^= a;
        b >>= 1;
        a <<= 1;
        if (a & 0b1000) a ^= 0b1011;
      }
      return result;
    };
    return { add: (a, b) => a ^ b, multiply };
  }
  if (order === 9) {
    // GF(3²), represented as a + b·i with i² = -1.
    const add = (a: number, b: number) => {
      const real = (a % 3 + b % 3) % 3;
      const imaginary = (Math.floor(a / 3) + Math.floor(b / 3)) % 3;
      return real + imaginary * 3;
    };
    const multiply = (a: number, b: number) => {
      const ar = a % 3;
      const ai = Math.floor(a / 3);
      const br = b % 3;
      const bi = Math.floor(b / 3);
      const real = ((ar * br - ai * bi) % 3 + 3) % 3;
      const imaginary = (ar * bi + ai * br) % 3;
      return real + imaginary * 3;
    };
    return { add, multiply };
  }
  throw new Error(`Unsupported Symboljagd field order ${order}`);
}

function makeSymboljagdDeck(order: number): DeckDefinition {
  const { add, multiply } = symbolField(order);
  const cardCount = order * order + order + 1;
  const point = (x: number, y: number) => String(x * order + y);
  const slope = (value: number) => String(order * order + value);
  const vertical = String(order * order + order);
  const cards: CardDefinition[] = [];
  const append = (tags: string[]) => {
    const id = `card-${cards.length + 1}`;
    cards.push({ id, suitId: "symbols", rankId: id, tags });
  };

  for (let m = 0; m < order; m++) {
    for (let b = 0; b < order; b++) {
      append([...Array.from({ length: order }, (_, x) => `sym:${point(x, add(multiply(m, x), b))}`), `sym:${slope(m)}`]);
    }
  }
  for (let x = 0; x < order; x++) {
    append([...Array.from({ length: order }, (_, y) => `sym:${point(x, y)}`), `sym:${vertical}`]);
  }
  append([...Array.from({ length: order }, (_, m) => `sym:${slope(m)}`), `sym:${vertical}`]);

  const ranks = Array.from({ length: cardCount }, (_, index) => ({ id: `card-${index + 1}`, label: "✦", order: index + 1 }));
  return {
    id: `symboljagd-${cardCount}`,
    label: `Symboljagd-Bildkarten (${cardCount})`,
    suits: symboljagdSuits,
    ranks,
    cards,
    backStyle: "diamond"
  };
}

export const symboljagd57Deck = makeSymboljagdDeck(7);
export const symboljagd73Deck = makeSymboljagdDeck(8);
export const symboljagd91Deck = makeSymboljagdDeck(9);

/** Die einzelne Karte ohne Partner. */
export const peterRank: CardRankDefinition = {
  id: "peter",
  label: "P",
  order: 99,
  centerLabel: "PETER",
  symbol: "♠",
  color: "black"
};

const withoutQueens = frenchRanks.filter((rank) => rank.id !== "queen");

/** 24 Paare plus die eine Karte, die niemand haben will. */
export const peter49Deck: DeckDefinition = {
  id: "peter-49",
  label: "Peter-Blatt (49)",
  suits: frenchSuits,
  ranks: [...withoutQueens, peterRank],
  cards: [
    ...buildFullDeck(frenchSuits, withoutQueens),
    { id: "peter", suitId: null, rankId: "peter", copies: 1, tags: ["peter"] }
  ],
  backStyle: "classic"
};

const doppelkopfRankIds = ["9", "10", "jack", "queen", "king", "ace"];
const doppelkopfRanks = frenchRanks.filter((rank) => doppelkopfRankIds.includes(rank.id));

/** Neun bis Ass, jede Karte doppelt. */
export const doppelkopf48Deck: DeckDefinition = {
  id: "doppelkopf-48",
  label: "Doppelkopf-Blatt (48)",
  suits: frenchSuits,
  ranks: doppelkopfRanks,
  cards: buildFullDeck(frenchSuits, doppelkopfRanks).map((card) => ({ ...card, copies: 2 })),
  backStyle: "diamond"
};

const doppelkopf40RankIds = ["10", "jack", "queen", "king", "ace"];
const doppelkopf40Ranks = frenchRanks.filter((rank) => doppelkopf40RankIds.includes(rank.id));

/**
 * Zehn bis Ass, jede Karte doppelt - das Blatt "ohne Neunen".
 *
 * Verbreitete Hausregel: Ohne die nullwertigen Neunen wird der Karo-König zum
 * kleinsten Trumpf, und jeder Stich wiegt schwerer.
 */
export const doppelkopf40Deck: DeckDefinition = {
  id: "doppelkopf-40",
  label: "Doppelkopf ohne Neunen (40)",
  suits: frenchSuits,
  ranks: doppelkopf40Ranks,
  cards: buildFullDeck(frenchSuits, doppelkopf40Ranks).map((card) => ({ ...card, copies: 2 })),
  backStyle: "diamond"
};

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
 * Regelwerke mit festem Deck (Stichwette, Zahlenreihe) greifen hierauf zu.
 */
export const allCardDecks: DeckDefinition[] = [
  ...cardDeckOptions.map((option) => option.deck),
  trickBet60Deck,
  numbers80Deck,
  symboljagd57Deck,
  symboljagd73Deck,
  symboljagd91Deck,
  peter49Deck,
  romme108Deck,
  doppelkopf48Deck,
  doppelkopf40Deck
];

export function resolveCardDeck(deckId: string | null | undefined): DeckDefinition {
  return allCardDecks.find((deck) => deck.id === deckId) ?? french52Deck;
}

/** Wie viele Karten liegen in diesem Deck? */
export function countDeckCards(deck: DeckDefinition): number {
  return deck.cards.reduce((total, card) => total + Math.max(1, card.copies ?? 1), 0);
}
