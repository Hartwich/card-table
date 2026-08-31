import type { GameManifest } from "@open-party-lab/game-core";

export const cardTableRoomSettingKeys = {
  ruleset: "cardTableRuleset",
  deck: "cardTableDeck",
  handSize: "cardTableHandSize"
} as const;

export const cardTableManifest = {
  id: "card-table",
  displayName: "Kartentisch",
  description:
    "Gemeinsamer Spieltisch für Kartenspiele mit Mau-Mau, Schwimmen, Wizard, Elfer raus und freiem Spiel.",
  minPlayers: 2,
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
            id: "wizard",
            label: "Wizard",
            description: "Stiche ansagen und treffen. Eigenes Blatt, steigende Kartenzahl je Runde."
          },
          {
            id: "elfer-raus",
            label: "Elfer raus",
            description: "Vier Farbreihen von 1 bis 20, eröffnet mit der Elf. Eigenes Zahlenblatt."
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
        description: "Gilt für Mau-Mau, Schwimmen und Freies Spiel. Wizard und Elfer raus bringen ihr eigenes Blatt mit.",
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
        description: "Karten pro Spieler beim Austeilen. Schwimmen spielt immer mit drei, Wizard mit einer Karte mehr pro Runde.",
        min: 3,
        max: 12,
        step: 1,
        defaultValue: 5
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
  visual: { accent: "#8d5f4a", eyebrow: "Karten" },
  audio: { track: { profile: "gentle", bpm: 96, rootMidi: 53, masterGain: 0.11 } },
  controllerChrome: { bare: true }
} as const satisfies GameManifest;

export const manifest = cardTableManifest;
