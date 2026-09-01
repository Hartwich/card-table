import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableStackState } from "../protocol.js";
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
 * Stichwette.
 *
 * Ein Stichspiel mit Ansage: In Runde 1 bekommt jeder eine Karte, in Runde 2
 * zwei und so weiter. Erst sagt reihum jeder seine Stichzahl an, dann wird
 * gespielt. Wer genau trifft, bekommt 20 Punkte plus 10 je Stich, sonst 10
 * Minuspunkte je Stich Abweichung. Neben den vier Farben liegen vier Kronen
 * (stechen alles) und vier Federn (verlieren immer) im Blatt.
 *
 * Zeigt auf dem Fundament, wie ein Regelwerk mehrere Phasen, einen Stich als
 * eigene Tischzone und eine echte Punktewertung unterbringt.
 */

const trickZoneId = "stich";
const trumpZoneId = "trumpf";
const wonZoneId = "abgelegt";
const lastTrickZoneId = "letzter-stich";
const lastTrickWinnerKey = "lastTrickWinner";
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
const crownLead = "*";

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Stichwette: Erst Stiche ansagen, dann spielen. Die Krone sticht alles, die Feder nichts.",
    bidPrompt: "Sag deine Stiche an.",
    bidLabel: "Ansage",
    tricks: "Stiche",
    trump: "Trumpf",
    noTrump: "Ohne Trumpf",
    bidding: "Ansagen",
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
    lastTrick: "Letzter Stich",
    waiting: "wartet"
  },
  en: {
    intro: "Trick Bets: bid your tricks first, then play. A crown beats everything, a feather nothing.",
    bidPrompt: "Bid your tricks.",
    bidLabel: "Bid",
    tricks: "Tricks",
    trump: "Trump",
    noTrump: "No trump",
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
    lastTrick: "Last trick",
    waiting: "waiting"
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function isCrownCard(card: CardInstance): boolean {
  return card.rankId === "crown";
}

function isFeatherCard(card: CardInstance): boolean {
  return card.rankId === "feather";
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

  const crownIndex = cards.findIndex((card) => card && isCrownCard(card));

  if (crownIndex >= 0) {
    return owners[crownIndex] as string;
  }

  let bestIndex = -1;
  let bestScore = -1;

  cards.forEach((card, index) => {
    if (!card || isFeatherCard(card)) {
      return;
    }

    const followsTrump = Boolean(trumpSuitId) && card.suitId === trumpSuitId;
    const leadSuitId = cards.find((entry) => entry && !isFeatherCard(entry))?.suitId ?? null;
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

export const trickBetRuleset: CardRuleset = {
  id: "stichwette",
  label: { de: "Stichwette", en: "Trick Bets" },
  defaultDeckId: "stichwette-60",
  fixedDeckId: "stichwette-60",
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

    if (trumpCard && !isFeatherCard(trumpCard)) {
      trumpSuitId = isCrownCard(trumpCard)
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
          [lastTrickZoneId]: [],
          [trumpZoneId]: trumpCardId ? [trumpCardId] : [],
          [wonZoneId]: []
        }
      },
      extra: { ...state.extra, ...counters }
    };
  },

  rules(context) {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: [
              "Take exactly as many tricks as you announced beforehand.",
              "Hitting the bid scores; being off costs points — too many tricks hurt as much as too few."
            ]
          },
          {
            title: "The deck",
            lines: [
              "52 cards in four suits, plus four crowns and four feathers.",
              "A crown beats every other card. A feather always loses."
            ]
          },
          {
            title: "A deal",
            lines: [
              "Round 1 deals one card each, round 2 two, and so on.",
              "One card of the remaining pile is turned over: its suit is trump.",
              "A feather there means no trump; a crown picks a random trump suit."
            ]
          },
          {
            title: "Bidding",
            lines: [
              "In turn everyone announces how many tricks they will take, from zero up to the number of cards.",
              "Bids are public and binding. Play starts once everyone has bid."
            ]
          },
          {
            title: "Playing a trick",
            lines: [
              "The leader plays any card. Everyone else must follow the suit that was led if they hold it.",
              "Crowns and feathers may always be played, whatever you hold.",
              "If a feather leads, the first suited card after it sets the suit to follow.",
              "If a crown leads, nobody has to follow anything."
            ]
          },
          {
            title: "Who wins the trick",
            lines: [
              "The first crown played wins immediately.",
              "Otherwise the highest trump wins.",
              "Without a trump, the highest card of the suit led wins.",
              "Feathers never win — unless everybody plays one, then the first feather takes it.",
              "The winner leads the next trick."
            ]
          },
          {
            title: "Scoring",
            lines: [
              "Bid matched: 20 points plus 10 per trick taken.",
              "Bid missed: 10 points off for every trick of difference.",
              "The deal ends after the last card; points carry on in the scoreboard."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: [
              "Hole genau so viele Stiche, wie du vorher angesagt hast.",
              "Treffer geben Punkte, Abweichungen kosten — zu viele Stiche schaden genauso wie zu wenige."
            ]
          },
          {
            title: "Das Blatt",
            lines: [
              "52 Karten in vier Farben, dazu vier Kronen und vier Federn.",
              "Die Krone sticht jede andere Karte. Die Feder verliert immer."
            ]
          },
          {
            title: "Der Durchgang",
            lines: [
              "In Runde 1 bekommt jeder eine Karte, in Runde 2 zwei, und so weiter.",
              "Eine Karte des Reststapels wird aufgedeckt: ihre Farbe ist Trumpf.",
              "Liegt dort eine Feder, gibt es keinen Trumpf; bei einer Krone wird eine Farbe zufällig bestimmt."
            ]
          },
          {
            title: "Ansagen",
            lines: [
              "Reihum sagt jeder, wie viele Stiche er holen wird — von null bis zur Kartenzahl der Runde.",
              "Die Ansage ist offen und verbindlich. Gespielt wird erst, wenn alle angesagt haben."
            ]
          },
          {
            title: "Einen Stich spielen",
            lines: [
              "Wer eröffnet, legt eine beliebige Karte. Alle anderen müssen die angespielte Farbe bedienen, wenn sie sie haben.",
              "Krone und Feder dürfen immer gelegt werden, egal was du sonst auf der Hand hast.",
              "Eröffnet eine Feder, bestimmt die erste Farbkarte danach, was bedient werden muss.",
              "Eröffnet eine Krone, muss niemand bedienen."
            ]
          },
          {
            title: "Wer den Stich gewinnt",
            lines: [
              "Die zuerst gelegte Krone gewinnt sofort.",
              "Sonst gewinnt der höchste Trumpf.",
              "Ohne Trumpf gewinnt die höchste Karte der angespielten Farbe.",
              "Federn gewinnen nie — nur wenn alle eine legen, bekommt die erste Feder den Stich.",
              "Wer den Stich holt, eröffnet den nächsten."
            ]
          },
          {
            title: "Wertung",
            lines: [
              "Ansage getroffen: 20 Punkte plus 10 je geholtem Stich.",
              "Ansage verfehlt: 10 Minuspunkte je Stich Abweichung.",
              "Nach der letzten Karte ist der Durchgang vorbei; die Punkte laufen im Scoreboard weiter."
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

    if (leadSuitId === noLead || leadSuitId === crownLead || isCrownCard(card) || isFeatherCard(card)) {
      return { allowed: true };
    }

    if (card.suitId === leadSuitId) {
      return { allowed: true };
    }

    const canFollow = handOf(state.table, playerId).some((entry) => {
      const handCard = state.table.cards[entry];
      return handCard && !isCrownCard(handCard) && !isFeatherCard(handCard) && handCard.suitId === leadSuitId;
    });

    return canFollow ? { allowed: false, hint: text.mustFollow as string } : { allowed: true };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = trickBetRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    const card = state.table.cards[cardId] as CardInstance;
    const face = toCardFace(context.deck, card);
    const wasEmpty = trickCardIds(state).length === 0;
    const table = moveCard(state.table, cardId, { kind: "zone", zoneId: trickZoneId }, "bottom");
    let leadSuitId = readText(state, leadKey) ?? noLead;

    if (leadSuitId === noLead) {
      leadSuitId = isCrownCard(card) ? crownLead : isFeatherCard(card) ? noLead : card.suitId ?? noLead;
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

    // Der vorige Stich hat lange genug offen gelegen - er wandert jetzt ins
    // Archiv, damit der gerade fertige seinen Platz bekommt.
    for (const archivedId of [...(cleared.zones[lastTrickZoneId] ?? [])]) {
      cleared = moveCard(cleared, archivedId, { kind: "zone", zoneId: wonZoneId }, "bottom");
    }

    // Der fertige Stich bleibt sichtbar liegen, bis der nächste komplett ist.
    // Sonst wäre er in derselben Sekunde weg, in der die letzte Karte fällt.
    for (const trickCardId of played) {
      cleared = moveCard(cleared, trickCardId, { kind: "zone", zoneId: lastTrickZoneId }, "bottom");
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
          [lastTrickWinnerKey]: winnerId,
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
    const stacks: CardTableStackState[] = [
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
        faceDown: false,
        layout: "spread"
      }
    ];

    const lastCards = (state.table.zones[lastTrickZoneId] ?? [])
      .map((cardId) => state.table.cards[cardId])
      .filter((card): card is CardInstance => Boolean(card))
      .map((card) => toCardFace(context.deck, card));

    // Der zuletzt gewonnene Stich bleibt offen liegen, mit dem Namen dessen,
    // der ihn bekommen hat - sonst wäre nie zu sehen, was gerade passiert ist.
    if (lastCards.length > 0) {
      const lastWinnerId = readText(state, lastTrickWinnerKey);

      stacks.push({
        id: lastTrickZoneId,
        label: lastWinnerId
          ? `${text.lastTrick} · ${playerName(context, lastWinnerId)}`
          : (text.lastTrick as string),
        kind: "zone",
        count: lastCards.length,
        cards: lastCards,
        faceDown: false,
        layout: "spread"
      });
    }

    return stacks;
  },

  condition(state, context) {
    const text = words(context);
    const trumpSuitId = readText(state, trumpKey);
    const suit = context.deck.suits.find((entry) => entry.id === trumpSuitId);

    // Kurz halten: Das Symbol trägt die Farbe, der Text nur die Lage.
    return {
      label: isBidding(state)
        ? (text.bidding as string)
        : suit
          ? (text.trump as string)
          : (text.noTrump as string),
      symbol: suit?.symbol ?? "–",
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

      return { playerId, delta, reason: "Stichwette" };
    });
  },

  /**
   * KI-Zug.
   *
   * Zwei Aufgaben, zwei Denkweisen. Beim Ansagen schätzt der Bot seine Hand:
   * Kronen sind sichere Stiche, hohe Trümpfe fast sichere, Federn keine. Beim
   * Spielen zählt nur noch die Differenz zur Ansage - wer noch Stiche braucht,
   * nimmt so billig wie möglich; wer genug hat, wirft hoch ab und lässt den
   * Stich ziehen.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const hand = handOf(state.table, playerId);

    if (isBidding(state)) {
      const dealSize = readNumber(state, dealSizeKey, state.handSize);

      return { kind: "action", actionId: `bid:${estimateTricks(state, context, hand, dealSize)}` };
    }

    const playable = hand.filter(
      (cardId) => trickBetRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    if (playable.length === 0) {
      return { kind: "wait" };
    }

    const needsTricks = bidOf(state, playerId) - tricksOf(state, playerId) > 0;
    const winners = playable.filter((cardId) => wouldTakeTrick(state, context, playerId, cardId));
    const losers = playable.filter((cardId) => !winners.includes(cardId));
    const strength = (cardId: string): number => {
      const card = state.table.cards[cardId];

      if (!card) {
        return 0;
      }

      if (isCrownCard(card)) {
        return 1_000;
      }

      if (isFeatherCard(card)) {
        return -1_000;
      }

      const trumpSuitId = readText(state, trumpKey);

      return rankOrder(context, card) + (trumpSuitId && card.suitId === trumpSuitId ? 100 : 0);
    };

    if (needsTricks) {
      // So billig wie möglich gewinnen, sonst die schwächste Karte opfern.
      const cheapestWinner = bestOf(winners, (cardId) => -strength(cardId));
      const weakest = bestOf(playable, (cardId) => -strength(cardId));

      return { kind: "play", cardId: cheapestWinner ?? (weakest as string) };
    }

    // Genug Stiche: hoch abwerfen, aber nicht gewinnen.
    const highestLoser = bestOf(losers, (cardId) => strength(cardId));
    const cheapestWinner = bestOf(winners, (cardId) => -strength(cardId));

    return { kind: "play", cardId: highestLoser ?? (cheapestWinner as string) };
  }
};

/**
 * Schätzt, wie viele Stiche eine Hand trägt. Bewusst grob - die Wertung
 * bestraft Übertreiben stärker als Untertreiben, also rundet der Bot ab.
 */
function estimateTricks(
  state: CardGameState,
  context: CardRulesetContext,
  hand: string[],
  dealSize: number
): number {
  const trumpSuitId = readText(state, trumpKey);
  let strength = 0;

  for (const cardId of hand) {
    const card = state.table.cards[cardId];

    if (!card) {
      continue;
    }

    if (isCrownCard(card)) {
      strength += 1;
      continue;
    }

    if (isFeatherCard(card)) {
      continue;
    }

    const order = rankOrder(context, card);
    const trump = Boolean(trumpSuitId) && card.suitId === trumpSuitId;

    if (trump) {
      strength += order >= 12 ? 0.9 : order >= 10 ? 0.55 : 0.25;
    } else {
      strength += order >= 14 ? 0.75 : order === 13 ? 0.4 : 0.08;
    }
  }

  return Math.max(0, Math.min(dealSize, Math.floor(strength)));
}

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
