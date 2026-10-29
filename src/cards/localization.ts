import type { DeckDefinition } from "./cardTypes.js";
const englishLabels: Record<string, string> = {
  "Französisches Blatt (52)": "French deck (52)",
  "Französisches Blatt + 2 Joker (54)": "French deck + 2 jokers (54)",
  "Doppeldeck + 4 Joker (108)": "Double deck + 4 jokers (108)",
  "Romméblatt (108)": "Rummy deck (108)",
  "Deutsches Blatt (32)": "German deck (32)",
  "Party-Deck (40)": "Party deck (40)",
  "Stichwette-Blatt (60)": "Trick Bets deck (60)",
  "Zahlenblatt 1-20 (80)": "Number deck 1–20 (80)",
  "Peter-Blatt (49)": "Old Maid deck (49)",
  "Doppelkopf-Blatt (48)": "Doppelkopf deck (48)",
  "Doppelkopf ohne Neunen (40)": "Doppelkopf without nines (40)",
  "Pik": "Spades",
  "Herz": "Hearts",
  "Karo": "Diamonds",
  "Kreuz": "Clubs",
  "Eichel": "Acorns",
  "Grün": "Leaves",
  "Schellen": "Bells",
  "Sonne": "Sun",
  "Welle": "Wave",
  "Blatt": "Leaf",
  "Funke": "Spark",
  "Rot": "Red",
  "Gelb": "Yellow",
  "Blau": "Blue",
  "Flamme": "Flame",
  "Stern": "Star",
  "Hain": "Grove",
  "Mond": "Moon",
  "Symbole": "Symbols"
};
export function localizeDeck(deck: DeckDefinition, language: string): DeckDefinition {
 if (language !== "en") return deck;
 const label = (value: string) => englishLabels[value] ?? value.replace(/^Symboljagd-Bildkarten /, "Symbol Hunt picture cards ");
 return { ...deck, label: label(deck.label), suits: deck.suits.map(suit => ({ ...suit, label: suit.id === "gruen" && deck.id !== "skat-32" ? "Green" : label(suit.label) })), ranks: deck.ranks.map(rank => ({ ...rank, label: rank.id === "jack" ? "J" : rank.id === "queen" ? "Q" : rank.id === "crown" ? "C" : rank.label, ...(rank.centerLabel ? { centerLabel: rank.centerLabel === "KRONE" ? "CROWN" : rank.centerLabel === "FEDER" ? "FEATHER" : rank.centerLabel === "PETER" ? "OLD MAID" : rank.centerLabel } : {}) })) };
}
