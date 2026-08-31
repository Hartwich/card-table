import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import {
  advanceTurn,
  drawCards,
  handOf,
  playCardToDiscard,
  recycleDiscardPile,
  reverseDirection,
  toCardFace,
  topDiscardCard
} from "../cards/cardTable.js";
import type { CardInstance, DeckDefinition } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableChoiceState } from "../protocol.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  withError,
  type CardGameState,
  type CardPlayCheck,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Mau-Mau.
 *
 * Referenz-Regelwerk auf dem Kartentisch: Sieben zieht zwei (stapelbar), Acht
 * setzt aus, Neun dreht die Richtung, der Bube (bzw. der Wild-Rang des Decks)
 * wünscht sich eine Farbe. Die Sonderränge stehen bewusst als Konstanten hier,
 * damit Hausregeln ohne Eingriff in die Engine änderbar sind.
 */

export const mauMauRules = {
  drawTwoRankIds: ["7"],
  skipRankIds: ["8"],
  reverseRankIds: ["9"],
  drawTwoAmount: 2
} as const;

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Mau-Mau: Farbe oder Wert bedienen. 7 zieht zwei, 8 setzt aus, 9 dreht um, Bube wünscht.",
    draw: "Ziehen",
    pass: "Weiter",
    recycle: "Ablage mischen",
    end: "Runde beenden",
    notYourTurn: "Du bist nicht am Zug.",
    mustDraw: "Zieh erst eine Karte.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    mustSeven: "Lege eine Sieben oder ziehe die Strafkarten.",
    noMatch: "Farbe oder Wert passen nicht.",
    needWish: "Wähle eine Wunschfarbe.",
    played: "legt",
    wished: "wünscht sich",
    drew: "zieht eine Karte",
    drewMany: "zieht",
    cards: "Karten",
    skipped: "muss aussetzen",
    reversed: "dreht die Richtung",
    passed: "setzt aus",
    recycled: "Der Ablagestapel wurde neu gemischt.",
    ended: "Der Host hat die Runde beendet.",
    mau: "Mau!",
    wins: "gewinnt die Runde.",
    exhausted: "Es sind keine Karten mehr im Stapel."
  },
  en: {
    intro: "Mau Mau: match suit or rank. 7 draws two, 8 skips, 9 reverses, the jack wishes a suit.",
    draw: "Draw",
    pass: "Pass",
    recycle: "Reshuffle pile",
    end: "End round",
    notYourTurn: "It is not your turn.",
    mustDraw: "Draw a card first.",
    notInHand: "That card is not in your hand.",
    mustSeven: "Play a seven or take the penalty cards.",
    noMatch: "Suit and rank do not match.",
    needWish: "Choose a wish suit.",
    played: "plays",
    wished: "wishes for",
    drew: "draws a card",
    drewMany: "draws",
    cards: "cards",
    skipped: "is skipped",
    reversed: "reverses the direction",
    passed: "passes",
    recycled: "The discard pile was reshuffled.",
    ended: "The host ended the round.",
    mau: "Mau!",
    wins: "wins the round.",
    exhausted: "No cards left in the pile."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function wildRankIds(deck: DeckDefinition): string[] {
  return deck.wildRankIds ?? ["jack"];
}

function isWild(deck: DeckDefinition, card: CardInstance): boolean {
  return wildRankIds(deck).includes(card.rankId) || card.tags.includes("joker");
}

function effectiveSuitId(state: CardGameState): string | null {
  return state.wishSuitId ?? topDiscardCard(state.table)?.suitId ?? null;
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function hasPlayableCard(state: CardGameState, context: CardRulesetContext, playerId: string): boolean {
  return handOf(state.table, playerId).some(
    (cardId) => mauMauRuleset.canPlayCard(state, context, playerId, cardId).allowed
  );
}

function suitChoice(deck: DeckDefinition, label: string): CardTableChoiceState {
  return {
    id: "wish-suit",
    label,
    options: deck.suits.map((suit) => ({
      id: suit.id,
      label: suit.label,
      symbol: suit.symbol,
      color: suit.color
    }))
  };
}

export const mauMauRuleset: CardRuleset = {
  id: "mau-mau",
  label: { de: "Mau-Mau", en: "Mau Mau" },
  defaultDeckId: "french-52",
  defaultHandSize: 5,
  openStartCard: true,
  turnBased: true,

  introMessage(context) {
    return words(context).intro as string;
  },

  canPlayCard(state, context, playerId, cardId): CardPlayCheck {
    const text = words(context);

    if (!handOf(state.table, playerId).includes(cardId)) {
      return { allowed: false, hint: text.notInHand as string };
    }

    if (!isActive(state, playerId)) {
      return { allowed: false, hint: text.notYourTurn as string };
    }

    const card = state.table.cards[cardId];
    const top = topDiscardCard(state.table);

    if (!card || !top) {
      return { allowed: false };
    }

    if (state.pendingDraw > 0) {
      return mauMauRules.drawTwoRankIds.includes(card.rankId as never)
        ? { allowed: true }
        : { allowed: false, hint: text.mustSeven as string };
    }

    if (isWild(context.deck, card)) {
      return { allowed: true };
    }

    if (card.suitId !== null && card.suitId === effectiveSuitId(state)) {
      return { allowed: true };
    }

    if (state.wishSuitId === null && card.rankId === top.rankId) {
      return { allowed: true };
    }

    return { allowed: false, hint: text.noMatch as string };
  },

  playCard(state, context, playerId, cardId, choiceId) {
    const text = words(context);
    const check = mauMauRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.noMatch as string));
    }

    const card = state.table.cards[cardId];

    if (!card) {
      return withError(state, text.notInHand as string);
    }

    const wild = isWild(context.deck, card);
    const wishSuitId = wild
      ? context.deck.suits.find((suit) => suit.id === choiceId)?.id ?? null
      : null;

    if (wild && !wishSuitId) {
      return withError(state, text.needWish as string);
    }

    const face = toCardFace(context.deck, card);
    const name = playerName(context, playerId);
    let table = playCardToDiscard(state.table, playerId, cardId);
    let pendingDraw = state.pendingDraw;
    let logText = `${text.played} ${face.rankLabel} ${face.suitSymbol}`;

    if (mauMauRules.drawTwoRankIds.includes(card.rankId as never)) {
      pendingDraw += mauMauRules.drawTwoAmount;
      logText = `${logText} (+${pendingDraw})`;
      table = advanceTurn(table);
    } else if (mauMauRules.skipRankIds.includes(card.rankId as never)) {
      logText = `${logText} - ${text.skipped}`;
      table = advanceTurn(table, 2);
    } else if (mauMauRules.reverseRankIds.includes(card.rankId as never)) {
      logText = `${logText} - ${text.reversed}`;
      table = advanceTurn(reverseDirection(table));
    } else {
      table = advanceTurn(table);
    }

    if (wishSuitId) {
      const suit = context.deck.suits.find((entry) => entry.id === wishSuitId);
      logText = `${logText} - ${text.wished} ${suit?.label ?? wishSuitId} ${suit?.symbol ?? ""}`.trim();
    }

    const next = appendLog(
      clearError({
        ...state,
        table,
        pendingDraw,
        drawnThisTurn: 0,
        wishSuitId,
        turnNumber: state.turnNumber + 1,
        updatedAt: context.now
      }),
      name,
      logText
    );

    if (handOf(table, playerId).length === 0) {
      return finishGame(next, playerId, name, `${name} ${text.wins}`);
    }

    return next;
  },

  drawCard(state, context, playerId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    if (state.pendingDraw > 0) {
      const penalty = state.pendingDraw;
      const result = drawCards(state.table, playerId, penalty);

      if (result.exhausted && result.drawnCardIds.length === 0) {
        return withError(state, text.exhausted as string);
      }

      return appendLog(
        clearError({
          ...state,
          table: advanceTurn(result.state),
          pendingDraw: 0,
          drawnThisTurn: 0,
          turnNumber: state.turnNumber + 1,
          updatedAt: context.now
        }),
        playerName(context, playerId),
        `${text.drewMany} ${penalty} ${text.cards}`
      );
    }

    if (state.drawnThisTurn === 0) {
      const result = drawCards(state.table, playerId, 1);

      if (result.exhausted) {
        return withError(state, text.exhausted as string);
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
    }

    return mauMauRuleset.runAction(state, context, playerId, "pass");
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (actionId !== "pass" || !isActive(state, playerId)) {
      return state;
    }

    if (state.drawnThisTurn === 0 && state.pendingDraw === 0) {
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
      {
        id: "draw",
        label:
          state.pendingDraw > 0 ? `${text.draw} +${state.pendingDraw}` : (text.draw as string),
        kind: state.pendingDraw > 0 ? "danger" : "primary",
        enabled: active
      },
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
      {
        id: "draw",
        label:
          state.pendingDraw > 0 ? `${text.draw} +${state.pendingDraw}` : (text.draw as string),
        kind: "primary",
        enabled
      },
      { id: "recycle", label: text.recycle as string, kind: "secondary", enabled },
      { id: "end", label: text.end as string, kind: "danger", enabled }
    ];
  },

  runHostAction(state, context, actionId) {
    const text = words(context);
    const active = state.table.turnOrder[state.table.activeIndex];

    if (actionId === "draw" && active) {
      return mauMauRuleset.drawCard(state, context, active);
    }

    if (actionId === "recycle") {
      return appendLog(
        { ...state, table: recycleDiscardPile(state.table), updatedAt: context.now },
        null,
        text.recycled as string
      );
    }

    if (actionId === "end") {
      return finishGame(state, null, null, text.ended as string);
    }

    return state;
  },

  choiceForCard(state, context, cardId) {
    const card = state.table.cards[cardId];

    if (!card || !isWild(context.deck, card)) {
      return undefined;
    }

    return suitChoice(context.deck, words(context).needWish as string);
  },

  condition(state, context) {
    const text = words(context);

    if (state.wishSuitId) {
      const suit = context.deck.suits.find((entry) => entry.id === state.wishSuitId);

      return {
        label: `${text.wished} ${suit?.label ?? state.wishSuitId}`,
        symbol: suit?.symbol,
        color: suit?.color
      };
    }

    if (state.pendingDraw > 0) {
      return { label: `+${state.pendingDraw}`, symbol: "!", color: "red" };
    }

    return undefined;
  },

  seatStatus(state, context, playerId) {
    return handOf(state.table, playerId).length === 1 ? (words(context).mau as string) : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Mau-Mau" }]
      : [];
  }
};
