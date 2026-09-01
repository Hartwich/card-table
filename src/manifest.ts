import type { GameManifest } from "@open-party-lab/game-core";

export const cardTableRoomSettingKeys = {
  ruleset: "cardTableRuleset",
  deck: "cardTableDeck",
  handSize: "cardTableHandSize",
  cardStyle: "cardTableCardStyle",
  botCount: "cardTableBotCount",
  doppelkopfScoring: "cardTableDoppelkopfScoring"
} as const;

export const cardTableManifest = {
  id: "card-table",
  displayName: "Kartentisch",
  description:
    "Gemeinsamer Spieltisch für zehn Kartenspiele: Mau-Mau, Schwimmen, Stichwette, Zahlenreihe, Lügen, Schwarzer Peter, Fischen, Herzeln, Doppelkopf und freies Spiel.",
  // Eine Person reicht: Fehlende Plätze füllt der Tisch mit KI-Sitzen auf.
  minPlayers: 1,
  maxPlayers: 6,
  hostView: "CardTableHostScene",
  controllerView: "card-table",
  controllerLayout: "card_hand",
  supportsTeams: false,
  estimatedRoundDurationMs: 600_000,
  roundCompletionMode: "wait_for_ready",
  lobbySetup: {
    title: "Kartentisch Setup",
    description: "Regelwerk, Deck und Handkarten wählen.",
    fields: [
      {
        kind: "select",
        id: "ruleset",
        settingKey: cardTableRoomSettingKeys.ruleset,
        actionKey: "ruleset",
        label: "Regelwerk",
        defaultValue: "mau-mau",
        options: [
          {
            id: "mau-mau",
            label: "Mau-Mau",
            description: "Sieben zieht zwei, Acht setzt aus, Neun dreht um, Bube wünscht sich eine Farbe."
          },
          {
            id: "schwimmen",
            label: "Schwimmen (31)",
            description: "Drei Karten, drei offene Tischkarten, tauschen und klopfen. Drei Leben pro Person."
          },
          {
            id: "stichwette",
            label: "Stichwette",
            description: "Stiche ansagen und genau treffen. Eigenes Blatt mit Kronen und Federn, steigende Kartenzahl je Runde."
          },
          {
            id: "zahlenreihe",
            label: "Zahlenreihe",
            description: "Vier Farbreihen von 1 bis 20, jede eröffnet mit der Elf. Eigenes Zahlenblatt."
          },
          {
            id: "luegen",
            label: "Lügen",
            description: "Verdeckt ablegen und den geforderten Wert ansagen. Wer anzweifelt und daneben liegt, nimmt den Stapel."
          },
          {
            id: "schwarzer-peter",
            label: "Schwarzer Peter",
            description: "Paare ablegen und beim Nachbarn ziehen. Wer die Karte ohne Partner behält, verliert."
          },
          {
            id: "fischen",
            label: "Fischen",
            description: "Mitspieler nach einem Wert fragen und Quartette sammeln. Familientauglich."
          },
          {
            id: "herzeln",
            label: "Herzeln",
            description: "Stiche vermeiden: Jedes Herz zählt einen Strafpunkt, die Pik-Dame dreizehn."
          },
          {
            id: "doppelkopf",
            label: "Doppelkopf",
            description: "Für vier Personen: Karo, Damen, Buben und Herz-Zehn sind Trumpf, die Kreuz-Damen bilden Re."
          },
          {
            id: "free-play",
            label: "Freies Spiel",
            description: "Offener Tisch ohne Regeln: jede Karte darf abgelegt werden."
          }
        ]
      },
      {
        kind: "select",
        id: "deck",
        settingKey: cardTableRoomSettingKeys.deck,
        actionKey: "deck",
        label: "Kartendeck",
        description: "Blatt für dieses Regelwerk.",
        // Regelwerke mit festem Blatt bekommen die Auswahl gar nicht erst zu
        // sehen - sie hätte dort keine Wirkung.
        visibleWhen: {
          field: cardTableRoomSettingKeys.ruleset,
          anyOf: ["mau-mau", "schwimmen", "luegen", "fischen", "free-play"]
        },
        defaultValue: "french-52",
        options: [
          { id: "french-52", label: "Französisch (52)", description: "Pik, Herz, Karo, Kreuz von 2 bis Ass." },
          { id: "french-54", label: "Französisch + Joker (54)", description: "Wie oben, dazu zwei Joker." },
          { id: "skat-32", label: "Deutsches Blatt (32)", description: "Eichel, Grün, Herz, Schellen von 7 bis Ass." },
          { id: "party-40", label: "Party-Deck (40)", description: "Frei definiertes Beispieldeck mit eigenen Symbolen." },
          { id: "french-104", label: "Doppeldeck (108)", description: "Zwei französische Blätter und vier Joker." }
        ]
      },
      {
        kind: "number",
        id: "handSize",
        settingKey: cardTableRoomSettingKeys.handSize,
        actionKey: "handSize",
        label: "Handkarten",
        description: "Karten pro Spieler beim Austeilen.",
        // Nur dort sichtbar, wo die Zahl wirklich frei ist: Schwimmen spielt
        // immer mit drei, die Stichwette steigert selbst, und die übrigen
        // Regelwerke teilen das ganze Blatt aus.
        visibleWhen: {
          field: cardTableRoomSettingKeys.ruleset,
          anyOf: ["mau-mau", "luegen", "fischen", "free-play"]
        },
        min: 3,
        max: 12,
        step: 1,
        defaultValue: 5
      },
      {
        kind: "select",
        id: "doppelkopfScoring",
        settingKey: cardTableRoomSettingKeys.doppelkopfScoring,
        actionKey: "doppelkopfScoring",
        label: "Augen zählen",
        description: "Laufend mitzählen oder erst am Ende auszählen, wie am echten Tisch.",
        visibleWhen: { field: cardTableRoomSettingKeys.ruleset, anyOf: ["doppelkopf"] },
        defaultValue: "live",
        options: [
          { id: "live", label: "Laufend zählen", description: "Jeder Stich zeigt seine Augen, der Sitzplatz den Stand." },
          { id: "end", label: "Erst am Ende", description: "Während der Runde keine Zahlen - abgerechnet wird zum Schluss." }
        ]
      },
      {
        kind: "number",
        id: "botCount",
        settingKey: cardTableRoomSettingKeys.botCount,
        actionKey: "botCount",
        label: "KI-Spieler",
        description:
          "Virtuelle Mitspieler, die der Tisch selbst steuert. Sie füllen bis zu sechs Plätze auf und spielen nach demselben Regelwerk. Fehlt einem Regelwerk die Mindestbesetzung, füllt der Tisch von selbst auf.",
        min: 0,
        max: 5,
        step: 1,
        defaultValue: 0
      },
      {
        kind: "select",
        id: "cardStyle",
        settingKey: cardTableRoomSettingKeys.cardStyle,
        actionKey: "cardStyle",
        label: "Kartenbild",
        defaultValue: "classic",
        options: [
          { id: "classic", label: "Klassisch", description: "Weißes Blatt mit Serifen, Ecken und Pips." },
          { id: "modern", label: "Modern", description: "Farbiges Feld, große Ziffer, weit lesbar." },
          { id: "clear", label: "Klar", description: "Sehr reduziert: riesige Zahl, kleines Zeichen." }
        ]
      }
    ]
  },
  phaseDurations: {
    roundIntroMs: 1_500,
    countdownMs: 1_000,
    lockedMs: 2_000,
    resultMs: 5_000,
    scoreboardMs: 5_000
  },
  ownsScreens: ["round_intro", "result"],
  visual: { accent: "#8d5f4a", icon: "cards", eyebrow: "Karten" },
  audio: { track: { profile: "gentle", bpm: 96, rootMidi: 53, masterGain: 0.11 } },
  controllerChrome: { bare: true }
} as const satisfies GameManifest;

export const manifest = cardTableManifest;
