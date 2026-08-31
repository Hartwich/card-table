import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableStackState } from "../protocol.js";
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
 * Wizard.
 *
 * Jede Plattform-Runde ist ein Wizard-Durchgang: In Runde 1 bekommt jeder eine
 * Karte, in Runde 2 zwei und so weiter. Erst wird reihum die Zahl der eigenen
 * Stiche angesagt, dann wird gespielt. Wer genau seine Ansage trifft, bekommt
 * 20 Punkte plus 10 je Stich, sonst 10 Minuspunkte je Stich Abweichung.
 *
 * Zeigt auf dem Fundament, wie ein Regelwerk mehrere Phasen, einen Stich als
 * eigene Tischzone und eine echte Punktewertung unterbringt.
 */

const trickZoneId = "stich";
const trumpZoneId = "trumpf";
const wonZoneId = "abgelegt";
const deckSize = 60;

const phaseKey = "phase";
const trumpKey = "trumpSuitId";
const leadKey = "leadSuitId";
const trickLeaderKey = "trickLeaderIndex";
const trickCountKey = "trickCount";
const dealSizeKey = "dealSize";
const bidKey = (playerId: string): string => `bid:${playerId}`;
const tricksKey = (playerId: string): string => `tricks:${playerId}`;

const noLead = "";
const wizardLead = "*";

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Wizard: Erst Stiche ansagen, dann spielen. Zauberer sticht alles, der Narr nichts.",
    bidPrompt: "Sag deine Stiche an.",
    bidLabel: "Ansage",
    tricks: "Stiche",
    trump: "Trumpf",
    noTrump: "kein Trumpf",
    bidding: "Ansagen laufen",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    bidFirst: "Erst ansagen.",
    mustFollow: "Du musst Farbe bedienen.",
    announced: "sagt",
    plays: "legt",
    winsTrick: "gewinnt den Stich",
    roundOver: "Durchgang beendet.",
    hit: "trifft die Ansage",
    missed: "verfehlt die Ansage",
    wins: "holt den Durchgang.",
    trick: "Stich",
    waiting: "wartet"
  },
  en: {
    intro: "Wizard: bid your tricks first, then play. A wizard beats everything, a jester nothing.",
    bidPrompt: "Bid your tricks.",
    bidLabel: "Bid",
    tricks: "Tricks",
    trump: "Trump",
    noTrump: "no trump",
    bidding: "Bidding",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    bidFirst: "Bid first.",
    mustFollow: "You have to follow suit.",
    announced: "bids",
    plays: "plays",
    winsTrick: "wins the trick",
    roundOver: "Deal finished.",
    hit: "hits the bid",
    missed: "misses the bid",
    wins: "takes the deal.",
    trick: "Trick",
    waiting: "waiting"
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function isWizardCard(card: CardInstance): boolean {
  return card.rankId === "wizard";
}

function isJesterCard(card: CardInstance): boolean {
  return card.rankId === "jester";
}

function rankOrder(context: CardRulesetContext, card: CardInstance): number {
  return context.deck.ranks.find((rank) => rank.id === card.rankId)?.order ?? 0;
}

function bidOf(state: CardGameState, playerId: string): number {
  return readNumber(state, bidKey(playerId), -1);
}

function tricksOf(state: CardGameState, playerId: string): number {
  return readNumber(state, tricksKey(playerId), 0);
}

function isBidding(state: CardGameState): boolean {
  return readText(state, phaseKey) === "bid";
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function trickCardIds(state: CardGameState): string[] {
  return state.table.zones[trickZoneId] ?? [];
}

/** Ermittelt den Gewinner eines vollständigen Stichs. */
function trickWinner(state: CardGameState, context: CardRulesetContext): string {
  const cardIds = trickCardIds(state);
  const order = state.table.turnOrder;
  const leaderIndex = readNumber(state, trickLeaderKey);
  const trumpSuitId = readText(state, trumpKey);
  const owners = cardIds.map((_, index) => order[(leaderIndex + index) % order.length] as string);
  const cards = cardIds.map((cardId) => state.table.cards[cardId] as CardInstance);

  const wizardIndex = cards.findIndex((card) => card && isWizardCard(card));

  if (wizardIndex >= 0) {
    return owners[wizardIndex] as string;
  }

  let bestIndex = -1;
  let bestScore = -1;

  cards.forEach((card, index) => {
    if (!card || isJesterCard(card)) {
      return;
    }

    const followsTrump = Boolean(trumpSuitId) && card.suitId === trumpSuitId;
    const leadSuitId = cards.find((entry) => entry && !isJesterCard(entry))?.suitId ?? null;
    const followsLead = card.suitId === leadSuitId;
    const score = (followsTrump ? 200 : followsLead ? 100 : 0) + rankOrder(context, card);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return owners[bestIndex >= 0 ? bestIndex : 0] as string;
}

/** Wertet den Durchgang aus und beendet die Runde. */
function finishDeal(state: CardGameState, context: CardRulesetContext): CardGameState {
  const text = words(context);
  let next = state;
  let bestPlayerId: string | null = null;
  let bestPoints = Number.NEGATIVE_INFINITY;

  for (const playerId of state.table.turnOrder) {
    const bid = bidOf(state, playerId);
    const tricks = tricksOf(state, playerId);
    const points = bid === tricks ? 20 + 10 * tricks : -10 * Math.abs(bid - tricks);

    next = appendLog(
      next,
      playerName(context, playerId),
      `${bid === tricks ? text.hit : text.missed} (${tricks}/${bid}) ${points > 0 ? "+" : ""}${points}`
    );

    if (points > bestPoints) {
      bestPoints = points;
      bestPlayerId = playerId;
    }
  }

  return finishGame(
    next,
    bestPlayerId,
    bestPlayerId ? playerName(context, bestPlayerId) : null,
    bestPlayerId ? `${playerName(context, bestPlayerId)} ${text.wins}` : (text.roundOver as string)
  );
}

export const wizardRuleset: CardRuleset = {
  id: "wizard",
  label: { de: "Wizard", en: "Wizard" },
  defaultDeckId: "wizard-60",
  fixedDeckId: "wizard-60",
  defaultHandSize: 5,
  openStartCard: false,
  turnBased: true,

  handSizeFor({ roundNumber, playerCount }) {
    return Math.max(1, Math.min(roundNumber, Math.floor((deckSize - 1) / Math.max(1, playerCount))));
  },

  setupRound(state, context) {
    const trumpCardId = state.table.drawPile[0] ?? null;
    const trumpCard = trumpCardId ? state.table.cards[trumpCardId] : null;
    let trumpSuitId: string | null = null;

    if (trumpCard && !isJesterCard(trumpCard)) {
      trumpSuitId = isWizardCard(trumpCard)
        ? context.deck.suits[Math.floor(Math.random() * context.deck.suits.length)]?.id ?? null
        : trumpCard.suitId;
    }

    const counters: Record<string, number | string | null> = {
      [phaseKey]: "bid",
      [trumpKey]: trumpSuitId,
      [leadKey]: noLead,
      [trickLeaderKey]: 0,
      [trickCountKey]: 0,
      [dealSizeKey]: state.handSize
    };

    for (const playerId of state.table.turnOrder) {
      counters[bidKey(playerId)] = -1;
      counters[tricksKey(playerId)] = 0;
    }

    return {
      ...state,
      table: {
        ...state.table,
        drawPile: trumpCardId ? state.table.drawPile.slice(1) : state.table.drawPile,
        zones: {
          ...state.table.zones,
          [trickZoneId]: [],
          [trumpZoneId]: trumpCardId ? [trumpCardId] : [],
          [wonZoneId]: []
        }
      },
      extra: { ...state.extra, ...counters }
    };
  },

  introMessage(context) {
    return words(context).intro as string;
  },

  canPlayCard(state, context, playerId, cardId) {
    const text = words(context);

    if (!handOf(state.table, playerId).includes(cardId)) {
      return { allowed: false, hint: text.notInHand as string };
    }

    if (isBidding(state)) {
      return { allowed: false, hint: text.bidFirst as string };
    }

    if (!isActive(state, playerId)) {
      return { allowed: false, hint: text.notYourTurn as string };
    }

    const card = state.table.cards[cardId];

    if (!card) {
      return { allowed: false };
    }

    const leadSuitId = readText(state, leadKey) ?? noLead;

    if (leadSuitId === noLead || leadSuitId === wizardLead || isWizardCard(card) || isJesterCard(card)) {
      return { allowed: true };
    }

    if (card.suitId === leadSuitId) {
      return { allowed: true };
    }

    const canFollow = handOf(state.table, playerId).some((entry) => {
      const handCard = state.table.cards[entry];
      return handCard && !isWizardCard(handCard) && !isJesterCard(handCard) && handCard.suitId === leadSuitId;
    });

    return canFollow ? { allowed: false, hint: text.mustFollow as string } : { allowed: true };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = wizardRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    const card = state.table.cards[cardId] as CardInstance;
    const face = toCardFace(context.deck, card);
    const wasEmpty = trickCardIds(state).length === 0;
    const table = moveCard(state.table, cardId, { kind: "zone", zoneId: trickZoneId }, "bottom");
    let leadSuitId = readText(state, leadKey) ?? noLead;

    if (leadSuitId === noLead) {
      leadSuitId = isWizardCard(card) ? wizardLead : isJesterCard(card) ? noLead : card.suitId ?? noLead;
    }

    let next = appendLog(
      clearError(
        writeExtra(
          {
            ...state,
            table,
            turnNumber: state.turnNumber + 1,
            updatedAt: context.now
          },
          {
            [leadKey]: leadSuitId,
            [trickLeaderKey]: wasEmpty ? state.table.activeIndex : readNumber(state, trickLeaderKey)
          }
        )
      ),
      playerName(context, playerId),
      `${text.plays} ${face.rankLabel} ${face.suitSymbol}`
    );

    if (trickCardIds(next).length < next.table.turnOrder.length) {
      return {
        ...next,
        table: { ...next.table, activeIndex: (next.table.activeIndex + 1) % next.table.turnOrder.length }
      };
    }

    const winnerId = trickWinner(next, context);
    const winnerIndex = Math.max(0, next.table.turnOrder.indexOf(winnerId));
    const played = trickCardIds(next);
    let cleared = next.table;

    for (const trickCardId of played) {
      cleared = moveCard(cleared, trickCardId, { kind: "zone", zoneId: wonZoneId }, "bottom");
    }

    const trickCount = readNumber(next, trickCountKey) + 1;

    next = appendLog(
      writeExtra(
        {
          ...next,
          table: { ...cleared, activeIndex: winnerIndex }
        },
        {
          [tricksKey(winnerId)]: tricksOf(next, winnerId) + 1,
          [leadKey]: noLead,
          [trickLeaderKey]: winnerIndex,
          [trickCountKey]: trickCount
        }
      ),
      playerName(context, winnerId),
      text.winsTrick as string
    );

    if (trickCount >= readNumber(next, dealSizeKey, next.handSize)) {
      return finishDeal(next, context);
    }

    return next;
  },

  drawCard(state) {
    return state;
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (!actionId.startsWith("bid:")) {
      return state;
    }

    if (!isBidding(state)) {
      return state;
    }

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    const dealSize = readNumber(state, dealSizeKey, state.handSize);
    const bid = Number.parseInt(actionId.slice(4), 10);

    if (!Number.isFinite(bid) || bid < 0 || bid > dealSize) {
      return state;
    }

    let next = appendLog(
      clearError(writeExtra(state, { [bidKey(playerId)]: bid })),
      playerName(context, playerId),
      `${text.announced} ${bid}`
    );
    const allBid = next.table.turnOrder.every((entry) => bidOf(next, entry) >= 0);

    if (allBid) {
      return writeExtra(
        {
          ...next,
          table: { ...next.table, activeIndex: 0 },
          message: text.intro as string,
          updatedAt: context.now
        },
        { [phaseKey]: "play", [trickLeaderKey]: 0 }
      );
    }

    return {
      ...next,
      table: { ...next.table, activeIndex: (next.table.activeIndex + 1) % next.table.turnOrder.length },
      updatedAt: context.now
    };
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    if (!isBidding(state) || state.gameOver || state.phase !== "playing") {
      return [];
    }

    const text = words(context);
    const enabled = isActive(state, playerId);
    const dealSize = readNumber(state, dealSizeKey, state.handSize);

    return Array.from({ length: dealSize + 1 }, (_, bid) => ({
      id: `bid:${bid}`,
      label: `${text.bidLabel} ${bid}`,
      kind: bid === 0 ? "secondary" : ("primary" as const),
      enabled
    }));
  },

  hostActions(state, context): CardTableActionState[] {
    return [
      {
        id: "end",
        label: context.language === "en" ? "End deal" : "Durchgang beenden",
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
    const trumpFaces = faces(trumpZoneId);
    const trickFaces = faces(trickZoneId);

    return [
      {
        id: trumpZoneId,
        label: text.trump as string,
        kind: "zone",
        count: trumpFaces.length,
        cards: trumpFaces,
        faceDown: false
      },
      {
        id: trickZoneId,
        label: `${text.trick} ${Math.min(readNumber(state, trickCountKey) + 1, readNumber(state, dealSizeKey, state.handSize))}/${readNumber(state, dealSizeKey, state.handSize)}`,
        kind: "zone",
        count: trickFaces.length,
        cards: trickFaces,
        faceDown: false
      }
    ];
  },

  condition(state, context) {
    const text = words(context);
    const trumpSuitId = readText(state, trumpKey);
    const suit = context.deck.suits.find((entry) => entry.id === trumpSuitId);

    if (isBidding(state)) {
      return {
        label: `${text.bidding} · ${text.trump}: ${suit?.label ?? text.noTrump}`,
        symbol: suit?.symbol ?? "-",
        color: suit?.color
      };
    }

    return {
      label: `${text.trump}: ${suit?.label ?? text.noTrump}`,
      symbol: suit?.symbol ?? "-",
      color: suit?.color
    };
  },

  privateNote(state, context, playerId) {
    const text = words(context);
    const bid = bidOf(state, playerId);

    if (bid < 0) {
      return text.bidPrompt as string;
    }

    return `${text.bidLabel}: ${bid} · ${text.tricks}: ${tricksOf(state, playerId)}`;
  },

  seatStatus(state, context, playerId) {
    const bid = bidOf(state, playerId);

    if (bid < 0) {
      return words(context).waiting as string;
    }

    return `${tricksOf(state, playerId)}/${bid}`;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.table.turnOrder.map((playerId) => {
      const bid = bidOf(state, playerId);
      const tricks = tricksOf(state, playerId);
      const delta = bid === tricks ? 20 + 10 * tricks : -10 * Math.abs(bid - tricks);

      return { playerId, delta, reason: "Wizard" };
    });
  }
};
