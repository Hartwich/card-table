import type { CardBackStyle, CardColor } from "../cards/cardTypes.js";
import type { CardTableCardStyle } from "../protocol.js";
import type {
  CardTableActionState,
  CardTableChoiceState,
  CardTableControllerState,
  CardTableHandCardState,
  CardTableLogEntryState,
  CardTableSeatState,
  CardTableStackState
} from "../protocol.js";
import {
  createCardTableActionInput,
  createCardTableDrawInput,
  createCardTablePlayInput
} from "./cardTableBindings.js";

type SupportedLanguage = "de" | "en";

/**
 * Modell des generischen Handkarten-Layouts.
 *
 * Die Plattform rendert daraus die Querformat-Kartenhand. Jedes weitere
 * Kartenspiel auf diesem Protokoll füllt dasselbe Modell.
 */
interface CardHandLayoutModel {
  kind: "card_hand";
  title: string;
  subtitle: string;
  helperText: string;
  language?: SupportedLanguage;
  disabled: boolean;
  canAct: boolean;
  resetKey: string;
  deckLabel: string;
  backStyle: CardBackStyle;
  cardStyle: CardTableCardStyle;
  hand: CardTableHandCardState[];
  stacks: CardTableStackState[];
  seats: CardTableSeatState[];
  actions: CardTableActionState[];
  currentPlayerId: string;
  activePlayerId: string | null;
  activePlayerName: string | null;
  direction: 1 | -1;
  turnNumber: number;
  conditionLabel?: string;
  conditionSymbol?: string;
  conditionColor?: CardColor;
  pendingChoice?: CardTableChoiceState;
  pendingChoiceCardIds: string[];
  privateNote?: string;
  log: CardTableLogEntryState[];
  lastError?: string;
  gameOver: boolean;
  winnerName?: string;
  onPlayCard: (cardId: string, choiceId?: string) => void;
  onDraw: () => void;
  onAction: (actionId: string) => void;
}

interface ControllerGameRenderContext {
  state: {
    room?: {
      language?: SupportedLanguage;
    } | null;
    player?: {
      id: string;
    } | null;
    game?: {
      phase?: string;
      roundNumber?: number;
      message?: string;
      state?: unknown;
    } | null;
  };
  onInput(input: unknown): void;
}

export function buildCardTableControllerModel(
  context: ControllerGameRenderContext
): CardHandLayoutModel {
  const { state, onInput } = context;
  const playerId = state.player?.id ?? "";
  const gameState = (state.game?.state ?? {}) as Partial<CardTableControllerState>;
  const en = state.room?.language === "en";
  const playing = state.game?.phase === "playing";
  const canAct = Boolean(gameState.canAct && playing);
  const activeName = gameState.activePlayerName ?? (en ? "waiting" : "warte");

  return {
    kind: "card_hand",
    title: gameState.title ?? (en ? "Card table" : "Kartentisch"),
    subtitle: gameState.gameOver
      ? gameState.winnerName
        ? `${en ? "Winner" : "Gewinner"}: ${gameState.winnerName}`
        : en ? "Round over" : "Runde beendet"
      : `${en ? "Turn" : "Am Zug"}: ${activeName}`,
    helperText:
      gameState.lastError ??
      state.game?.message ??
      (en ? "Tap a card to play it." : "Tippe eine Karte an, um sie zu legen."),
    language: state.room?.language,
    disabled: !canAct,
    canAct,
    resetKey: [
      state.game?.roundNumber ?? 0,
      gameState.turnNumber ?? 0,
      gameState.activePlayerId ?? "none",
      gameState.hand?.length ?? 0
    ].join(":"),
    deckLabel: gameState.deckLabel ?? "",
    backStyle: gameState.backStyle ?? "classic",
    cardStyle: gameState.cardStyle ?? "classic",
    hand: gameState.hand ?? [],
    stacks: gameState.stacks ?? [],
    seats: gameState.seats ?? [],
    actions: gameState.actions ?? [],
    currentPlayerId: playerId,
    activePlayerId: gameState.activePlayerId ?? null,
    activePlayerName: gameState.activePlayerName ?? null,
    direction: gameState.direction ?? 1,
    turnNumber: gameState.turnNumber ?? 0,
    conditionLabel: gameState.conditionLabel,
    conditionSymbol: gameState.conditionSymbol,
    conditionColor: gameState.conditionColor,
    pendingChoice: gameState.pendingChoice,
    pendingChoiceCardIds: gameState.pendingChoiceCardIds ?? [],
    privateNote: gameState.privateNote,
    log: (gameState.log ?? []) as CardTableLogEntryState[],
    lastError: gameState.lastError,
    gameOver: Boolean(gameState.gameOver),
    winnerName: gameState.winnerName,
    onPlayCard: (cardId, choiceId) => onInput(createCardTablePlayInput(playerId, cardId, choiceId)),
    onDraw: () => onInput(createCardTableDrawInput(playerId)),
    onAction: (actionId) => {
      if (actionId === "draw") {
        onInput(createCardTableDrawInput(playerId));
        return;
      }

      onInput(createCardTableActionInput(playerId, actionId));
    }
  };
}

export const controllerGame = {
  id: "card-table",
  layoutKey: "card_hand",
  buildLayout(context: ControllerGameRenderContext) {
    return buildCardTableControllerModel(context);
  }
} as const;

export type { CardHandLayoutModel, CardTableSeatState };
