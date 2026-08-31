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

export interface CardTableStackState {
  id: string;
  label: string;
  kind: CardTableStackKind;
  count: number;
  /** Offen liegende Karten, oberste zuerst. Bei verdeckten Stapeln leer. */
  cards: CardTableCardState[];
  faceDown: boolean;
}

export interface CardTableSeatState {
  playerId: string;
  name: string;
  color: string;
  connected: boolean;
  handCount: number;
  score: number;
  isActive: boolean;
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

export interface CardTableLogEntryState {
  id: string;
  playerName: string | null;
  text: string;
}

export interface CardTablePublicState {
  /** Aktives Regelwerk, z. B. "free-play" oder "mau-mau". */
  rulesetId: string;
  title: string;
  deckLabel: string;
  backStyle: CardBackStyle;
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
}

export type CardTableHostAction = CardTableHostActionMessage | CardTableConfigureLobbyAction;
