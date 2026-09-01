import type { BaseRoundState, ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import type {
  CardTableActionState,
  CardTableChoiceState,
  CardTableLogEntryState,
  CardTableRuleSectionState,
  CardTableStackState
} from "../protocol.js";
import type { CardTableState } from "../cards/cardTable.js";
import type { CardColor, DeckDefinition } from "../cards/cardTypes.js";
import type { CardBotSeat } from "../bots/botSeats.js";

/**
 * Der Rundenzustand eines Kartenspiels.
 *
 * Alles Kartenbezogene liegt in `table`; darüber liegen nur noch die Werte, die
 * Regelwerke gemeinsam brauchen (Strafkarten, Wunschfarbe, Log, Sieger).
 * Ein Regelwerk mit eigenen Feldern legt sie in `extra` ab.
 */
export interface CardGameState extends BaseRoundState {
  rulesetId: string;
  deckId: string;
  handSize: number;
  table: CardTableState;
  turnNumber: number;
  /** Aufgelaufene Strafkarten, z. B. gestapelte Siebenen. */
  pendingDraw: number;
  /** Wie oft der aktive Spieler in diesem Zug schon gezogen hat. */
  drawnThisTurn: number;
  /** Erzwungene Farbe, z. B. nach einem Buben. */
  wishSuitId: string | null;
  log: CardTableLogEntryState[];
  nextLogId: number;
  gameOver: boolean;
  winnerPlayerId?: string;
  winnerName?: string;
  lastError?: string;
  /** Freier Ablageplatz für regelwerkseigene Werte. */
  extra: Record<string, number | string | boolean | null>;
  /** Virtuelle KI-Sitze dieser Runde, in Zugreihenfolge. */
  bots: CardBotSeat[];
  /** Punktestand der KI-Sitze - die Plattform zählt nur echte Spieler. */
  botScores: Record<string, number>;
  /** Zeitpunkt, an dem der nächste KI-Zug fällig ist. */
  botReadyAt: number | null;
}

/**
 * Was ein KI-Spieler tun möchte.
 *
 * Absichten, keine Zustandsänderungen: Der Antrieb schickt sie durch dieselben
 * Regelpfade wie den Input eines echten Spielers, damit kein Bot an den Regeln
 * vorbeispielen kann.
 */
export type CardBotIntent =
  | { kind: "play"; cardId: string; choiceId?: string }
  | { kind: "draw" }
  | { kind: "action"; actionId: string }
  | { kind: "wait" };

export interface CardRulesetContext {
  deck: DeckDefinition;
  language: SupportedLanguage;
  now: number;
  playerNames: Record<string, string>;
  scores: Record<string, number>;
}

export interface CardPlayCheck {
  allowed: boolean;
  hint?: string;
}

export interface CardTableCondition {
  label: string;
  symbol?: string;
  color?: CardColor;
}

/**
 * Ein Regelwerk. Das ist die eine Stelle, an der ein neues Kartenspiel
 * entsteht: Server-Runtime, Host-Tisch und Handkarten-Controller bleiben
 * unverändert.
 */
export interface CardRuleset {
  id: string;
  label: Record<SupportedLanguage, string>;
  defaultDeckId: string;
  defaultHandSize: number;
  /** Legt beim Start eine offene Karte auf den Ablagestapel. */
  openStartCard: boolean;
  /** Nur der aktive Spieler darf handeln. */
  turnBased: boolean;
  /** Erzwingt ein Deck und blendet die Deckauswahl des Hosts aus. */
  fixedDeckId?: string;
  /** Schränkt die Deckauswahl ein, wenn mehrere Decks passen. */
  allowedDeckIds?: string[];
  /** Handkarten dieser Runde, z. B. steigend wie bei der Stichwette. */
  handSizeFor?(input: { roundNumber: number; playerCount: number; configured: number }): number;
  /** Zusätzlicher Aufbau nach dem Austeilen, z. B. Trumpf oder offene Tischkarten. */
  setupRound?(state: CardGameState, context: CardRulesetContext): CardGameState;
  /** Eigene Tischstapel statt der generischen Zonen. */
  tableStacks?(state: CardGameState, context: CardRulesetContext): CardTableStackState[];
  /** Hinweis, den nur dieser Spieler sieht, z. B. der eigene Handwert. */
  privateNote?(
    state: CardGameState,
    context: CardRulesetContext,
    playerId: string
  ): string | undefined;
  introMessage(context: CardRulesetContext): string;
  /**
   * Die vollständigen Spielregeln. Der Host blendet sie auf Knopfdruck ein,
   * deshalb gehören hier alle Fragen hinein, die am Tisch aufkommen: Ziel,
   * Zugablauf, was angelegt werden darf, Sonderkarten und Wertung.
   */
  rules(context: CardRulesetContext): CardTableRuleSectionState[];
  canPlayCard(
    state: CardGameState,
    context: CardRulesetContext,
    playerId: string,
    cardId: string
  ): CardPlayCheck;
  playCard(
    state: CardGameState,
    context: CardRulesetContext,
    playerId: string,
    cardId: string,
    choiceId?: string
  ): CardGameState;
  drawCard(state: CardGameState, context: CardRulesetContext, playerId: string): CardGameState;
  runAction(
    state: CardGameState,
    context: CardRulesetContext,
    playerId: string,
    actionId: string
  ): CardGameState;
  controllerActions(
    state: CardGameState,
    context: CardRulesetContext,
    playerId: string
  ): CardTableActionState[];
  hostActions(state: CardGameState, context: CardRulesetContext): CardTableActionState[];
  runHostAction(
    state: CardGameState,
    context: CardRulesetContext,
    actionId: string
  ): CardGameState;
  /** Auswahl, die vor dem Legen dieser Karte beantwortet werden muss. */
  choiceForCard(
    state: CardGameState,
    context: CardRulesetContext,
    cardId: string
  ): CardTableChoiceState | undefined;
  condition(state: CardGameState, context: CardRulesetContext): CardTableCondition | undefined;
  seatStatus(
    state: CardGameState,
    context: CardRulesetContext,
    playerId: string
  ): string | undefined;
  isFinished(state: CardGameState): boolean;
  buildScore(state: CardGameState): ScoreEntry[];
  /**
   * Zug eines KI-Spielers. Ohne diesen Haken übernimmt der generische Bot aus
   * `bots/fallback.ts` - der spielt regelkonform, aber ohne Taktik.
   */
  botMove?(
    state: CardGameState,
    context: CardRulesetContext,
    playerId: string
  ): CardBotIntent | null;
  /**
   * Setzt das Regelwerk auf true, werden auch KI-Spieler gefragt, die nicht am
   * Zug sind - etwa zum Zweifeln bei Lügen.
   */
  botActsOutOfTurn?: boolean;
}

export function appendLog(
  state: CardGameState,
  playerName: string | null,
  text: string
): CardGameState {
  const entry: CardTableLogEntryState = {
    id: `log-${state.nextLogId}`,
    playerName,
    text
  };

  return {
    ...state,
    log: [entry, ...state.log].slice(0, 12),
    nextLogId: state.nextLogId + 1
  };
}

export function withError(state: CardGameState, message: string): CardGameState {
  return { ...state, lastError: message };
}

export function clearError(state: CardGameState): CardGameState {
  return state.lastError ? { ...state, lastError: undefined } : state;
}

export function finishGame(
  state: CardGameState,
  winnerPlayerId: string | null,
  winnerName: string | null,
  message: string
): CardGameState {
  return {
    ...state,
    gameOver: true,
    winnerPlayerId: winnerPlayerId ?? undefined,
    winnerName: winnerName ?? undefined,
    message,
    lastError: undefined
  };
}

export function playerName(context: CardRulesetContext, playerId: string): string {
  return context.playerNames[playerId] ?? playerId;
}

/** Ist dieser Sitz ein KI-Spieler? */
export function isBotSeat(state: CardGameState, playerId: string): boolean {
  return state.bots.some((bot) => bot.id === playerId);
}

/** Liest einen Zahlenwert aus dem regelwerkseigenen Ablageplatz. */
export function readNumber(state: CardGameState, key: string, fallback = 0): number {
  const value = state.extra[key];
  return typeof value === "number" ? value : fallback;
}

/** Liest einen Textwert aus dem regelwerkseigenen Ablageplatz. */
export function readText(state: CardGameState, key: string): string | null {
  const value = state.extra[key];
  return typeof value === "string" ? value : null;
}

export function writeExtra(
  state: CardGameState,
  values: Record<string, number | string | boolean | null>
): CardGameState {
  return { ...state, extra: { ...state.extra, ...values } };
}
