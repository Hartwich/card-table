import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type {
  CardTableActionState,
  CardTableRuleSectionState,
  CardTableStackState
} from "../protocol.js";
import { bestOf } from "../bots/tactics.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  readNumber,
  readText,
  withError,
  writeExtra,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Herzeln.
 *
 * Ein Stichspiel andersherum: Stiche will hier niemand haben. Jedes Herz zählt
 * einen Strafpunkt, die Pik-Dame gleich dreizehn. Wer am Ende am wenigsten
 * gesammelt hat, gewinnt die Runde - es sei denn, jemand nimmt gleich alles.
 *
 * Baut auf derselben Stichlogik auf wie die Stichwette und zeigt, dass ein
 * Regelwerk mit umgekehrtem Vorzeichen werten darf.
 */

const trickZoneId = "stich";
const wonZoneId = "abgelegt";
const leadKey = "leadSuitId";
const trickLeaderKey = "trickLeaderIndex";
const trickCountKey = "trickCount";
const brokenKey = "heartsBroken";
const openerKey = "openerCardId";
const penaltyKey = (playerId: string): string => `pen:${playerId}`;

const heartsSuit = "hearts";
const spadesSuit = "spades";
const queenRank = "queen";
const noLead = "";
const allPenalties = 26;

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Herzeln: Stiche vermeiden. Jedes Herz zählt eins, die Pik-Dame dreizehn.",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    mustFollow: "Du musst Farbe bedienen.",
    heartsClosed: "Herz ist noch nicht gebrochen.",
    mustOpen: "Die Runde beginnt mit der Kreuz-Zwei.",
    plays: "legt",
    takesTrick: "nimmt den Stich",
    points: "Punkte",
    penalty: "Strafpunkte",
    broken: "Herz ist gebrochen",
    moon: "kassiert alles - alle anderen bekommen die Strafpunkte.",
    wins: "hat die wenigsten Strafpunkte.",
    trick: "Stich",
    yourPenalty: "Deine Strafpunkte",
    end: "Runde beenden",
    ended: "Der Host hat die Runde beendet."
  },
  en: {
    intro: "Hearts: avoid tricks. Every heart counts one, the queen of spades thirteen.",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    mustFollow: "You have to follow suit.",
    heartsClosed: "Hearts have not been broken yet.",
    mustOpen: "The round starts with the two of clubs.",
    plays: "plays",
    takesTrick: "takes the trick",
    points: "points",
    penalty: "penalty points",
    broken: "hearts are broken",
    moon: "shot the moon - everyone else takes the penalty instead.",
    wins: "has the fewest penalty points.",
    trick: "Trick",
    yourPenalty: "Your penalty",
    end: "End round",
    ended: "The host ended the round."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function penaltyOf(card: CardInstance): number {
  if (card.suitId === spadesSuit && card.rankId === queenRank) {
    return 13;
  }

  return card.suitId === heartsSuit ? 1 : 0;
}

function rankOrder(context: CardRulesetContext, card: CardInstance): number {
  return context.deck.ranks.find((rank) => rank.id === card.rankId)?.order ?? 0;
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function trickCardIds(state: CardGameState): string[] {
  return state.table.zones[trickZoneId] ?? [];
}

function penaltyPoints(state: CardGameState, playerId: string): number {
  return readNumber(state, penaltyKey(playerId));
}

/** Höchste Karte der angespielten Farbe gewinnt. */
function trickWinner(state: CardGameState, context: CardRulesetContext): string {
  const cardIds = trickCardIds(state);
  const order = state.table.turnOrder;
  const leaderIndex = readNumber(state, trickLeaderKey);
  const leadSuitId = readText(state, leadKey) ?? noLead;
  let bestIndex = 0;
  let bestScore = -1;

  cardIds.forEach((cardId, index) => {
    const card = state.table.cards[cardId];

    if (!card || card.suitId !== leadSuitId) {
      return;
    }

    const score = rankOrder(context, card);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return order[(leaderIndex + bestIndex) % order.length] as string;
}

function finishDeal(state: CardGameState, context: CardRulesetContext): CardGameState {
  const text = words(context);
  const seats = state.table.turnOrder;
  const shooter = seats.find((playerId) => penaltyPoints(state, playerId) >= allPenalties);
  let next = state;

  if (shooter) {
    // Alles kassiert: Der Sammler kommt auf null, alle anderen auf die volle Last.
    const flipped: Record<string, number> = { [penaltyKey(shooter)]: 0 };

    for (const playerId of seats) {
      if (playerId !== shooter) {
        flipped[penaltyKey(playerId)] = allPenalties;
      }
    }

    next = appendLog(writeExtra(next, flipped), playerName(context, shooter), text.moon as string);
  }

  const best = seats.reduce(
    (leader, playerId) => (penaltyPoints(next, playerId) < penaltyPoints(next, leader) ? playerId : leader),
    seats[0] ?? ""
  );

  for (const playerId of seats) {
    next = appendLog(
      next,
      playerName(context, playerId),
      `${penaltyPoints(next, playerId)} ${text.penalty}`
    );
  }

  return finishGame(
    next,
    best || null,
    best ? playerName(context, best) : null,
    best ? `${playerName(context, best)} ${text.wins}` : (text.ended as string)
  );
}

export const herzelnRuleset: CardRuleset = {
  id: "herzeln",
  label: { de: "Herzeln", en: "Hearts" },
  defaultDeckId: "french-52",
  fixedDeckId: "french-52",
  defaultHandSize: 13,
  openStartCard: false,
  turnBased: true,

  handSizeFor({ playerCount }) {
    return Math.max(1, Math.floor(52 / Math.max(1, playerCount)));
  },

  setupRound(state) {
    const counters: Record<string, number | string | boolean | null> = {
      [leadKey]: noLead,
      [trickLeaderKey]: 0,
      [trickCountKey]: 0,
      [brokenKey]: false,
      [openerKey]: null
    };

    for (const playerId of state.table.turnOrder) {
      counters[penaltyKey(playerId)] = 0;
    }

    // Wer die Kreuz-Zwei hat, eröffnet - wie am echten Tisch.
    const opener = state.table.turnOrder.find((playerId) =>
      handOf(state.table, playerId).some((cardId) => {
        const card = state.table.cards[cardId];
        return card?.suitId === "clubs" && card.rankId === "2";
      })
    );

    if (opener) {
      const cardId = handOf(state.table, opener).find((entry) => {
        const card = state.table.cards[entry];
        return card?.suitId === "clubs" && card.rankId === "2";
      });
      counters[openerKey] = cardId ?? null;
    }

    const activeIndex = opener ? Math.max(0, state.table.turnOrder.indexOf(opener)) : 0;

    return {
      ...state,
      table: {
        ...state.table,
        activeIndex,
        zones: { ...state.table.zones, [trickZoneId]: [], [wonZoneId]: [] }
      },
      extra: { ...state.extra, ...counters }
    };
  },

  rules(context): CardTableRuleSectionState[] {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: [
              "Take as few penalty cards as possible.",
              "Every heart counts one point, the queen of spades counts thirteen.",
              "Fewest points wins the round."
            ]
          },
          {
            title: "Playing a trick",
            lines: [
              "The round opens with the two of clubs.",
              "Everyone must follow the suit that was led if they hold it.",
              "There is no trump: the highest card of the suit led takes the trick.",
              "Whoever takes the trick leads the next one."
            ]
          },
          {
            title: "Hearts have to be broken",
            lines: [
              "A heart may not be led until a heart has fallen on an earlier trick.",
              "If your hand is nothing but hearts, you may lead one anyway."
            ]
          },
          {
            title: "Shooting the moon",
            lines: [
              "Collecting every single penalty card turns the round around:",
              "the collector drops to zero and everyone else takes the full load."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: [
              "Nimm so wenige Strafkarten wie möglich.",
              "Jedes Herz zählt einen Punkt, die Pik-Dame zählt dreizehn.",
              "Wer am wenigsten hat, gewinnt die Runde."
            ]
          },
          {
            title: "Einen Stich spielen",
            lines: [
              "Die Runde beginnt mit der Kreuz-Zwei.",
              "Alle müssen die angespielte Farbe bedienen, wenn sie sie haben.",
              "Es gibt keinen Trumpf: Die höchste Karte der angespielten Farbe nimmt den Stich.",
              "Wer den Stich nimmt, spielt den nächsten an."
            ]
          },
          {
            title: "Herz muss erst gebrochen werden",
            lines: [
              "Herz darf erst angespielt werden, wenn in einem früheren Stich ein Herz gefallen ist.",
              "Hast du nur noch Herz auf der Hand, darfst du trotzdem anspielen."
            ]
          },
          {
            title: "Alles kassieren",
            lines: [
              "Wer sämtliche Strafkarten einsammelt, dreht die Runde um:",
              "Er kommt auf null, alle anderen bekommen die volle Last."
            ]
          }
        ];
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

    if (!card) {
      return { allowed: false };
    }

    const opener = readText(state, openerKey);

    if (opener) {
      return cardId === opener ? { allowed: true } : { allowed: false, hint: text.mustOpen as string };
    }

    const leadSuitId = readText(state, leadKey) ?? noLead;
    const hand = handOf(state.table, playerId);

    if (leadSuitId === noLead) {
      // Anspiel: Herz erst, wenn es gebrochen ist oder nichts anderes bleibt.
      if (card.suitId === heartsSuit && state.extra[brokenKey] !== true) {
        const onlyHearts = hand.every((entry) => state.table.cards[entry]?.suitId === heartsSuit);
        return onlyHearts ? { allowed: true } : { allowed: false, hint: text.heartsClosed as string };
      }

      return { allowed: true };
    }

    if (card.suitId === leadSuitId) {
      return { allowed: true };
    }

    const canFollow = hand.some((entry) => state.table.cards[entry]?.suitId === leadSuitId);

    return canFollow ? { allowed: false, hint: text.mustFollow as string } : { allowed: true };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = herzelnRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    const card = state.table.cards[cardId] as CardInstance;
    const face = toCardFace(context.deck, card);
    const wasEmpty = trickCardIds(state).length === 0;
    const table = moveCard(state.table, cardId, { kind: "zone", zoneId: trickZoneId }, "bottom");
    const leadSuitId = wasEmpty ? card.suitId ?? noLead : readText(state, leadKey) ?? noLead;

    let next = appendLog(
      clearError(
        writeExtra({ ...state, table, turnNumber: state.turnNumber + 1, updatedAt: context.now }, {
          [leadKey]: leadSuitId,
          [trickLeaderKey]: wasEmpty ? state.table.activeIndex : readNumber(state, trickLeaderKey),
          [openerKey]: null
        })
      ),
      playerName(context, playerId),
      `${text.plays} ${face.rankLabel} ${face.suitSymbol}`
    );

    if (card.suitId === heartsSuit && next.extra[brokenKey] !== true) {
      next = appendLog(writeExtra(next, { [brokenKey]: true }), null, text.broken as string);
    }

    if (trickCardIds(next).length < next.table.turnOrder.length) {
      return {
        ...next,
        table: { ...next.table, activeIndex: (next.table.activeIndex + 1) % next.table.turnOrder.length }
      };
    }

    const winnerId = trickWinner(next, context);
    const winnerIndex = Math.max(0, next.table.turnOrder.indexOf(winnerId));
    const played = trickCardIds(next);
    const penalty = played.reduce((sum, entry) => {
      const trickCard = next.table.cards[entry];
      return sum + (trickCard ? penaltyOf(trickCard) : 0);
    }, 0);
    let cleared = next.table;

    for (const trickCardId of played) {
      cleared = moveCard(cleared, trickCardId, { kind: "zone", zoneId: wonZoneId }, "bottom");
    }

    const trickCount = readNumber(next, trickCountKey) + 1;

    next = appendLog(
      writeExtra(
        { ...next, table: { ...cleared, activeIndex: winnerIndex } },
        {
          [penaltyKey(winnerId)]: penaltyPoints(next, winnerId) + penalty,
          [leadKey]: noLead,
          [trickLeaderKey]: winnerIndex,
          [trickCountKey]: trickCount
        }
      ),
      playerName(context, winnerId),
      penalty > 0
        ? `${text.takesTrick} (+${penalty} ${text.points})`
        : (text.takesTrick as string)
    );

    const cardsLeft = next.table.turnOrder.reduce(
      (sum, entry) => sum + handOf(next.table, entry).length,
      0
    );

    return cardsLeft === 0 ? finishDeal(next, context) : next;
  },

  drawCard(state) {
    return state;
  },

  runAction(state) {
    return state;
  },

  controllerActions(): CardTableActionState[] {
    return [];
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
    const cards = trickCardIds(state)
      .map((cardId) => state.table.cards[cardId])
      .filter((card): card is CardInstance => Boolean(card))
      .map((card) => toCardFace(context.deck, card));
    const total = readNumber(state, trickCountKey);

    return [
      {
        id: trickZoneId,
        label: `${text.trick} ${total + (cards.length > 0 ? 1 : 0)}`,
        kind: "zone",
        count: cards.length,
        cards,
        faceDown: false
      }
    ];
  },

  condition(state, context) {
    return state.extra[brokenKey] === true
      ? { label: words(context).broken as string, symbol: "♥", color: "red" }
      : undefined;
  },

  privateNote(state, context, playerId) {
    return `${words(context).yourPenalty}: ${penaltyPoints(state, playerId)}`;
  },

  seatStatus(state, context, playerId) {
    const points = penaltyPoints(state, playerId);
    return points > 0 ? `${points}` : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    const seats = state.table.turnOrder;

    if (seats.length === 0) {
      return [];
    }

    const best = seats.reduce((low, playerId) => Math.min(low, penaltyPoints(state, playerId)), Infinity);

    return seats
      .filter((playerId) => penaltyPoints(state, playerId) === best)
      .map((playerId) => ({ playerId, delta: 1, reason: "Herzeln" }));
  },

  /**
   * KI-Zug.
   *
   * Herzeln spielt man rückwärts: Der Stich ist die Strafe, nicht der Preis.
   * Der Bot prüft für jede erlaubte Karte, ob sie den Stich gerade anführen
   * würde. Kann er verlieren, wirft er das Teuerste ab, was er hat - die
   * Pik-Dame zuerst. Muss er nehmen, nimmt er so billig wie möglich. Beim
   * Anspiel geht er tief raus und lässt Strafkarten liegen.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const playable = handOf(state.table, playerId).filter(
      (cardId) => herzelnRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    if (playable.length === 0) {
      return { kind: "wait" };
    }

    const cost = (cardId: string): number => {
      const card = state.table.cards[cardId];

      return card ? rankOrder(context, card) + penaltyOf(card) * 20 : 0;
    };

    // Anspiel: tief herauskommen und nichts Teures verschenken.
    if (trickCardIds(state).length === 0) {
      const cardId = bestOf(playable, (entry) => -cost(entry));

      return { kind: "play", cardId: cardId as string };
    }

    const takers = playable.filter((cardId) => wouldTakeTrick(state, context, playerId, cardId));
    const safe = playable.filter((cardId) => !takers.includes(cardId));

    if (safe.length > 0) {
      // Sicher: das Teuerste abwerfen, denn dieser Stich gehört jemand anderem.
      return { kind: "play", cardId: bestOf(safe, cost) as string };
    }

    return { kind: "play", cardId: bestOf(playable, (entry) => -cost(entry)) as string };
  }
};

/** Würde diese Karte den Stich im Moment anführen? */
function wouldTakeTrick(
  state: CardGameState,
  context: CardRulesetContext,
  playerId: string,
  cardId: string
): boolean {
  const simulated: CardGameState = {
    ...state,
    table: {
      ...state.table,
      zones: { ...state.table.zones, [trickZoneId]: [...trickCardIds(state), cardId] }
    }
  };

  return trickWinner(simulated, context) === playerId;
}
