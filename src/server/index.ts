import {
  createBaseRoundState,
  roundPhaseDurations,
  transitionRoundState,
  type ScoreEntry,
  type ServerGame,
  type ServerGameContext
} from "@open-party-lab/game-core";
import { createCardTable, handOf, toCardFace, toCardFaces } from "../cards/cardTable.js";
import { createBotSeats, isBotId, maxBotSeats, type CardBotSeat } from "../bots/botSeats.js";
import { driveBots } from "../bots/driver.js";
import { countDeckCards, resolveCardDeck } from "../cards/deckPresets.js";
import type { DeckDefinition } from "../cards/cardTypes.js";
import { cardTableManifest, cardTableRoomSettingKeys } from "../manifest.js";
import type {
  CardTableCardStyle,
  CardTableCardState,
  CardTableConfigureLobbyAction,
  CardTableControllerState,
  CardTableHandCardState,
  CardTableHostAction,
  CardTableInput,
  CardTablePublicState,
  CardTableSeatState,
  CardTableStackState
} from "../protocol.js";
import {
  defaultCardRulesetId,
  resolveCardRuleset,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "../rules/index.js";

/**
 * Autoritative Kartentisch-Runtime.
 *
 * Diese Datei kennt keine einzige Spielregel. Sie baut den Tisch auf, leitet
 * Eingaben an das gewählte Regelwerk weiter und übersetzt den Rundenzustand in
 * die DTOs für Host und Controller.
 */

const visibleDiscardCards = 3;
const minHandSize = 3;
const maxHandSize = 12;

function readSetting(context: ServerGameContext, key: string): unknown {
  return context.roomSettings[key];
}

function resolveRuleset(context: ServerGameContext): CardRuleset {
  const configured = readSetting(context, cardTableRoomSettingKeys.ruleset);
  return resolveCardRuleset(typeof configured === "string" ? configured : defaultCardRulesetId);
}

function resolveDeck(context: ServerGameContext, ruleset: CardRuleset): DeckDefinition {
  if (ruleset.fixedDeckId) {
    return resolveCardDeck(ruleset.fixedDeckId);
  }

  const configured = readSetting(context, cardTableRoomSettingKeys.deck);
  const requested = typeof configured === "string" ? configured : ruleset.defaultDeckId;
  const allowed = !ruleset.allowedDeckIds || ruleset.allowedDeckIds.includes(requested);

  return resolveCardDeck(allowed ? requested : ruleset.defaultDeckId);
}

const cardStyles: CardTableCardStyle[] = ["classic", "modern", "clear"];

function resolveCardStyle(context: ServerGameContext): CardTableCardStyle {
  const configured = readSetting(context, cardTableRoomSettingKeys.cardStyle);

  return cardStyles.find((style) => style === configured) ?? "classic";
}

function resolveHandSize(context: ServerGameContext, ruleset: CardRuleset, seatCount: number): number {
  const setting = readSetting(context, cardTableRoomSettingKeys.handSize);
  const configured = Math.max(
    minHandSize,
    Math.min(maxHandSize, Math.round(typeof setting === "number" ? setting : ruleset.defaultHandSize))
  );

  if (!ruleset.handSizeFor) {
    return configured;
  }

  return Math.max(
    1,
    ruleset.handSizeFor({
      roundNumber: context.roundNumber,
      playerCount: Math.max(1, seatCount),
      configured
    })
  );
}

/**
 * KI-Sitze dieser Runde. Die Zahl kommt aus dem Host-Setup und wird so
 * gedeckelt, dass Menschen und Bots zusammen an den Tisch passen.
 */
function resolveBotSeats(context: ServerGameContext): CardBotSeat[] {
  const setting = readSetting(context, cardTableRoomSettingKeys.botCount);
  const requested = typeof setting === "number" && Number.isFinite(setting) ? Math.round(setting) : 0;
  const free = Math.max(0, cardTableManifest.maxPlayers - context.players.length);

  return createBotSeats(Math.max(0, Math.min(maxBotSeats, requested, free)));
}

const scoredPhases = new Set(["locked", "result", "scoreboard", "finished"]);

/**
 * Punktestand der Bots inklusive der Wertung dieser Runde, sobald sie steht.
 *
 * Die Plattform bucht nur echte Spieler; für die KI-Sitze macht der Kartentisch
 * dieselbe Rechnung selbst, mit denselben `buildScore`-Einträgen.
 */
function botTotals(state: Partial<CardGameState> | undefined): Record<string, number> {
  if (!state?.table || typeof state.rulesetId !== "string") {
    return {};
  }

  const totals: Record<string, number> = { ...(state.botScores ?? {}) };

  if (!scoredPhases.has(String(state.phase))) {
    return totals;
  }

  for (const entry of resolveCardRuleset(state.rulesetId).buildScore(state as CardGameState)) {
    if (isBotId(entry.playerId)) {
      totals[entry.playerId] = (totals[entry.playerId] ?? 0) + entry.delta;
    }
  }

  return totals;
}

/** Punktestand der Bots aus der Vorrunde, damit Wertungen über Runden tragen. */
function carryBotScores(context: ServerGameContext, bots: CardBotSeat[]): Record<string, number> {
  const carried = botTotals(context.previousRound?.state as Partial<CardGameState> | undefined);
  const scores: Record<string, number> = {};

  for (const bot of bots) {
    const value = carried[bot.id];
    scores[bot.id] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  return scores;
}

function buildRulesetContext(state: CardGameState, context: ServerGameContext): CardRulesetContext {
  const playerNames: Record<string, string> = {};
  const scores: Record<string, number> = {};

  for (const player of context.players) {
    playerNames[player.id] = player.name;
    scores[player.id] = player.score;
  }

  const totals = botTotals(state);

  for (const bot of state.bots) {
    playerNames[bot.id] = bot.name;
    scores[bot.id] = totals[bot.id] ?? 0;
  }

  return {
    deck: resolveCardDeck(state.deckId),
    language: context.language,
    now: context.now,
    playerNames,
    scores,
    settings: context.roomSettings
  };
}

function createRuntimeState(context: ServerGameContext): CardGameState {
  const ruleset = resolveRuleset(context);
  const deck = resolveDeck(context, ruleset);
  const bots = resolveBotSeats(context);
  const botScores = carryBotScores(context, bots);
  const playerIds = [...context.players.map((player) => player.id), ...bots.map((bot) => bot.id)];
  const handSize = resolveHandSize(context, ruleset, playerIds.length);
  const table = createCardTable({
    deck,
    playerIds,
    handSize,
    openStartCard: ruleset.openStartCard
  });
  const rulesetContext: CardRulesetContext = {
    deck,
    language: context.language,
    now: context.now,
    playerNames: {
      ...Object.fromEntries(context.players.map((player) => [player.id, player.name])),
      ...Object.fromEntries(bots.map((bot) => [bot.id, bot.name]))
    },
    scores: {
      ...Object.fromEntries(context.players.map((player) => [player.id, player.score])),
      ...botScores
    },
    settings: context.roomSettings
  };
  const intro = ruleset.introMessage(rulesetContext);
  const initial: CardGameState = {
    ...createBaseRoundState("round_intro", context.now, {
      durationMs: roundPhaseDurations.roundIntroMs,
      message: intro
    }),
    rulesetId: ruleset.id,
    deckId: deck.id,
    handSize,
    table,
    turnNumber: 0,
    pendingDraw: 0,
    drawnThisTurn: 0,
    wishSuitId: null,
    log: [],
    nextLogId: 1,
    gameOver: false,
    extra: {},
    bots,
    botScores,
    botReadyAt: null
  };

  return ruleset.setupRound ? ruleset.setupRound(initial, rulesetContext) : initial;
}

function toCardStates(deck: DeckDefinition, state: CardGameState, cardIds: string[]): CardTableCardState[] {
  return toCardFaces(deck, state.table, cardIds);
}

function buildStacks(
  state: CardGameState,
  ruleset: CardRuleset,
  rulesetContext: CardRulesetContext,
  context: ServerGameContext
): CardTableStackState[] {
  const en = context.language === "en";
  const deck = rulesetContext.deck;
  const stacks: CardTableStackState[] = [];

  // Ein leerer Nachziehstapel ist kein Platzhalter wert - Spiele ohne Ziehen
  // zeigen ihn gar nicht erst.
  if (state.table.drawPile.length > 0) {
    stacks.push({
      id: "draw",
      label: en ? "Draw pile" : "Nachziehstapel",
      kind: "draw",
      count: state.table.drawPile.length,
      cards: [],
      faceDown: true
    });
  }

  if (state.table.discardPile.length > 0) {
    stacks.push({
      id: "discard",
      label: en ? "Table" : "Ablage",
      kind: "discard",
      count: state.table.discardPile.length,
      cards: toCardStates(deck, state, state.table.discardPile.slice(0, visibleDiscardCards)),
      faceDown: false
    });
  }

  const custom = ruleset.tableStacks?.(state, rulesetContext);

  if (custom) {
    stacks.push(...custom);
    return stacks;
  }

  for (const [zoneId, cardIds] of Object.entries(state.table.zones)) {
    stacks.push({
      id: zoneId,
      label: zoneId,
      kind: "zone",
      count: cardIds.length,
      cards: toCardStates(deck, state, cardIds.slice(0, visibleDiscardCards)),
      faceDown: false
    });
  }

  return stacks;
}

function buildSeats(
  state: CardGameState,
  ruleset: CardRuleset,
  rulesetContext: CardRulesetContext,
  context: ServerGameContext
): CardTableSeatState[] {
  const players = new Map(context.players.map((player) => [player.id, player]));
  const bots = new Map(state.bots.map((bot) => [bot.id, bot]));
  const totals = botTotals(state);
  const activeId = state.table.turnOrder[state.table.activeIndex] ?? null;

  return state.table.turnOrder.map((playerId) => {
    const player = players.get(playerId);
    const bot = bots.get(playerId);

    return {
      playerId,
      name: bot?.name ?? player?.name ?? playerId,
      color: bot?.color ?? player?.color ?? "#8d5f4a",
      // Ein Bot ist nie "abwesend" - er sitzt immer am Tisch.
      connected: bot ? true : player?.connected ?? false,
      handCount: handOf(state.table, playerId).length,
      score: bot ? totals[playerId] ?? 0 : player?.score ?? 0,
      isActive: playerId === activeId && !state.gameOver,
      isBot: Boolean(bot),
      statusLabel: ruleset.seatStatus(state, rulesetContext, playerId)
    };
  });
}

function buildPublicState(state: CardGameState, context: ServerGameContext): CardTablePublicState {
  const ruleset = resolveCardRuleset(state.rulesetId);
  const rulesetContext = buildRulesetContext(state, context);
  const deck = rulesetContext.deck;
  const activeId = state.table.turnOrder[state.table.activeIndex] ?? null;
  const condition = ruleset.condition(state, rulesetContext);

  return {
    rulesetId: ruleset.id,
    title: ruleset.label[context.language] ?? ruleset.label.de,
    deckLabel: `${deck.label} · ${countDeckCards(deck)} ${context.language === "en" ? "cards" : "Karten"}`,
    backStyle: deck.backStyle ?? "classic",
    cardStyle: resolveCardStyle(context),
    rules: ruleset.rules(rulesetContext),
    seats: buildSeats(state, ruleset, rulesetContext, context),
    stacks: buildStacks(state, ruleset, rulesetContext, context),
    activePlayerId: state.gameOver ? null : activeId,
    activePlayerName: state.gameOver ? null : rulesetContext.playerNames[activeId ?? ""] ?? null,
    direction: state.table.direction,
    turnNumber: state.turnNumber,
    hostActions: ruleset.hostActions(state, rulesetContext),
    conditionLabel: condition?.label,
    conditionSymbol: condition?.symbol,
    conditionColor: condition?.color,
    statusMessage: state.message,
    log: state.log,
    gameOver: state.gameOver,
    winnerPlayerId: state.winnerPlayerId,
    winnerName: state.winnerName,
    lastError: state.lastError
  };
}

function buildHand(
  state: CardGameState,
  ruleset: CardRuleset,
  rulesetContext: CardRulesetContext,
  playerId: string
): CardTableHandCardState[] {
  return handOf(state.table, playerId).map((cardId) => {
    const card = state.table.cards[cardId];
    const face = card
      ? toCardFace(rulesetContext.deck, card)
      : {
          cardId,
          suitId: null,
          suitSymbol: "?",
          suitLabel: "?",
          rankLabel: "?",
          color: "neutral" as const
        };
    const check = ruleset.canPlayCard(state, rulesetContext, playerId, cardId);

    return {
      ...face,
      playable: check.allowed && state.phase === "playing" && !state.gameOver,
      hint: check.hint
    };
  });
}

export const serverGame: ServerGame<CardGameState, CardTableInput, CardTablePublicState> = {
  manifest: cardTableManifest,

  handleHostAction(state, action, context) {
    const hostAction = action as Partial<CardTableHostAction> | null;

    if (!hostAction?.type) {
      return {};
    }

    if (hostAction.type === "configure-lobby") {
      if (state) {
        return {};
      }

      const configure = hostAction as CardTableConfigureLobbyAction;
      const roomSettings: Record<string, unknown> = {};

      if (typeof configure.ruleset === "string") {
        roomSettings[cardTableRoomSettingKeys.ruleset] = resolveCardRuleset(configure.ruleset).id;
      }

      if (typeof configure.deck === "string") {
        roomSettings[cardTableRoomSettingKeys.deck] = resolveCardDeck(configure.deck).id;
      }

      if (typeof configure.cardStyle === "string") {
        roomSettings[cardTableRoomSettingKeys.cardStyle] =
          cardStyles.find((style) => style === configure.cardStyle) ?? "classic";
      }

      if (typeof configure.doppelkopfScoring === "string") {
        roomSettings[cardTableRoomSettingKeys.doppelkopfScoring] =
          configure.doppelkopfScoring === "end" ? "end" : "live";
      }

      if (typeof configure.botCount === "number" && Number.isFinite(configure.botCount)) {
        roomSettings[cardTableRoomSettingKeys.botCount] = Math.max(
          0,
          Math.min(maxBotSeats, Math.round(configure.botCount))
        );
      }

      if (typeof configure.handSize === "number" && Number.isFinite(configure.handSize)) {
        roomSettings[cardTableRoomSettingKeys.handSize] = Math.max(
          minHandSize,
          Math.min(maxHandSize, Math.round(configure.handSize))
        );
      }

      return { roomSettings };
    }

    if (hostAction.type === "card-table:host-action" && state && state.phase === "playing") {
      const ruleset = resolveCardRuleset(state.rulesetId);
      const next = ruleset.runHostAction(state, buildRulesetContext(state, context), hostAction.actionId ?? "");

      return next === state ? {} : { state: next };
    }

    return {};
  },

  createInitialState(context) {
    return createRuntimeState(context);
  },

  startRound(_state, context) {
    const state = createRuntimeState(context);

    return transitionRoundState(state, "playing", context.now, {
      startedAt: context.now,
      message: state.message
    });
  },

  handleInput(state, input, context) {
    if (state.phase !== "playing" || state.gameOver) {
      return state;
    }

    const ruleset = resolveCardRuleset(state.rulesetId);
    const rulesetContext = buildRulesetContext(state, context);

    // KI-Sitze gehören der Runtime; ein Input mit ihrer Id kommt nicht von
    // einem Handy und wird nie ausgeführt.
    if (isBotId(input.playerId) || !state.table.turnOrder.includes(input.playerId)) {
      return state;
    }

    if (input.type === "card-table:play") {
      return ruleset.playCard(state, rulesetContext, input.playerId, input.cardId, input.choiceId);
    }

    if (input.type === "card-table:draw") {
      return ruleset.drawCard(state, rulesetContext, input.playerId);
    }

    if (input.type === "card-table:action") {
      return ruleset.runAction(state, rulesetContext, input.playerId, input.actionId);
    }

    return state;
  },

  tick(state, _deltaMs, context) {
    const ruleset = resolveCardRuleset(state.rulesetId);

    return driveBots(state, ruleset, buildRulesetContext(state, context));
  },

  isRoundFinished(state) {
    return state.phase === "playing" && resolveCardRuleset(state.rulesetId).isFinished(state);
  },

  buildScore(state): ScoreEntry[] {
    return resolveCardRuleset(state.rulesetId).buildScore(state);
  },

  toPublicState(state, context) {
    return buildPublicState(state, context);
  },

  toControllerStateForPlayer(state, context, playerId): CardTableControllerState {
    const publicState = buildPublicState(state, context);
    const ruleset = resolveCardRuleset(state.rulesetId);
    const rulesetContext = buildRulesetContext(state, context);
    const hand = buildHand(state, ruleset, rulesetContext, playerId);
    const pendingChoiceCardIds = hand
      .filter((card) => Boolean(ruleset.choiceForCard(state, rulesetContext, card.cardId)))
      .map((card) => card.cardId);
    const pendingChoice = pendingChoiceCardIds[0]
      ? ruleset.choiceForCard(state, rulesetContext, pendingChoiceCardIds[0])
      : undefined;
    const isActive = state.table.turnOrder[state.table.activeIndex] === playerId;

    return {
      ...publicState,
      // Die Regeln stehen auf dem Host; das Handy braucht sie nicht mitgeschickt.
      rules: [],
      hand,
      canAct:
        state.phase === "playing" &&
        !state.gameOver &&
        (ruleset.turnBased ? isActive : state.table.turnOrder.includes(playerId)),
      actions: ruleset.controllerActions(state, rulesetContext, playerId),
      pendingChoice,
      pendingChoiceCardIds,
      privateNote: ruleset.privateNote?.(state, rulesetContext, playerId)
    };
  }
};

export default serverGame;
