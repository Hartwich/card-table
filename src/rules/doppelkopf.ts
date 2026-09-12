import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableStackState } from "../protocol.js";
import { bestOf } from "../bots/tactics.js";
import {
  beginTrickPause,
  handsEmpty,
  hideLastTrick,
  isTrickPending,
  sweepTrick,
  toggleLastTrick,
  trickWinnerId
} from "./trickPause.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  readNumber,
  readSetting,
  readText,
  withError,
  writeExtra,
  type CardGameState,
  type CardPlayCheck,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Doppelkopf.
 *
 * Das umfangreichste Regelwerk am Tisch, und das einzige mit einer Frage vor
 * dem Spiel: Jeder sagt reihum, ob er "gesund" ist oder einen Vorbehalt hat -
 * eine Hochzeit oder ein Solo. Daraus ergibt sich die Spielart, und die
 * entscheidet, was überhaupt Trumpf ist. Deshalb ist hier nichts davon eine
 * Konstante: `isTrump` und `trumpRank` bekommen die Spielart als Parameter,
 * und `trickWinner` liest sie aus dem Zustand.
 *
 * Während des Spiels kommen Ansagen dazu: Re und Kontra sagen, wer zu welcher
 * Partei gehört und verdoppeln den Wert; die Absagen "keine 90" bis "schwarz"
 * setzen nach und müssen sinkende Restkartenzahlen einhalten.
 */

const trickZoneId = "stich";
const lastTrickZoneId = "letzter-stich";
const wonZoneId = "abgelegt";

const leadKey = "leadKind";
const trickLeaderKey = "trickLeaderIndex";
const trickCountKey = "trickCount";
const halfKey = "halfPoints";
const phaseKey = "phase";
const kindKey = "gameKind";
const soloistKey = "soloist";
const soloSuitKey = "soloSuit";
const partnerKey = "partner";
const pointsKey = (playerId: string): string => `pts:${playerId}`;
const tricksKey = (playerId: string): string => `tricks:${playerId}`;
const partyKey = (playerId: string): string => `party:${playerId}`;
const reserveKey = (playerId: string): string => `reserve:${playerId}`;
const announceKey = (playerId: string): string => `say:${playerId}`;

const noLead = "";
const trumpLead = "*";

/**
 * Die einstellbaren Hausregeln.
 *
 * Beim Austeilen werden sie einmal in den Rundenzustand geschrieben (`opt:…`).
 * Danach liest jede Funktion sie von dort - auch die reinen, die keinen Kontext
 * haben. Das hat zwei Vorteile: Die Regeln können sich mitten im Durchgang
 * nicht ändern, und `trickWinner` bleibt eine Funktion über den Zustand.
 */
const settingKeys = {
  nines: "cardTableDokoNines",
  secondDulle: "cardTableDokoSecondDulle",
  doppelkopf: "cardTableDokoDoppelkopf",
  fox: "cardTableDokoFox",
  charlie: "cardTableDokoCharlie",
  foxEnd: "cardTableDokoFoxEnd",
  pigs: "cardTableDokoPigs",
  againstOld: "cardTableDokoAgainstOld",
  bock: "cardTableDokoBock",
  forced: "cardTableDokoForced"
} as const;

const optionKey = (name: string): string => `opt:${name}`;
const pigsOwnerKey = "pigsOwner";
const bockActiveKey = "bockActive";
const bockPendingKey = "bockPending";

function optionOn(state: CardGameState, name: string): boolean {
  return state.extra[optionKey(name)] === true;
}

function settingOn(context: CardRulesetContext, key: string, fallback: "on" | "off"): boolean {
  return readSetting(context, key, fallback) === "on";
}

/** Augen je Rang. Zusammen 240 im vollen Blatt. */
const cardPoints: Record<string, number> = { ace: 11, "10": 10, king: 4, queen: 3, jack: 2, "9": 0 };

/** Rangfolge innerhalb einer Fehlfarbe. */
const fehlOrder: Record<string, number> = { ace: 6, "10": 5, king: 4, queen: 3, jack: 2, "9": 1 };

const suitOrder: Record<string, number> = { clubs: 4, spades: 3, hearts: 2, diamonds: 1 };

/**
 * Die Spielarten.
 *
 * `normal` und `wedding` teilen dieselbe Trumpfordnung - bei der Hochzeit
 * ändert sich nur, wer mit wem spielt. Die Soli drehen daran: Beim Farbsolo
 * tritt eine andere Farbe an die Stelle von Karo, bei den Rangsoli ist
 * ausschliesslich ein Rang Trumpf, beim Nullsolo gibt es gar keinen.
 */
type DokoKind =
  | "normal"
  | "wedding"
  | "solo-suit"
  | "solo-queens"
  | "solo-jacks"
  | "solo-kings"
  | "solo-aces"
  | "solo-tens"
  | "solo-nines"
  | "solo-null";

const rankSoloRank: Partial<Record<DokoKind, string>> = {
  "solo-queens": "queen",
  "solo-jacks": "jack",
  "solo-kings": "king",
  "solo-aces": "ace",
  "solo-tens": "10",
  "solo-nines": "9"
};

interface Reservation {
  id: string;
  kind: DokoKind;
  /** Trumpffarbe beim Farbsolo. */
  suitId?: string;
  /** Je kleiner, desto stärker - Solo schlägt Hochzeit. */
  priority: number;
}

const reservations: Reservation[] = [
  { id: "solo-clubs", kind: "solo-suit", suitId: "clubs", priority: 1 },
  { id: "solo-spades", kind: "solo-suit", suitId: "spades", priority: 1 },
  { id: "solo-hearts", kind: "solo-suit", suitId: "hearts", priority: 1 },
  { id: "solo-diamonds", kind: "solo-suit", suitId: "diamonds", priority: 1 },
  { id: "solo-queens", kind: "solo-queens", priority: 1 },
  { id: "solo-jacks", kind: "solo-jacks", priority: 1 },
  { id: "solo-kings", kind: "solo-kings", priority: 1 },
  { id: "solo-aces", kind: "solo-aces", priority: 1 },
  { id: "solo-tens", kind: "solo-tens", priority: 1 },
  { id: "solo-nines", kind: "solo-nines", priority: 1 },
  { id: "solo-null", kind: "solo-null", priority: 1 },
  { id: "wedding", kind: "wedding", priority: 2 },
  { id: "healthy", kind: "normal", priority: 9 }
];

function reservationById(id: string): Reservation | undefined {
  return reservations.find((entry) => entry.id === id);
}

