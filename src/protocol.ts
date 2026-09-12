import type { PlayerInput } from "@open-party-lab/game-core";
import type { CardBackStyle, CardColor } from "./cards/cardTypes.js";

/**
 * Kartentisch-Protokoll.
 *
 * Host-Szene und Controller-Layout arbeiten ausschließlich mit diesen DTOs.
 * Ein weiteres Kartenspiel liefert eine andere Füllung - Oberfläche,
 * Kartenoptik und Bedienung bleiben identisch. Dieselben Typen liegen als
 * Layout-Vertrag in `packages/protocol/src/games/cardTable.ts` der Plattform.
 */

export interface CardTableCardState {
  cardId: string;
  suitId: string | null;
  suitSymbol: string;
  suitLabel: string;
  rankLabel: string;
  color: CardColor;
  centerLabel?: string;
  points?: number;
}

export interface CardTableHandCardState extends CardTableCardState {
  playable: boolean;
  /** Kurzer Hinweis, warum die Karte gerade nicht gelegt werden darf. */
  hint?: string;
}

export type CardTableStackKind = "draw" | "discard" | "zone";

/**
 * Wie ein Stapel gezeichnet wird.
 *
 * `pile` ist ein Haufen: `cards[0]` ist die oberste Karte, gezeigt werden
 * höchstens drei, stark überlappend. `spread` ist eine Auslage: alle Karten
 * werden gezeigt, in genau der Reihenfolge des Modells und nur leicht
 * überlappend - so, wie ein Stich auf dem Tisch liegt.
 */
export type CardTableStackLayout = "pile" | "spread";

export interface CardTableStackState {
  id: string;
  label: string;
  kind: CardTableStackKind;
  count: number;
  /**
   * Offen liegende Karten. Bei `pile` oberste zuerst, bei `spread` in
   * Spielreihenfolge. Bei verdeckten Stapeln leer.
   */
  cards: CardTableCardState[];
  faceDown: boolean;
  /** Zeichenweise; ohne Angabe `pile`. */
  layout?: CardTableStackLayout;
  /**
   * Nur auf Anforderung sichtbar.
   *
   * Der Host blendet solche Stapel erst ein, wenn jemand danach fragt, und
   * versteckt sie wieder, sobald weitergespielt wird. Gedacht für Dinge, die
   * man nachschlagen können will, ohne dass sie dauerhaft den Tisch belegen -
   * den letzten Stich zum Beispiel.
   */
  onDemand?: boolean;
}

export interface CardTableSeatState {
  playerId: string;
  name: string;
  color: string;
  connected: boolean;
  handCount: number;
  score: number;
  isActive: boolean;
  /** Virtueller Mitspieler statt eines Handys. */
  isBot?: boolean;
  /** Kurzer Zustand am Sitzplatz, z. B. "Mau!". */
  statusLabel?: string;
}

export type CardTableActionKind = "primary" | "secondary" | "danger";

export interface CardTableActionState {
  id: string;
  label: string;
  kind: CardTableActionKind;
  enabled: boolean;
  hint?: string;
}

export interface CardTableChoiceOptionState {
  id: string;
  label: string;
  symbol?: string;
  color?: CardColor;
}

export interface CardTableChoiceState {
  id: string;
  label: string;
  options: CardTableChoiceOptionState[];
}

/** Ein Abschnitt der Spielregeln, wie ihn der Host einblendet. */
export interface CardTableRuleSectionState {
  title: string;
  lines: string[];
}

export interface CardTableLogEntryState {
  id: string;
  playerName: string | null;
  text: string;
}

export type CardTableCardStyle = "classic" | "modern" | "clear";

export interface CardTablePublicState {
  /** Aktives Regelwerk, z. B. "free-play" oder "mau-mau". */
  rulesetId: string;
  title: string;
  deckLabel: string;
  backStyle: CardBackStyle;
  /** Kartenbild, das Host und Handy gemeinsam verwenden. */
  cardStyle: CardTableCardStyle;
  /** Ausführliche Spielregeln, die der Host auf Knopfdruck zeigt. */
  rules: CardTableRuleSectionState[];
  seats: CardTableSeatState[];
  stacks: CardTableStackState[];
  activePlayerId: string | null;
  activePlayerName: string | null;
  direction: 1 | -1;
  turnNumber: number;
  /** Buttons, die der Host anzeigt und per game:host-action auslöst. */
  hostActions: CardTableActionState[];
  /** Zusatzbedingung, z. B. Wunschfarbe nach einem Buben. */
  conditionLabel?: string;
  conditionSymbol?: string;
  conditionColor?: CardColor;
  statusMessage?: string;
  log: CardTableLogEntryState[];
  gameOver: boolean;
  winnerPlayerId?: string;
  winnerName?: string;
  lastError?: string;
  /**
   * Wer den zuletzt abgeräumten Stich bekommen hat, und der wievielte es war.
   *
   * Der Host erkennt daran, dass gerade ein Stich gewonnen wurde, und lässt die
   * Karten zum Sitzplatz fliegen. Bewusst ein eigenes Feld statt eines Blicks
   * in die Beschriftung des Stapels - Text ist keine Schnittstelle.
   */
  lastTrickWinnerId?: string;
  lastTrickSerial?: number;
  /** Stapel mit `onDemand` gerade einblenden - angefordert von einem Handy. */
  revealOnDemand?: boolean;
}

export interface CardTableControllerState extends CardTablePublicState {
  hand: CardTableHandCardState[];
  canAct: boolean;
  actions: CardTableActionState[];
  /** Auswahl, die vor dem Legen einer Karte beantwortet werden muss. */
  pendingChoice?: CardTableChoiceState;
  /** Karten, für die diese Auswahl gilt. */
  pendingChoiceCardIds: string[];
  /** Hinweis, den nur dieser Spieler sieht, z. B. der eigene Handwert. */
  privateNote?: string;
}

export interface CardTablePlayInput extends PlayerInput {
  type: "card-table:play";
  cardId: string;
  /** Antwort auf `pendingChoice`, z. B. die Wunschfarbe. */
  choiceId?: string;
}

export interface CardTableDrawInput extends PlayerInput {
  type: "card-table:draw";
}

export interface CardTableActionInput extends PlayerInput {
  type: "card-table:action";
  actionId: string;
}

export type CardTableInput = CardTablePlayInput | CardTableDrawInput | CardTableActionInput;

export interface CardTableHostActionMessage {
  type: "card-table:host-action";
  actionId: string;
}

export interface CardTableConfigureLobbyAction {
  type: "configure-lobby";
  ruleset?: string;
  deck?: string;
  handSize?: number;
  cardStyle?: string;
  botCount?: number;
  doppelkopfScoring?: string;
  handSort?: string;
  dokoNines?: string;
  dokoSecondDulle?: string;
  dokoDoppelkopf?: string;
  dokoFox?: string;
  dokoCharlie?: string;
  dokoFoxEnd?: string;
  dokoPigs?: string;
  dokoAgainstOld?: string;
  dokoBock?: string;
  dokoForced?: string;
}

export type CardTableHostAction = CardTableHostActionMessage | CardTableConfigureLobbyAction;
