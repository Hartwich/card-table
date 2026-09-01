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
import { bestOf, smallestOpponentHand, suitCounts } from "../bots/tactics.js";
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
    wishShort: "Wunsch",
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
    wishShort: "Wish",
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

  rules(context) {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: ["Be the first to play every card in your hand."]
          },
          {
            title: "Playing a card",
            lines: [
              "Your card has to match the top card of the pile in suit or in rank.",
              "A jack may always be played, whatever is lying there.",
              "With a joker deck, jokers work like jacks."
            ]
          },
          {
            title: "Special cards",
            lines: [
              "7 — the next player draws two. Sevens stack: play one on top and the whole penalty moves on.",
              "8 — the next player is skipped.",
              "9 — the direction of play reverses. With two players it works like a skip.",
              "Jack — you name a suit. Only that suit counts until the next jack."
            ]
          },
          {
            title: "If you cannot or will not play",
            lines: [
              "Draw exactly one card.",
              "Does it fit? Then you may play it right away — or keep it and pass.",
              "Does it not fit? The turn passes on.",
              "Facing a stack of sevens you have to play a seven or take all the penalty cards."
            ]
          },
          {
            title: "End of the round",
            lines: [
              "The first player with an empty hand wins the round and scores one point.",
              "An empty draw pile is refilled from the discard pile, so the round never stalls."
            ]
          },
          {
            title: "On your phone",
            lines: [
              "Tap a card to pick it up, tap again to play it — or use Play.",
              "Greyed-out cards do not fit; the reason is shown next to the buttons.",
              "Draw takes a card, Pass hands over once you have drawn."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: ["Lege als Erster alle Karten deiner Hand ab."]
          },
          {
            title: "Anlegen",
            lines: [
              "Deine Karte muss die Farbe oder den Wert der obersten Ablagekarte treffen.",
              "Ein Bube darf immer gelegt werden, egal was oben liegt.",
              "Im Blatt mit Jokern wirken die Joker wie Buben."
            ]
          },
          {
            title: "Sonderkarten",
            lines: [
              "7 — der Nächste zieht zwei. Siebenen stapeln sich: Wer eine drauflegt, gibt die ganze Strafe weiter.",
              "8 — der Nächste setzt aus.",
              "9 — die Spielrichtung dreht sich. Zu zweit wirkt sie wie Aussetzen.",
              "Bube — du wünschst dir eine Farbe. Bis zum nächsten Buben zählt nur diese Farbe."
            ]
          },
          {
            title: "Wenn nichts passt",
            lines: [
              "Zieh genau eine Karte.",
              "Passt sie, darfst du sie sofort legen — oder behalten und abgeben.",
              "Passt sie nicht, ist der Nächste dran.",
              "Liegt ein Sieben-Angriff an, musst du eine Sieben legen oder alle Strafkarten ziehen."
            ]
          },
          {
            title: "Rundenende",
            lines: [
              "Wer zuerst keine Karte mehr hat, gewinnt die Runde und bekommt einen Punkt.",
              "Ist der Nachziehstapel leer, wird die Ablage neu gemischt — die Runde kann nicht steckenbleiben."
            ]
          },
          {
            title: "Am Handy",
            lines: [
              "Karte antippen wählt sie aus, zweites Tippen legt sie — oder du nimmst „Legen“.",
              "Ausgegraute Karten passen nicht; der Grund steht neben den Buttons.",
              "„Ziehen“ nimmt eine Karte, „Weiter“ gibt ab, nachdem du gezogen hast."
            ]
          }
        ];
  },

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
      // Zu zweit gäbe ein Richtungswechsel nichts her - dort wirkt er wie Aussetzen.
      const twoPlayers = table.turnOrder.length <= 2;
      logText = `${logText} - ${twoPlayers ? text.skipped : text.reversed}`;
      table = advanceTurn(reverseDirection(table), twoPlayers ? 2 : 1);
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
        label: `${text.wishShort}: ${suit?.label ?? state.wishSuitId}`,
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
  },

  /**
   * KI-Zug.
   *
   * Grundhaltung: Sonderkarten sind Munition, keine Ballast. Der Bot spart sie
   * auf, solange die Runde ruhig läuft, und feuert sie, sobald jemand kurz vor
   * dem Sieg steht. Der Bube ist die teuerste Karte - er passt immer und wird
   * deshalb zuletzt gelegt.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const hand = handOf(state.table, playerId);
    const playable = hand.filter(
      (cardId) => mauMauRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    if (playable.length === 0) {
      return state.drawnThisTurn === 0 ? { kind: "draw" } : { kind: "action", actionId: "pass" };
    }

    // Gestapelte Siebenen: weiterreichen, solange eine da ist.
    if (state.pendingDraw > 0) {
      const seven = playable[0];

      return seven ? { kind: "play", cardId: seven } : { kind: "draw" };
    }

    const pressure = smallestOpponentHand(state, playerId) <= 2;
    const counts = suitCounts(state, playerId);

    const cardId = bestOf(playable, (entry) => {
      const card = state.table.cards[entry];

      if (!card) {
        return -100;
      }

      const wild = isWild(context.deck, card);
      const attack =
        mauMauRules.drawTwoRankIds.includes(card.rankId as never) ||
        mauMauRules.skipRankIds.includes(card.rankId as never);

      // Wunschkarten halten, solange es andere Wege gibt.
      if (wild) {
        return hand.length <= 2 ? 40 : -20;
      }

      if (attack) {
        return pressure ? 60 : 5;
      }

      // Sonst aus der längsten Farbe legen - das hält die Hand anschlussfähig.
      return 15 + (counts.get(card.suitId ?? "") ?? 0);
    });

    if (!cardId) {
      return { kind: "draw" };
    }

    const card = state.table.cards[cardId];

    if (!card || !isWild(context.deck, card)) {
      return { kind: "play", cardId };
    }

    // Gewünscht wird die Farbe, die nach dem Legen am stärksten auf der Hand ist.
    const remaining = new Map(counts);
    const ownSuit = card.suitId;

    if (ownSuit) {
      remaining.set(ownSuit, (remaining.get(ownSuit) ?? 1) - 1);
    }

    const wish = bestOf(context.deck.suits, (suit) => remaining.get(suit.id) ?? 0);

    return { kind: "play", cardId, choiceId: wish?.id };
  }
};