/** Ansagestufen. 1 ist Re bzw. Kontra, darüber folgen die Absagen. */
const announceLevels = [1, 2, 3, 4, 5] as const;

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Doppelkopf: Erst der Vorbehalt - gesund, Hochzeit oder Solo.",
    reserveTitle: "Vorbehalt",
    healthy: "Gesund",
    wedding: "Hochzeit",
    soloPrefix: "Solo",
    soloQueens: "Damensolo",
    soloJacks: "Bubensolo",
    soloKings: "Königesolo",
    soloAces: "Fleischloser",
    soloTens: "Zehnensolo",
    soloNines: "Neunensolo",
    soloNull: "Nullsolo",
    declares: "sagt",
    askReserve: "Vorbehalt?",
    normalGame: "Normalspiel",
    weddingGame: "Hochzeit",
    partnerFound: "ist der gesuchte Partner",
    weddingAlone: "Hochzeit ohne Partner - der Spieler spielt solo.",
    re: "Re",
    kontra: "Kontra",
    no90: "keine 90",
    no60: "keine 60",
    no30: "keine 30",
    black: "schwarz",
    announces: "sagt an",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    mustTrump: "Trumpf muss bedient werden.",
    mustFollow: "Die angespielte Farbe muss bedient werden.",
    reserveFirst: "Zuerst den Vorbehalt ansagen.",
    trickResting: "Der Stich liegt noch - kurz warten.",
    tooLate: "Dafür ist es zu spät.",
    alreadySaid: "Schon angesagt.",
    plays: "legt",
    takesTrick: "macht den Stich",
    trick: "Stich",
    lastTrick: "Letzter Stich",
    eyes: "Augen",
    trumpLabel: "Trumpf",
    reWins: "Re gewinnt mit",
    kontraWins: "Kontra gewinnt mit",
    soloWins: "Das Solo ist gewonnen",
    soloLost: "Das Solo ist verloren",
    youAre: "Du bist",
    countedLater: "Augen werden am Ende gezählt",
    end: "Durchgang beenden",
    foxCaught: "Fuchs gefangen",
    foxEnd: "Fuchs am End",
    forcedSay: "Pflichtansage",
    bockRound: "Bockrunde",
    charlie: "Karlchen",
    doppelkopf: "Doppelkopf",
    againstOld: "gegen die Alten"
  },
  en: {
    intro: "Doppelkopf: reservations first - healthy, wedding or solo.",
    reserveTitle: "Reservation",
    healthy: "Healthy",
    wedding: "Wedding",
    soloPrefix: "Solo",
    soloQueens: "Queen solo",
    soloJacks: "Jack solo",
    soloKings: "King solo",
    soloAces: "Ace solo",
    soloTens: "Ten solo",
    soloNines: "Nine solo",
    soloNull: "Null solo",
    declares: "declares",
    askReserve: "Reservation?",
    normalGame: "Normal game",
    weddingGame: "Wedding",
    partnerFound: "is the partner",
    weddingAlone: "Wedding without a partner - played as a solo.",
    re: "Re",
    kontra: "Kontra",
    no90: "no 90",
    no60: "no 60",
    no30: "no 30",
    black: "black",
    announces: "announces",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    mustTrump: "You must follow trump.",
    mustFollow: "You must follow the suit that was led.",
    reserveFirst: "Declare your reservation first.",
    trickResting: "The trick is still on the table.",
    tooLate: "Too late for that.",
    alreadySaid: "Already announced.",
    plays: "plays",
    takesTrick: "takes the trick",
    trick: "Trick",
    lastTrick: "Last trick",
    eyes: "eyes",
    trumpLabel: "Trump",
    reWins: "Re wins with",
    kontraWins: "Kontra wins with",
    soloWins: "The solo is won",
    soloLost: "The solo is lost",
    youAre: "You are",
    countedLater: "eyes are counted at the end",
    end: "End deal",
    foxCaught: "fox caught",
    foxEnd: "fox in the last trick",
    forcedSay: "compulsory announcement",
    bockRound: "double round",
    charlie: "Charlie",
    doppelkopf: "Doppelkopf",
    againstOld: "against the old ones"
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function reservationLabel(reservation: Reservation, context: CardRulesetContext): string {
  const text = words(context);

  if (reservation.kind === "normal") {
    return text.healthy as string;
  }

  if (reservation.kind === "wedding") {
    return text.wedding as string;
  }

  if (reservation.kind === "solo-suit") {
    const suit = context.deck.suits.find((entry) => entry.id === reservation.suitId);
    return `${text.soloPrefix} ${suit?.symbol ?? ""}`.trim();
  }

  const names: Partial<Record<DokoKind, string>> = {
    "solo-queens": text.soloQueens as string,
    "solo-jacks": text.soloJacks as string,
    "solo-kings": text.soloKings as string,
    "solo-aces": text.soloAces as string,
    "solo-tens": text.soloTens as string,
    "solo-nines": text.soloNines as string,
    "solo-null": text.soloNull as string
  };

  return names[reservation.kind] ?? reservation.id;
}

// ---------------------------------------------------------------------------
// Spielart
// ---------------------------------------------------------------------------

function gameKind(state: CardGameState): DokoKind {
  return (readText(state, kindKey) as DokoKind | null) ?? "normal";
}

function soloSuitId(state: CardGameState): string {
  return readText(state, soloSuitKey) ?? "diamonds";
}

function isSolo(kind: DokoKind): boolean {
  return kind !== "normal" && kind !== "wedding";
}

/** Ist diese Karte in dieser Spielart Trumpf? */
function isTrump(card: CardInstance, kind: DokoKind, trumpSuit: string): boolean {
  if (kind === "solo-null") {
    return false;
  }

  const rankSolo = rankSoloRank[kind];

  if (rankSolo) {
    return card.rankId === rankSolo;
  }

  // Normalspiel, Hochzeit und Farbsolo: Dulle, Damen, Buben und die Trumpffarbe.
  return (
    card.suitId === trumpSuit ||
    card.rankId === "queen" ||
    card.rankId === "jack" ||
    (card.suitId === "hearts" && card.rankId === "10")
  );
}

/**
 * Rangwert innerhalb des Trumpfs - je höher, desto stärker.
 *
 * Sind Schweinchen im Spiel, stehen die beiden Karo-Asse über der Dulle; sonst
 * sind sie der kleinste Trumpf wie jede andere Karo-Karte.
 */
function trumpRank(card: CardInstance, kind: DokoKind, pigs = false): number {
  if (pigs && isFox(card) && !isSolo(kind)) {
    return 110;
  }

  if (rankSoloRank[kind]) {
    return 80 + (suitOrder[card.suitId ?? ""] ?? 0);
  }

  if (card.suitId === "hearts" && card.rankId === "10") {
    return 100;
  }

  if (card.rankId === "queen") {
    return 90 + (suitOrder[card.suitId ?? ""] ?? 0);
  }

  if (card.rankId === "jack") {
    return 80 + (suitOrder[card.suitId ?? ""] ?? 0);
  }

  return 70 + (fehlOrder[card.rankId] ?? 0);
}

function cardValue(card: CardInstance): number {
  return cardPoints[card.rankId] ?? 0;
}

function isClubQueen(card: CardInstance): boolean {
  return card.rankId === "queen" && card.suitId === "clubs";
}

function isFox(card: CardInstance): boolean {
  return card.rankId === "ace" && card.suitId === "diamonds";
}

function isCharlie(card: CardInstance): boolean {
  return card.rankId === "jack" && card.suitId === "clubs";
}

// ---------------------------------------------------------------------------
// Zustand lesen
// ---------------------------------------------------------------------------

function phaseOf(state: CardGameState): string {
  return readText(state, phaseKey) ?? "reserve";
}

function isReservePhase(state: CardGameState): boolean {
  return phaseOf(state) === "reserve";
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

/** Liegen angesagte Schweinchen auf dem Tisch? */
function hasPigs(state: CardGameState): boolean {
  return optionOn(state, "pigs") && Boolean(readText(state, pigsOwnerKey));
}

function trickCardIds(state: CardGameState): string[] {
  return state.table.zones[trickZoneId] ?? [];
}

function pointsOf(state: CardGameState, playerId: string): number {
  return readNumber(state, pointsKey(playerId));
}

/** Gehört dieser Sitz zur Re-Partei? Hängt an der Spielart. */
function isRe(state: CardGameState, playerId: string): boolean {
  const kind = gameKind(state);

  if (isSolo(kind)) {
    return readText(state, soloistKey) === playerId;
  }

  if (kind === "wedding") {
    return readText(state, soloistKey) === playerId || readText(state, partnerKey) === playerId;
  }

  return state.extra[partyKey(playerId)] === true;
}

function reParty(state: CardGameState): string[] {
  return state.table.turnOrder.filter((playerId) => isRe(state, playerId));
}

function leadKind(state: CardGameState): string {
  return readText(state, leadKey) ?? noLead;
}

function announceLevelOf(state: CardGameState, playerId: string): number {
  return readNumber(state, announceKey(playerId));
}

/** Höchste Ansage einer Partei. */
function partyAnnounceLevel(state: CardGameState, re: boolean): number {
  return state.table.turnOrder
    .filter((playerId) => isRe(state, playerId) === re)
    .reduce((top, playerId) => Math.max(top, announceLevelOf(state, playerId)), 0);
}

function announceLabel(level: number, re: boolean, context: CardRulesetContext): string {
  const text = words(context);

  switch (level) {
    case 1:
      return (re ? text.re : text.kontra) as string;
    case 2:
      return text.no90 as string;
    case 3:
      return text.no60 as string;
    case 4:
      return text.no30 as string;
    default:
      return text.black as string;
  }
}

/**
 * Ab wie vielen Restkarten eine Stufe noch gesagt werden darf.
 *
 * Nach den Turnierregeln: Re und Kontra bis 11 Restkarten, dann je eine Karte
 * weniger. Bei einem kürzeren Blatt verschiebt sich das Fenster mit.
 */
function announceDeadline(state: CardGameState, level: number): number {
  return Math.max(1, state.handSize - level);
}

function remainingCards(state: CardGameState, playerId: string): number {
  return handOf(state.table, playerId).length;
}

// ---------------------------------------------------------------------------
// Stichauswertung
// ---------------------------------------------------------------------------

function trickWinner(state: CardGameState): string {
  const cardIds = trickCardIds(state);
  const order = state.table.turnOrder;
  const leaderIndex = readNumber(state, trickLeaderKey);
  const lead = leadKind(state);
  const kind = gameKind(state);
  const trumpSuit = soloSuitId(state);
  const pigs = hasPigs(state);
  const secondDulle = optionOn(state, "secondDulle");
  let bestIndex = 0;
  let bestScore = -1;

  cardIds.forEach((cardId, index) => {
    const card = state.table.cards[cardId];

    if (!card) {
      return;
    }

    const trump = isTrump(card, kind, trumpSuit);
    const follows = lead === trumpLead ? trump : !trump && card.suitId === lead;

    if (!trump && !follows) {
      return;
    }

    // Trumpf sticht jede Fehlfarbe; bei gleichen Karten gewinnt die erste.
    const score = trump ? 1_000 + trumpRank(card, kind, pigs) : fehlOrder[card.rankId] ?? 0;
    const isDulle = card.suitId === "hearts" && card.rankId === "10" && !rankSoloRank[kind];
    // Hausregel: Fallen beide Dullen in einen Stich, gewinnt die zweite.
    const beats = secondDulle && isDulle ? score >= bestScore : score > bestScore;

    if (beats) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return order[(leaderIndex + bestIndex) % order.length] as string;
}

function wouldTakeTrick(state: CardGameState, playerId: string, cardId: string): boolean {
  const simulated: CardGameState = {
    ...state,
    table: {
      ...state.table,
      zones: { ...state.table.zones, [trickZoneId]: [...trickCardIds(state), cardId] }
    }
  };

  return trickWinner(simulated) === playerId;
}

// ---------------------------------------------------------------------------
// Wertung
// ---------------------------------------------------------------------------

interface DealResult {
  reWon: boolean;
  value: number;
  reEyes: number;
  kontraEyes: number;
}

/**
 * Rechnet den Durchgang ab.
 *
 * Turniernah, aber nicht turniergenau: Grundwert eins, je erreichte Schwelle
 * (unter 90, 60, 30, schwarz) ein Punkt dazu, jede gehaltene Absage ebenfalls.
 * Re und Kontra verdoppeln den Wert. Eine verfehlte Absage dreht den Sieg um -
 * wer zu viel verspricht, verliert.
 */
function settleDeal(state: CardGameState): DealResult {
  const seats = state.table.turnOrder;
  const half = readNumber(state, halfKey, 120);
  const reEyes = seats.filter((id) => isRe(state, id)).reduce((sum, id) => sum + pointsOf(state, id), 0);
  const kontraEyes = seats
    .filter((id) => !isRe(state, id))
    .reduce((sum, id) => sum + pointsOf(state, id), 0);

  const reSaid = partyAnnounceLevel(state, true);
  const kontraSaid = partyAnnounceLevel(state, false);

  // Wer eine Absage gehalten hat, und wer sie verfehlt hat.
  const targets = [0, half, 90, 60, 30, 1];
  const reKeptAbsage = reSaid < 2 || kontraEyes < (targets[reSaid] ?? 0);
  const kontraKeptAbsage = kontraSaid < 2 || reEyes < (targets[kontraSaid] ?? 0);

  let reWon = reEyes > half;

  // Nullsolo zählt nicht nach Augen: Der Alleinspieler darf keinen einzigen
  // Stich bekommen. Ein Stich mit null Augen ist also schon verloren.
  if (gameKind(state) === "solo-null") {
    const soloist = readText(state, soloistKey);
    reWon = soloist ? readNumber(state, tricksKey(soloist)) === 0 : false;
  }

  if (!reKeptAbsage) {
    reWon = false;
  } else if (!kontraKeptAbsage) {
    reWon = true;
  }

  if (gameKind(state) === "solo-null") {
    // Alles oder nichts, ohne Schwellen und ohne Absagen.
    return { reWon, value: 3, reEyes, kontraEyes };
  }

  const loserEyes = reWon ? kontraEyes : reEyes;
  let value = 1;

  for (const threshold of [90, 60, 30]) {
    if (loserEyes < threshold) {
      value += 1;
    }
  }

  if (loserEyes === 0) {
    value += 1;
  }

  // Gehaltene Absagen zählen zusätzlich.
  const winnerSaid = reWon ? reSaid : kontraSaid;
  value += Math.max(0, winnerSaid - 1);

  // Sonderpunkte des Normalspiels.
  if (gameKind(state) === "normal" && !reWon && optionOn(state, "againstOld")) {
    value += 1; // gegen die Alten gewonnen
  }

  value += readNumber(state, "bonus:re") * (reWon ? 1 : 0);
  value += readNumber(state, "bonus:kontra") * (reWon ? 0 : 1);

  if (reSaid >= 1) {
    value *= 2;
  }

  if (kontraSaid >= 1) {
    value *= 2;
  }

  if (state.extra[bockActiveKey] === true) {
    value *= 2;
  }

  return { reWon, value, reEyes, kontraEyes };
}

function finishDeal(state: CardGameState, context: CardRulesetContext): CardGameState {
  const text = words(context);
  const result = settleDeal(state);
  let next = state;

  for (const playerId of state.table.turnOrder) {
    next = appendLog(
      next,
      playerName(context, playerId),
      `${isRe(next, playerId) ? text.re : text.kontra} · ${pointsOf(next, playerId)} ${text.eyes}`
    );
  }

  // Bockrunde für die nächste Runde: klassisch nach verlorenem Re und wenn
  // eine Partei schwarz bleibt. Gemerkt wird es im eigenen Ablageplatz, den die
  // nächste Runde über `previousExtra` liest.
  if (optionOn(state, "bock")) {
    const reSaid = partyAnnounceLevel(state, true) >= 1;
    const blank = result.reEyes === 0 || result.kontraEyes === 0;

    if ((reSaid && !result.reWon) || blank) {
      next = appendLog(writeExtra(next, { [bockPendingKey]: true }), null, text.bockRound as string);
    }
  }

  const kind = gameKind(state);
  const soloist = readText(state, soloistKey);
  const message = isSolo(kind)
    ? `${result.reWon ? text.soloWins : text.soloLost} (${soloist ? playerName(context, soloist) : "?"}, ${result.reEyes} ${text.eyes})`
    : `${result.reWon ? text.reWins : text.kontraWins} ${result.reWon ? result.reEyes : result.kontraEyes} ${text.eyes}`;

  return finishGame(next, null, null, message);
}

// ---------------------------------------------------------------------------
// Vorbehalt
// ---------------------------------------------------------------------------

function declaredReservation(state: CardGameState, playerId: string): string | null {
  return readText(state, reserveKey(playerId));
}

function allDeclared(state: CardGameState): boolean {
  return state.table.turnOrder.every((playerId) => declaredReservation(state, playerId) !== null);
}

/** Darf dieser Spieler eine Hochzeit ansagen? Nur mit beiden Kreuz-Damen. */
function hasWedding(state: CardGameState, playerId: string): boolean {
  return (
    handOf(state.table, playerId).filter((cardId) => {
      const card = state.table.cards[cardId];
      return card ? isClubQueen(card) : false;
    }).length >= 2
  );
}

/**
 * Löst die Vorbehalte auf und legt die Spielart fest.
 *
 * Rangfolge: Solo schlägt Hochzeit, Hochzeit schlägt das Normalspiel. Bei
 * gleichem Rang kommt der frühere Sitz zuerst - reihum gefragt, reihum
 * entschieden.
 */
function resolveReservations(state: CardGameState, context: CardRulesetContext): CardGameState {
  const text = words(context);
  let best: { playerId: string; reservation: Reservation } | null = null;

  for (const playerId of state.table.turnOrder) {
    const reservation = reservationById(declaredReservation(state, playerId) ?? "healthy");

    if (!reservation || reservation.kind === "normal") {
      continue;
    }

    if (!best || reservation.priority < best.reservation.priority) {
      best = { playerId, reservation };
    }
  }

  const dealtPoints = Object.values(state.table.hands)
    .flat()
    .reduce((sum, cardId) => {
      const card = state.table.cards[cardId];
      return sum + (card ? cardValue(card) : 0);
    }, 0);

  const base = writeExtra(
    { ...state, table: { ...state.table, activeIndex: 0 }, updatedAt: context.now },
    {
      [phaseKey]: "play",
      [leadKey]: noLead,
      [trickLeaderKey]: 0,
      [halfKey]: Math.floor(dealtPoints / 2)
    }
  );

  if (!best) {
    // Normalspiel: Die Kreuz-Damen bilden Re.
    const parties: Record<string, boolean> = {};

    for (const playerId of state.table.turnOrder) {
      parties[partyKey(playerId)] = handOf(state.table, playerId).some((cardId) => {
        const card = state.table.cards[cardId];
        return card ? isClubQueen(card) : false;
      });
    }

    return appendLog(writeExtra(base, { ...parties, [kindKey]: "normal" }), null, text.normalGame as string);
  }

  const announced = writeExtra(base, {
    [kindKey]: best.reservation.kind,
    [soloistKey]: best.playerId,
    [soloSuitKey]: best.reservation.suitId ?? "diamonds"
  });

  return appendLog(
    announced,
    playerName(context, best.playerId),
    `${text.declares} ${reservationLabel(best.reservation, context)}`
  );
}

/**
 * Hochzeit: Der erste Stich, den ein anderer holt, bestimmt den Partner.
 *
 * Bleiben die ersten drei Stiche beim Hochzeits-Spieler, spielt er allein
 * weiter - so will es die verbreitete Regel, und sie verhindert, dass sich
 * jemand durch Zögern einen Partner erschleicht.
 */
function resolveWedding(
  state: CardGameState,
  context: CardRulesetContext,
  winnerId: string
): CardGameState {
  if (gameKind(state) !== "wedding" || readText(state, partnerKey)) {
    return state;
  }

  const text = words(context);
  const soloist = readText(state, soloistKey);
  const trickNumber = readNumber(state, trickCountKey) + 1;

  if (winnerId !== soloist) {
    return appendLog(
      writeExtra(state, { [partnerKey]: winnerId }),
      playerName(context, winnerId),
      text.partnerFound as string
    );
  }

  if (trickNumber >= 3) {
    return appendLog(writeExtra(state, { [kindKey]: "solo-suit" }), null, text.weddingAlone as string);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Sonderpunkte
// ---------------------------------------------------------------------------

/**
 * Sonderpunkte des Normalspiels, im Moment des Stichs gezählt.
 *
 * Fuchs gefangen, Karlchen im letzten Stich und der Doppelkopf (ein Stich mit
 * 40 oder mehr Augen) gehören der Partei des Stichgewinners. In einem Solo
 * entfallen sie - so steht es in den Turnierregeln.
 */
function trickBonus(
  state: CardGameState,
  context: CardRulesetContext,
  winnerId: string,
  eyes: number,
  lastTrick: boolean
): CardGameState {
  if (isSolo(gameKind(state))) {
    return state;
  }

  const text = words(context);
  const winnerRe = isRe(state, winnerId);
  const slot = winnerRe ? "bonus:re" : "bonus:kontra";
  const played = trickCardIds(state);
  let bonus = 0;
  let next = state;

  if (eyes >= 40 && optionOn(state, "doppelkopf")) {
    bonus += 1;
    next = appendLog(next, playerName(context, winnerId), text.doppelkopf as string);
  }

  for (const cardId of optionOn(state, "fox") ? played : []) {
    const card = state.table.cards[cardId];

    if (!card || !isFox(card)) {
      continue;
    }

    // Der Fuchs zählt nur, wenn er der Gegenpartei gehörte.
    const ownerIndex = played.indexOf(cardId);
    const leaderIndex = readNumber(state, trickLeaderKey);
    const order = state.table.turnOrder;
    const owner = order[(leaderIndex + ownerIndex) % order.length] as string;

    if (isRe(state, owner) !== winnerRe) {
      bonus += 1;
      next = appendLog(next, playerName(context, winnerId), text.foxCaught as string);
    }
  }

  if (lastTrick && optionOn(state, "charlie")) {
    for (const cardId of played) {
      const card = state.table.cards[cardId];

      if (card && isCharlie(card)) {
        bonus += 1;
        next = appendLog(next, playerName(context, winnerId), text.charlie as string);
      }
    }
  }

  // Fuchs am End: ein Karo-Ass im letzten Stich zählt für die Partei, die ihn holt.
  if (lastTrick && optionOn(state, "foxEnd")) {
    for (const cardId of played) {
      const card = state.table.cards[cardId];

      if (card && isFox(card)) {
        bonus += 1;
        next = appendLog(next, playerName(context, winnerId), text.foxEnd as string);
      }
    }
  }

  return bonus === 0 ? next : writeExtra(next, { [slot]: readNumber(next, slot) + bonus });
}

// ---------------------------------------------------------------------------
// Regelwerk
// ---------------------------------------------------------------------------

export const doppelkopfRuleset: CardRuleset = {
  id: "doppelkopf",
  label: { de: "Doppelkopf", en: "Doppelkopf" },
  defaultDeckId: "doppelkopf-48",
  defaultHandSize: 12,
  /** Doppelkopf ist ein Spiel zu viert. */
  minSeats: 4,
  openStartCard: false,
  turnBased: true,

  deckIdFor(settings) {
    return settings[settingKeys.nines] === "without" ? "doppelkopf-40" : "doppelkopf-48";
  },

  handSizeFor({ playerCount, deckCards }) {
    return Math.max(1, Math.floor(deckCards / Math.max(1, playerCount)));
  },

  setupRound(state, context) {
    const counters: Record<string, number | string | boolean | null> = {
      [phaseKey]: "reserve",
      [kindKey]: "normal",
      [leadKey]: noLead,
      [trickLeaderKey]: 0,
      [trickCountKey]: 0,
      [soloistKey]: null,
      [soloSuitKey]: "diamonds",
      [partnerKey]: null,
      "bonus:re": 0,
      "bonus:kontra": 0
    };

    for (const playerId of state.table.turnOrder) {
      counters[pointsKey(playerId)] = 0;
      counters[tricksKey(playerId)] = 0;
      counters[partyKey(playerId)] = false;
      counters[reserveKey(playerId)] = null;
      counters[announceKey(playerId)] = 0;
    }

    // Hausregeln einmal festschreiben - ab hier gelten sie für den Durchgang.
    counters[optionKey("secondDulle")] = settingOn(context, settingKeys.secondDulle, "off");
    counters[optionKey("doppelkopf")] = settingOn(context, settingKeys.doppelkopf, "on");
    counters[optionKey("fox")] = settingOn(context, settingKeys.fox, "on");
    counters[optionKey("charlie")] = settingOn(context, settingKeys.charlie, "on");
    counters[optionKey("foxEnd")] = settingOn(context, settingKeys.foxEnd, "off");
    counters[optionKey("pigs")] = settingOn(context, settingKeys.pigs, "off");
    counters[optionKey("againstOld")] = settingOn(context, settingKeys.againstOld, "on");
    counters[optionKey("bock")] = settingOn(context, settingKeys.bock, "off");
    counters[optionKey("forced")] = settingOn(context, settingKeys.forced, "off");

    // Schweinchen: Wer beide Karo-Asse hält, hat die beiden höchsten Trümpfe.
    counters[pigsOwnerKey] = counters[optionKey("pigs")]
      ? state.table.turnOrder.find(
          (playerId) =>
            handOf(state.table, playerId).filter((cardId) => {
              const card = state.table.cards[cardId];
              return card ? isFox(card) : false;
            }).length >= 2
        ) ?? null
      : null;

    // Bockrunde: Hat die Vorrunde eine angekündigt, zählt diese doppelt.
    counters[bockActiveKey] =
      counters[optionKey("bock")] === true && context.previousExtra[bockPendingKey] === true;
    counters[bockPendingKey] = false;

    return {
      ...state,
      table: {
        ...state.table,
        activeIndex: 0,
        zones: { ...state.table.zones, [trickZoneId]: [], [lastTrickZoneId]: [], [wonZoneId]: [] }
      },
      extra: { ...state.extra, ...counters }
    };
  },

  introMessage(context) {
    return words(context).intro as string;
  },

  rules(context) {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: [
              "Two against two, but who plays with whom is hidden at first.",
              "The club queens form Re, the other two are Kontra.",
              "Re needs more than half of the 240 eyes to win."
            ]
          },
          {
            title: "Reservations",
            lines: [
              "Before the first card, everyone declares in turn: healthy, wedding or a solo.",
              "A solo beats a wedding, a wedding beats the normal game.",
              "A wedding needs both club queens; the first trick another player takes decides the partner.",
              "Solos: one suit, queens, jacks, kings, aces, tens, nines, or no trump at all."
            ]
          },
          {
            title: "Trumps",
            lines: [
              "Normal game: ten of hearts highest, then queens, jacks, then diamonds.",
              "Suit solo: the chosen suit takes the place of diamonds.",
              "Rank solo: only that rank is trump, ordered clubs, spades, hearts, diamonds.",
              "Null solo: no trumps - and the soloist must not take a single trick."
            ]
          },
          {
            title: "Announcements",
            lines: [
              "Re and Kontra double the value and reveal the party.",
              "Then come no 90, no 60, no 30 and black, each one card later at the latest.",
              "A missed announcement hands the deal to the other side."
            ]
          },
          {
            title: "Scoring",
            lines: [
              "One point for the win, one more per threshold the losers stay under.",
              "Doppelkopf (40+ eyes in one trick), fox caught and Charlie in the last trick each add a point.",
              "A solo counts three times for the soloist.",
              "Which house rules apply is set on the host: pigs, fox in the last trick, second ten of hearts, double round and compulsory announcement."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: [
              "Zwei gegen zwei - wer mit wem spielt, bleibt zunächst verdeckt.",
              "Die Kreuz-Damen bilden Re, die anderen beiden sind Kontra.",
              "Re gewinnt mit mehr als der Hälfte der 240 Augen."
            ]
          },
          {
            title: "Vorbehalt",
            lines: [
              "Vor der ersten Karte sagt jeder reihum: gesund, Hochzeit oder ein Solo.",
              "Ein Solo schlägt die Hochzeit, die Hochzeit das Normalspiel.",
              "Die Hochzeit braucht beide Kreuz-Damen; der erste Stich, den ein anderer holt, bestimmt den Partner.",
              "Soli: eine Farbe, Damen, Buben, Könige, Asse, Zehnen, Neunen - oder gar kein Trumpf."
            ]
          },
          {
            title: "Trumpf",
            lines: [
              "Normalspiel: Herz-Zehn am höchsten, dann die Damen, die Buben, dann Karo.",
              "Farbsolo: Die gewählte Farbe tritt an die Stelle von Karo.",
              "Rangsolo: Nur dieser Rang ist Trumpf, in der Ordnung Kreuz, Pik, Herz, Karo.",
              "Nullsolo: Kein Trumpf - und der Alleinspieler darf keinen Stich machen."
            ]
          },
          {
            title: "Ansagen",
            lines: [
              "Re und Kontra verdoppeln den Wert und zeigen die Partei.",
              "Danach folgen keine 90, keine 60, keine 30 und schwarz - jede spätestens eine Karte später.",
              "Eine verfehlte Absage schenkt den Durchgang der Gegenseite."
            ]
          },
          {
            title: "Wertung",
            lines: [
              "Ein Punkt für den Sieg, je unterschrittene Schwelle einer dazu.",
              "Doppelkopf (40+ Augen in einem Stich), Fuchs gefangen und Karlchen im letzten Stich zählen je einen Punkt.",
              "Ein Solo zählt für den Alleinspieler dreifach.",
              "Welche Sonderregeln gelten, steht im Host-Setup: Schweinchen, Fuchs am End, zweite Dulle, Bockrunde und Pflichtansage."
            ]
          }
        ];
  },

  canPlayCard(state, context, playerId, cardId): CardPlayCheck {
    const text = words(context);

    if (!handOf(state.table, playerId).includes(cardId)) {
      return { allowed: false, hint: text.notInHand as string };
    }

    if (isReservePhase(state)) {
      return { allowed: false, hint: text.reserveFirst as string };
    }

    // Solange der fertige Stich noch offen liegt, wird nicht weitergespielt.
    if (isTrickPending(state)) {
      return { allowed: false, hint: text.trickResting as string };
    }

    if (!isActive(state, playerId)) {
      return { allowed: false, hint: text.notYourTurn as string };
    }

    const card = state.table.cards[cardId];

    if (!card) {
      return { allowed: false };
    }

    const kind = gameKind(state);
    const trumpSuit = soloSuitId(state);
    const lead = leadKind(state);

    if (lead === noLead) {
      return { allowed: true };
    }

    const trump = isTrump(card, kind, trumpSuit);
    const hand = handOf(state.table, playerId);

    if (lead === trumpLead) {
      if (trump) {
        return { allowed: true };
      }

      const hasTrump = hand.some((entry) => {
        const handCard = state.table.cards[entry];
        return handCard ? isTrump(handCard, kind, trumpSuit) : false;
      });

      return hasTrump ? { allowed: false, hint: text.mustTrump as string } : { allowed: true };
    }

    if (!trump && card.suitId === lead) {
      return { allowed: true };
    }

    const canFollow = hand.some((entry) => {
      const handCard = state.table.cards[entry];
      return handCard ? !isTrump(handCard, kind, trumpSuit) && handCard.suitId === lead : false;
    });

    return canFollow ? { allowed: false, hint: text.mustFollow as string } : { allowed: true };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = doppelkopfRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    const card = state.table.cards[cardId] as CardInstance;
    const face = toCardFace(context.deck, card);
    const kind = gameKind(state);
    const trumpSuit = soloSuitId(state);
    const wasEmpty = trickCardIds(state).length === 0;
    const table = moveCard(state.table, cardId, { kind: "zone", zoneId: trickZoneId }, "bottom");

    let next = appendLog(
      clearError({
        ...hideLastTrick(state),
        table,
        turnNumber: state.turnNumber + 1,
        updatedAt: context.now
      }),
      playerName(context, playerId),
      `${text.plays} ${face.rankLabel} ${face.suitSymbol}`
    );

    if (wasEmpty) {
      next = writeExtra(next, {
        [leadKey]: isTrump(card, kind, trumpSuit) ? trumpLead : card.suitId ?? noLead,
        [trickLeaderKey]: next.table.turnOrder.indexOf(playerId)
      });
    }

    if (trickCardIds(next).length < next.table.turnOrder.length) {
      return {
        ...next,
        table: {
          ...next.table,
          activeIndex: (next.table.activeIndex + 1) % next.table.turnOrder.length
        }
      };
    }

    const winnerId = trickWinner(next);
    const winnerIndex = Math.max(0, next.table.turnOrder.indexOf(winnerId));
    const eyes = trickCardIds(next).reduce((sum, entry) => {
      const trickCard = next.table.cards[entry];
      return sum + (trickCard ? cardValue(trickCard) : 0);
    }, 0);
    const trickCount = readNumber(next, trickCountKey) + 1;
    // Die Karte liegt schon im Stich, die Hände sind also bereits leer, wenn
    // dies der letzte Stich war.
    const lastTrick = handsEmpty(next);

    next = resolveWedding(next, context, winnerId);
    next = trickBonus(next, context, winnerId, eyes, lastTrick);

    // Pflichtansage: Liegen im ersten Stich 35 oder mehr Augen, muss der
    // Gewinner seine Partei offenlegen - das nimmt ihm die Wahl, nicht die Regel.
    if (
      optionOn(next, "forced") &&
      trickCount === 1 &&
      eyes >= 35 &&
      announceLevelOf(next, winnerId) === 0
    ) {
      next = appendLog(
        writeExtra(next, { [announceKey(winnerId)]: 1 }),
        playerName(context, winnerId),
        `${text.forcedSay}: ${announceLabel(1, isRe(next, winnerId), context)}`
      );
    }

    next = appendLog(
      writeExtra(
        { ...next, table: { ...next.table, activeIndex: winnerIndex } },
        {
          [pointsKey(winnerId)]: pointsOf(next, winnerId) + eyes,
          [tricksKey(winnerId)]: readNumber(next, tricksKey(winnerId)) + 1,
          [leadKey]: noLead,
          [trickLeaderKey]: winnerIndex,
          [trickCountKey]: trickCount
        }
      ),
      playerName(context, winnerId),
      countsLive(context) ? `${text.takesTrick} (${eyes} ${text.eyes})` : (text.takesTrick as string)
    );

    // Abgeräumt wird nicht hier, sondern in tick() nach der Pause - erst soll
    // der vollständige Stich zu sehen sein.
    return beginTrickPause(next, context, winnerId);
  },

  drawCard(state) {
    return state;
  },

  runAction(state, context, playerId, actionId) {
    if (actionId === "last-trick") {
      return (state.table.zones[lastTrickZoneId] ?? []).length === 0
        ? state
        : clearError(toggleLastTrick(state));
    }
    const text = words(context);

    // --- Vorbehalt ---
    if (actionId.startsWith("reserve:")) {
      if (!isReservePhase(state)) {
        return withError(state, text.tooLate as string);
      }

      if (!isActive(state, playerId)) {
        return withError(state, text.notYourTurn as string);
      }

      const reservation = reservationById(actionId.slice(8));

      if (!reservation) {
        return state;
      }

      if (reservation.kind === "wedding" && !hasWedding(state, playerId)) {
        return withError(state, text.tooLate as string);
      }

      let next = appendLog(
        clearError(writeExtra(state, { [reserveKey(playerId)]: reservation.id })),
        playerName(context, playerId),
        `${text.declares} ${reservationLabel(reservation, context)}`
      );

      if (allDeclared(next)) {
        return resolveReservations(next, context);
      }

      return {
        ...next,
        table: {
          ...next.table,
          activeIndex: (next.table.activeIndex + 1) % next.table.turnOrder.length
        },
        updatedAt: context.now
      };
    }

    // --- Ansagen und Absagen ---
    if (actionId.startsWith("say:")) {
      if (isReservePhase(state)) {
        return withError(state, text.reserveFirst as string);
      }

      const level = Number.parseInt(actionId.slice(4), 10);

      if (!Number.isFinite(level) || level < 1 || level > 5) {
        return state;
      }

      const re = isRe(state, playerId);
      const current = partyAnnounceLevel(state, re);

      if (level <= current) {
        return withError(state, text.alreadySaid as string);
      }

      if (level > current + 1) {
        return state;
      }

      if (remainingCards(state, playerId) < announceDeadline(state, level)) {
        return withError(state, text.tooLate as string);
      }

      return appendLog(
        clearError(writeExtra(state, { [announceKey(playerId)]: level })),
        playerName(context, playerId),
        `${text.announces} ${announceLabel(level, re, context)}`
      );
    }

    return state;
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    if (state.gameOver || state.phase !== "playing") {
      return [];
    }

    const text = words(context);

    if (isReservePhase(state)) {
      const active = isActive(state, playerId);

      return reservations
        .filter((reservation) => reservation.kind !== "wedding" || hasWedding(state, playerId))
        .map((reservation) => ({
          id: `reserve:${reservation.id}`,
          label: reservationLabel(reservation, context),
          kind: reservation.kind === "normal" ? ("primary" as const) : ("secondary" as const),
          enabled: active
        }));
    }

    const lastTrickAction: CardTableActionState = {
      id: "last-trick",
      label: text.lastTrick as string,
      kind: "secondary",
      enabled: (state.table.zones[lastTrickZoneId] ?? []).length > 0
    };

    if (isTrickPending(state)) {
      return [lastTrickAction];
    }

    const re = isRe(state, playerId);
    const current = partyAnnounceLevel(state, re);
    const next = current + 1;

    if (next > announceLevels.length) {
      return [lastTrickAction];
    }

    const open = remainingCards(state, playerId) >= announceDeadline(state, next);

    return [
      {
        id: `say:${next}`,
        label: announceLabel(next, re, context),
        kind: next === 1 ? ("primary" as const) : ("danger" as const),
        enabled: open,
        hint: open ? undefined : (text.tooLate as string)
      },
      lastTrickAction
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    return [
      {
        id: "end",
        label: words(context).end as string,
        kind: "danger",
        enabled: state.phase === "playing" && !state.gameOver
      }
    ];
  },

  runHostAction(state, context, actionId) {
    return actionId === "end" ? finishDeal(state, context) : state;
  },

  choiceForCard() {
    return undefined;
  },

  tableStacks(state, context): CardTableStackState[] {
    const text = words(context);
    const faces = (zoneId: string) =>
      (state.table.zones[zoneId] ?? [])
        .map((cardId) => state.table.cards[cardId])
        .filter((card): card is CardInstance => Boolean(card))
        .map((card) => toCardFace(context.deck, card));
    const trick = faces(trickZoneId);
    const last = faces(lastTrickZoneId);
    const lastWinnerId = trickWinnerId(state);

    return [
      {
        id: trickZoneId,
        label: `${text.trick} ${readNumber(state, trickCountKey) + (trick.length > 0 ? 1 : 0)}`,
        kind: "zone",
        count: trick.length,
        cards: trick,
        faceDown: false,
        layout: "spread"
      },
      {
        // Immer vorhanden, damit der Knopf am Host nicht erst nach dem ersten
        // Stich erscheint - gezeigt wird er nur auf Anforderung.
        id: lastTrickZoneId,
        label:
          lastWinnerId && last.length > 0
            ? `${text.lastTrick} · ${playerName(context, lastWinnerId)}`
            : (text.lastTrick as string),
        kind: "zone",
        count: last.length,
        cards: last,
        faceDown: false,
        layout: "spread",
        onDemand: true
      }
    ];
  },

  condition(state, context) {
    const text = words(context);

    if (isReservePhase(state)) {
      return { label: text.askReserve as string, symbol: "?", color: "neutral" };
    }

    const kind = gameKind(state);

    if (isSolo(kind)) {
      const reservation = reservations.find(
        (entry) => entry.kind === kind && (entry.suitId ?? "diamonds") === soloSuitId(state)
      );

      return { label: reservation ? reservationLabel(reservation, context) : (text.soloPrefix as string) };
    }

    const reSaid = partyAnnounceLevel(state, true);
    const kontraSaid = partyAnnounceLevel(state, false);

    if (reSaid === 0 && kontraSaid === 0 && state.extra[bockActiveKey] === true) {
      return { label: text.bockRound as string, symbol: "×2", color: "red" };
    }

    if (reSaid > 0 || kontraSaid > 0) {
      const parts = [
        reSaid > 0 ? announceLabel(reSaid, true, context) : null,
        kontraSaid > 0 ? announceLabel(kontraSaid, false, context) : null
      ].filter((entry): entry is string => Boolean(entry));

      return { label: parts.join(" / "), symbol: "!", color: "red" };
    }

    return kind === "wedding" ? { label: text.weddingGame as string } : undefined;
  },

  privateNote(state, context, playerId) {
    const text = words(context);

    if (isReservePhase(state)) {
      return declaredReservation(state, playerId) === null
        ? (text.askReserve as string)
        : undefined;
    }

    const party = isRe(state, playerId) ? text.re : text.kontra;
    const tail = countsLive(context)
      ? `${pointsOf(state, playerId)} ${text.eyes}`
      : (text.countedLater as string);

    return `${text.youAre} ${party} · ${tail}`;
  },

  seatStatus(state, context, playerId) {
    const text = words(context);

    if (isReservePhase(state)) {
      const declared = declaredReservation(state, playerId);
      const reservation = declared ? reservationById(declared) : undefined;

      return reservation ? reservationLabel(reservation, context) : undefined;
    }

    const level = announceLevelOf(state, playerId);

    if (level > 0) {
      return announceLabel(level, isRe(state, playerId), context);
    }

    // Die Parteien bleiben verdeckt, bis abgerechnet wird - und wer erst am
    // Ende auszählen lässt, sieht bis dahin auch keine Augen.
    if (!state.gameOver) {
      if (!countsLive(context)) {
        return undefined;
      }

      const points = pointsOf(state, playerId);
      return points > 0 ? `${points}` : undefined;
    }

    return `${isRe(state, playerId) ? text.re : text.kontra} · ${pointsOf(state, playerId)}`;
  },

  tick(state, context) {
    const swept = sweepTrick(state, context, { trickZoneId, lastTrickZoneId, wonZoneId });

    if (!swept) {
      return state;
    }

    return handsEmpty(swept) ? finishDeal(swept, context) : swept;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    const result = settleDeal(state);
    const kind = gameKind(state);
    const soloist = readText(state, soloistKey);

    if (isSolo(kind) && soloist) {
      // Der Alleinspieler spielt gegen drei - entsprechend zählt sein Ergebnis.
      return state.table.turnOrder.map((playerId) => {
        const own = playerId === soloist;
        const won = own === result.reWon;
        const amount = own ? result.value * 3 : result.value;

        return { playerId, delta: won ? amount : -amount, reason: "Doppelkopf" };
      });
    }

    return state.table.turnOrder.map((playerId) => {
      const won = isRe(state, playerId) === result.reWon;

      return { playerId, delta: won ? result.value : -result.value, reason: "Doppelkopf" };
    });
  },

  /**
   * KI-Zug.
   *
   * Drei Entscheidungen. Beim Vorbehalt bleibt der Bot fast immer gesund - ein
   * Solo lohnt nur mit erdrückendem Trumpf, und ein schlecht gespieltes Solo
   * verschenkt dreifach. Bei der Ansage sagt er Re oder Kontra, wenn die Hand
   * sie trägt, Absagen nie: Sie gewinnen wenig und verlieren viel. Beim Spielen
   * sticht er nur fette Stiche, und dann so billig wie möglich.
   */
  botMove(state, context, playerId) {
    if (isTrickPending(state)) {
      return { kind: "wait" };
    }

    const kind = gameKind(state);
    const trumpSuit = soloSuitId(state);
    const hand = handOf(state.table, playerId);

    if (isReservePhase(state)) {
      if (!isActive(state, playerId)) {
        return { kind: "wait" };
      }

      if (hasWedding(state, playerId)) {
        return { kind: "action", actionId: "reserve:wedding" };
      }

      const trumps = hand.filter((cardId) => {
        const card = state.table.cards[cardId];
        return card ? isTrump(card, "normal", "diamonds") : false;
      }).length;

      // Erdrückend lang in Trumpf? Dann lohnt ein Farbsolo.
      if (trumps >= hand.length - 2) {
        return { kind: "action", actionId: "reserve:solo-diamonds" };
      }

      return { kind: "action", actionId: "reserve:healthy" };
    }

    const re = isRe(state, playerId);

    // Ansage nur auf Stufe eins, und nur mit Substanz in der Hand.
    if (partyAnnounceLevel(state, re) === 0 && remainingCards(state, playerId) >= announceDeadline(state, 1)) {
      const strong = hand.filter((cardId) => {
        const card = state.table.cards[cardId];
        return card ? isTrump(card, kind, trumpSuit) && trumpRank(card, kind) >= 90 : false;
      }).length;

      if (strong >= 2) {
        return { kind: "action", actionId: "say:1" };
      }
    }

    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const playable = hand.filter(
      (cardId) => doppelkopfRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    if (playable.length === 0) {
      return { kind: "wait" };
    }

    const cardOf = (cardId: string): CardInstance | null => state.table.cards[cardId] ?? null;
    const rank = (cardId: string): number => {
      const card = cardOf(cardId);

      if (!card) {
        return 0;
      }

      return isTrump(card, kind, trumpSuit)
        ? 1_000 + trumpRank(card, kind)
        : fehlOrder[card.rankId] ?? 0;
    };
    const augen = (cardId: string): number => {
      const card = cardOf(cardId);
      return card ? cardValue(card) : 0;
    };

    const trick = trickCardIds(state);

    if (trick.length === 0) {
      const trumpCards = playable.filter((cardId) => {
        const card = cardOf(cardId);
        return card ? isTrump(card, kind, trumpSuit) : false;
      });

      // Lange Trumpfhand: ziehen, solange die Gegner noch bedienen müssen.
      if (trumpCards.length >= 5) {
        return { kind: "play", cardId: bestOf(trumpCards, rank) as string };
      }

      const fehl = playable.filter((cardId) => !trumpCards.includes(cardId));
      const lead = fehl.length > 0 ? fehl : playable;

      return {
        kind: "play",
        cardId: bestOf(lead, (cardId) => -augen(cardId) - rank(cardId) / 1_000) as string
      };
    }

    const pot = trick.reduce((sum, cardId) => sum + augen(cardId), 0);
    const winners = playable.filter((cardId) => wouldTakeTrick(state, playerId, cardId));

    // Ein fetter Stich ist einen Trumpf wert - ein leerer nicht.
    if (pot >= 10 && winners.length > 0) {
      return { kind: "play", cardId: bestOf(winners, (cardId) => -rank(cardId)) as string };
    }

    const losers = playable.filter((cardId) => !winners.includes(cardId));
    const dump = losers.length > 0 ? losers : playable;

    return {
      kind: "play",
      cardId: bestOf(dump, (cardId) => -augen(cardId) - rank(cardId) / 1_000) as string
    };
  },

  // Auch wer nicht am Zug ist, darf ansagen - Kontra kommt selten im eigenen Zug.
  botActsOutOfTurn: true,

  /**
   * Sortiert die Hand fürs Handy: erst der Trumpf von oben nach unten, dann die
   * Fehlfarben gruppiert. Genau so legt man das Blatt auch am Tisch hin.
   */
  sortHand(state, _context, _playerId, cardIds) {
    const kind = gameKind(state);
    const trumpSuit = soloSuitId(state);

    return [...cardIds].sort((left, right) => {
      const a = state.table.cards[left];
      const b = state.table.cards[right];

      if (!a || !b) {
        return 0;
      }

      const trumpA = isTrump(a, kind, trumpSuit);
      const trumpB = isTrump(b, kind, trumpSuit);

      if (trumpA !== trumpB) {
        return trumpA ? -1 : 1;
      }

      if (trumpA && trumpB) {
        return trumpRank(b, kind) - trumpRank(a, kind);
      }

      if (a.suitId !== b.suitId) {
        return (suitOrder[a.suitId ?? ""] ?? 50) - (suitOrder[b.suitId ?? ""] ?? 50);
      }

      return (fehlOrder[b.rankId] ?? 0) - (fehlOrder[a.rankId] ?? 0);
    });
  }
};

/**
 * Augen laufend zeigen oder erst am Ende auszählen.
 *
 * Am echten Tisch rechnet niemand laut mit; die Option "end" bildet das ab.
 * Gezählt wird intern natürlich trotzdem.
 */
const scoringSettingKey = "cardTableDoppelkopfScoring";

function countsLive(context: CardRulesetContext): boolean {
  return readSetting(context, scoringSettingKey, "live") !== "end";
}
