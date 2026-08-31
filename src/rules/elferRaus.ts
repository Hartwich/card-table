import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { advanceTurn, drawCards, handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableStackState } from "../protocol.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  withError,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Elfer raus.
 *
 * Vier Farbreihen von 1 bis 20. Eröffnet wird jede Reihe mit der Elf, danach
 * wird an beiden Enden um genau eins verlängert. Wer nicht anlegen kann, zieht
 * eine Karte. Wer zuerst keine Karten mehr hat, gewinnt.
 *
 * Zeigt auf dem Fundament, wie ein Regelwerk mehrere offene Ablagereihen statt
 * eines einzelnen Ablagestapels benutzt.
 */

const startRank = 11;

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Elfer raus: Beginne jede Farbreihe mit der 11 und lege dann nach oben oder unten an.",
    draw: "Ziehen",
    pass: "Weiter",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    needEleven: "Diese Reihe beginnt mit der 11.",
    noFit: "Passt an keinem Ende der Reihe.",
    mustDraw: "Zieh erst eine Karte.",
    plays: "legt",
    opens: "eröffnet",
    drew: "zieht eine Karte",
    passed: "setzt aus",
    empty: "Der Stapel ist leer.",
    noDraw: "kann nicht ziehen und setzt aus",
    wins: "hat alle Karten abgelegt.",
    startHint: "Nur Elfen dürfen eröffnen.",
    playable: "Spielbar",
    lastCard: "letzte Karte",
    reshuffle: "Ablage mischen",
    end: "Runde beenden",
    ended: "Der Host hat die Runde beendet."
  },
  en: {
    intro: "Elevens: open every colour row with the 11, then extend it up or down.",
    draw: "Draw",
    pass: "Pass",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    needEleven: "This row starts with the 11.",
    noFit: "Does not fit either end of the row.",
    mustDraw: "Draw a card first.",
    plays: "plays",
    opens: "opens",
    drew: "draws a card",
    passed: "passes",
    empty: "The pile is empty.",
    noDraw: "cannot draw and passes",
    wins: "played their last card.",
    startHint: "Only elevens may open a row.",
    playable: "Playable",
    lastCard: "last card",
    reshuffle: "Reshuffle pile",
    end: "End round",
    ended: "The host ended the round."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function rankValue(card: CardInstance): number {
  const value = Number.parseInt(card.rankId, 10);
  return Number.isFinite(value) ? value : 0;
}

function rowCards(state: CardGameState, suitId: string): CardInstance[] {
  return (state.table.zones[suitId] ?? [])
    .map((cardId) => state.table.cards[cardId])
    .filter((card): card is CardInstance => Boolean(card));
}

/** Tiefstes und höchstes Ende einer Farbreihe. */
function rowEnds(state: CardGameState, suitId: string): { low: number; high: number } | null {
  const cards = rowCards(state, suitId);

  if (cards.length === 0) {
    return null;
  }

  const values = cards.map(rankValue);

  return { low: Math.min(...values), high: Math.max(...values) };
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function hasPlayableCard(state: CardGameState, context: CardRulesetContext, playerId: string): boolean {
  return handOf(state.table, playerId).some(
    (cardId) => elferRausRuleset.canPlayCard(state, context, playerId, cardId).allowed
  );
}

export const elferRausRuleset: CardRuleset = {
  id: "elfer-raus",
  label: { de: "Elfer raus", en: "Elevens" },
  defaultDeckId: "elfer-80",
  fixedDeckId: "elfer-80",
  defaultHandSize: 10,
  openStartCard: false,
  turnBased: true,

  setupRound(state, context) {
    const zones: Record<string, string[]> = { ...state.table.zones };

    for (const suit of context.deck.suits) {
      zones[suit.id] = [];
    }

    return { ...state, table: { ...state.table, zones } };
  },

  introMessage(context) {
    return words(context).intro as string;
  },

  canPlayCard(state, context, playerId, cardId) {
    const text = words(context);

    if (!handOf(state.table, playerId).includes(cardId)) {
      return { allowed: false, hint: text.notInHand as string };
    }

    if (!isActive(state, playerId)) {
      return { allowed: false, hint: text.notYourTurn as string };
    }

    const card = state.table.cards[cardId];

    if (!card || !card.suitId) {
      return { allowed: false };
    }

    const ends = rowEnds(state, card.suitId);
    const value = rankValue(card);

    if (!ends) {
      return value === startRank
        ? { allowed: true }
        : { allowed: false, hint: text.needEleven as string };
    }

    return value === ends.low - 1 || value === ends.high + 1
      ? { allowed: true }
      : { allowed: false, hint: text.noFit as string };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = elferRausRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.noFit as string));
    }

    const card = state.table.cards[cardId] as CardInstance;
    const suitId = card.suitId as string;
    const ends = rowEnds(state, suitId);
    const value = rankValue(card);
    const face = toCardFace(context.deck, card);
    const table = moveCard(
      state.table,
      cardId,
      { kind: "zone", zoneId: suitId },
      !ends || value < ends.low ? "top" : "bottom"
    );

    const next = appendLog(
      clearError({
        ...state,
        table: advanceTurn({ ...table }),
        turnNumber: state.turnNumber + 1,
        drawnThisTurn: 0,
        updatedAt: context.now
      }),
      playerName(context, playerId),
      `${ends ? text.plays : text.opens} ${face.rankLabel} ${face.suitSymbol}`
    );

    if (handOf(table, playerId).length === 0) {
      return finishGame(
        next,
        playerId,
        playerName(context, playerId),
        `${playerName(context, playerId)} ${text.wins}`
      );
    }

    return next;
  },

  drawCard(state, context, playerId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    if (state.drawnThisTurn > 0) {
      return elferRausRuleset.runAction(state, context, playerId, "pass");
    }

    const result = drawCards(state.table, playerId, 1);

    if (result.exhausted) {
      return appendLog(
        clearError({
          ...state,
          table: advanceTurn(state.table),
          drawnThisTurn: 0,
          turnNumber: state.turnNumber + 1,
          updatedAt: context.now
        }),
        playerName(context, playerId),
        text.noDraw as string
      );
    }

    const drawn = clearError({
      ...state,
      table: result.state,
      drawnThisTurn: 1,
      updatedAt: context.now
    });

    if (hasPlayableCard(drawn, context, playerId)) {
      return appendLog(drawn, playerName(context, playerId), text.drew as string);
    }

    return appendLog(
      {
        ...drawn,
        table: advanceTurn(drawn.table),
        drawnThisTurn: 0,
        turnNumber: drawn.turnNumber + 1
      },
      playerName(context, playerId),
      `${text.drew} - ${text.passed}`
    );
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (actionId !== "pass" || !isActive(state, playerId)) {
      return state;
    }

    if (state.drawnThisTurn === 0) {
      return withError(state, text.mustDraw as string);
    }

    return appendLog(
      clearError({
        ...state,
        table: advanceTurn(state.table),
        drawnThisTurn: 0,
        turnNumber: state.turnNumber + 1,
        updatedAt: context.now
      }),
      playerName(context, playerId),
      text.passed as string
    );
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const text = words(context);
    const active = isActive(state, playerId) && state.phase === "playing" && !state.gameOver;

    return [
      { id: "draw", label: text.draw as string, kind: "primary", enabled: active },
      {
        id: "pass",
        label: text.pass as string,
        kind: "secondary",
        enabled: active && state.drawnThisTurn > 0
      }
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    const text = words(context);
    const enabled = state.phase === "playing" && !state.gameOver;

    return [
      { id: "draw", label: text.draw as string, kind: "primary", enabled },
      { id: "end", label: text.end as string, kind: "danger", enabled }
    ];
  },

  runHostAction(state, context, actionId) {
    const active = state.table.turnOrder[state.table.activeIndex];

    if (actionId === "draw" && active) {
      return elferRausRuleset.drawCard(state, context, active);
    }

    if (actionId === "end") {
      return finishGame(state, null, null, words(context).ended as string);
    }

    return state;
  },

  choiceForCard() {
    return undefined;
  },

  tableStacks(state, context): CardTableStackState[] {
    return context.deck.suits.map((suit) => {
      const cards = rowCards(state, suit.id).sort((left, right) => rankValue(left) - rankValue(right));
      const shown = cards.length > 1 ? [cards[0] as CardInstance, cards[cards.length - 1] as CardInstance] : cards;

      return {
        id: suit.id,
        label: suit.label,
        kind: "zone" as const,
        count: cards.length,
        cards: shown.map((card) => toCardFace(context.deck, card)),
        faceDown: false
      };
    });
  },

  condition(state, context) {
    const opened = context.deck.suits.some((suit) => rowCards(state, suit.id).length > 0);

    return opened ? undefined : { label: words(context).startHint as string, symbol: "11", color: "neutral" };
  },

  privateNote(state, context, playerId) {
    const playable = handOf(state.table, playerId).filter(
      (cardId) => elferRausRuleset.canPlayCard(state, context, playerId, cardId).allowed
    ).length;

    return `${words(context).playable}: ${playable}`;
  },

  seatStatus(state, context, playerId) {
    return handOf(state.table, playerId).length === 1 ? (words(context).lastCard as string) : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Elfer raus" }]
      : [];
  }
};
