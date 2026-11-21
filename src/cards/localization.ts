import type { DeckDefinition } from "./cardTypes.js";
import { additionalSetupText } from "../additionalSetupText.js";
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
const extraCopy: Record<"es" | "fr" | "pt-BR", {
  green: string;
  symbols: string;
  ranks: Record<string, string>;
  center: Record<string, string>;
  labels: Record<string, string>;
}> = {
  "es": {
    green: "Verde",
    symbols: "Cartas de Caza de símbolos",
    ranks: { jack: "J", queen: "Q" },
    center: { KRONE: "CORONA", FEDER: "PLUMA", PETER: "LA MONA" },
    labels: {
      "Romméblatt (108)": "Baraja de Rummy (108)",
      "Stichwette-Blatt (60)": "Baraja de Apuesta de bazas (60)",
      "Zahlenblatt 1-20 (80)": "Baraja numérica 1–20 (80)",
      "Peter-Blatt (49)": "Baraja de La mona (49)",
      "Doppelkopf-Blatt (48)": "Baraja de Doppelkopf (48)",
      "Doppelkopf ohne Neunen (40)": "Doppelkopf sin nueves (40)",
      "Pik": "Picas",
      "Herz": "Corazones",
      "Karo": "Diamantes",
      "Kreuz": "Tréboles",
      "Eichel": "Bellotas",
      "Grün": "Hojas",
      "Schellen": "Cascabeles",
      "Sonne": "Sol",
      "Welle": "Ola",
      "Blatt": "Hoja",
      "Funke": "Chispa",
      "Rot": "Rojo",
      "Gelb": "Amarillo",
      "Blau": "Azul",
      "Flamme": "Llama",
      "Stern": "Estrella",
      "Hain": "Arboleda",
      "Mond": "Luna",
      "Symbole": "Símbolos",
    }
  },
  "fr": {
    green: "Vert",
    symbols: "Cartes de Chasse aux symboles",
    ranks: { jack: "V", queen: "D", king: "R" },
    center: { KRONE: "COURONNE", FEDER: "PLUME", PETER: "POUILLEUX" },
    labels: {
      "Romméblatt (108)": "Paquet de rami (108)",
      "Stichwette-Blatt (60)": "Paquet de Pari de plis (60)",
      "Zahlenblatt 1-20 (80)": "Paquet numéroté 1–20 (80)",
      "Peter-Blatt (49)": "Paquet du Pouilleux (49)",
      "Doppelkopf-Blatt (48)": "Paquet de Doppelkopf (48)",
      "Doppelkopf ohne Neunen (40)": "Doppelkopf sans les neuf (40)",
      "Pik": "Pique",
      "Herz": "Cœur",
      "Karo": "Carreau",
      "Kreuz": "Trèfle",
      "Eichel": "Glands",
      "Grün": "Feuilles",
      "Schellen": "Grelots",
      "Sonne": "Soleil",
      "Welle": "Vague",
      "Blatt": "Feuille",
      "Funke": "Étincelle",
      "Rot": "Rouge",
      "Gelb": "Jaune",
      "Blau": "Bleu",
      "Flamme": "Flamme",
      "Stern": "Étoile",
      "Hain": "Bosquet",
      "Mond": "Lune",
      "Symbole": "Symboles",
    }
  },
  "pt-BR": {
    green: "Verde",
    symbols: "Cartas de Caça aos símbolos",
    ranks: { jack: "J", queen: "Q" },
    center: { KRONE: "COROA", FEDER: "PENA", PETER: "MICO" },
    labels: {
      "Romméblatt (108)": "Baralho de Rummy (108)",
      "Stichwette-Blatt (60)": "Baralho de Aposta de vazas (60)",
      "Zahlenblatt 1-20 (80)": "Baralho numérico de 1 a 20 (80)",
      "Peter-Blatt (49)": "Baralho de Mico (49)",
      "Doppelkopf-Blatt (48)": "Baralho de Doppelkopf (48)",
      "Doppelkopf ohne Neunen (40)": "Doppelkopf sem noves (40)",
      "Pik": "Espadas",
      "Herz": "Copas",
      "Karo": "Ouros",
      "Kreuz": "Paus",
      "Eichel": "Bolotas",
      "Grün": "Folhas",
      "Schellen": "Guizos",
      "Sonne": "Sol",
      "Welle": "Onda",
      "Blatt": "Folha",
      "Funke": "Faísca",
      "Rot": "Vermelho",
      "Gelb": "Amarelo",
      "Blau": "Azul",
      "Flamme": "Chama",
      "Stern": "Estrela",
      "Hain": "Bosque",
      "Mond": "Lua",
      "Symbole": "Símbolos",
    }
  }
};

export function localizeDeck(deck: DeckDefinition, language: string): DeckDefinition {
  if (language === "es" || language === "fr" || language === "pt-BR") {
    const copy = extraCopy[language];
    const options: Record<string, { label: string }> = additionalSetupText[language].deck.options;
    return {
      ...deck,
      label: options[deck.id]?.label ?? copy.labels[deck.label]
        ?? deck.label.replace(/^Symboljagd-Bildkarten /, copy.symbols + " "),
      suits: deck.suits.map((suit) => ({
        ...suit,
        label: suit.id === "gruen" && deck.id !== "skat-32" ? copy.green : copy.labels[suit.label] ?? suit.label
      })),
      ranks: deck.ranks.map((rank) => ({
        ...rank,
        label: copy.ranks[rank.id] ?? rank.label,
        ...(rank.centerLabel ? { centerLabel: copy.center[rank.centerLabel] ?? rank.centerLabel } : {})
      }))
    };
  }
 if (language !== "en") return deck;
 const label = (value: string) => englishLabels[value] ?? value.replace(/^Symboljagd-Bildkarten /, "Symbol Hunt picture cards ");
 return { ...deck, label: label(deck.label), suits: deck.suits.map(suit => ({ ...suit, label: suit.id === "gruen" && deck.id !== "skat-32" ? "Green" : label(suit.label) })), ranks: deck.ranks.map(rank => ({ ...rank, label: rank.id === "jack" ? "J" : rank.id === "queen" ? "Q" : rank.id === "crown" ? "C" : rank.label, ...(rank.centerLabel ? { centerLabel: rank.centerLabel === "KRONE" ? "CROWN" : rank.centerLabel === "FEDER" ? "FEATHER" : rank.centerLabel === "PETER" ? "OLD MAID" : rank.centerLabel } : {}) })) };
}
