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
  readSetting,
  readText,
  withError,
  writeExtra,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Doppelkopf.
 *
 * Jede Karte liegt doppelt im Blatt. Trumpf sind alle Karo, alle Damen, alle
 * Buben und die Herz-Zehn; alles andere ist Fehl. Die beiden Kreuz-Damen bilden
 * unerkannt die Re-Partei gegen den Rest - gewonnen hat, wer mehr als die Hälfte
 * der Augen einsammelt.
 *
 * Umgesetzt ist das normale Spiel ohne Ansagen, Solo und Hochzeit.
 */

const trickZoneId = "stich";
const wonZoneId = "abgelegt";
const lastTrickZoneId = "letzter-stich";
const lastTrickWinnerKey = "lastTrickWinner";

/**
 * Augen laufend zeigen oder erst am Ende auszählen.
 *
 * Am echten Tisch rechnet niemand laut mit; die Option "end" bildet das ab und
 * hält Stand, Stichwerte und den eigenen Zwischenstand bis zur Abrechnung
 * zurück. Gezählt wird intern natürlich trotzdem.
 */
const scoringSettingKey = "cardTableDoppelkopfScoring";

function countsLive(context: CardRulesetContext): boolean {
  return readSetting(context, scoringSettingKey, "live") !== "end";
}
const leadKey = "leadKind";
const trickLeaderKey = "trickLeaderIndex";
const trickCountKey = "trickCount";
const halfKey = "halfPoints";
const pointsKey = (playerId: string): string => `pts:${playerId}`;

const noLead = "";
const trumpLead = "*";

const suitOrder: Record<string, number> = { clubs: 4, spades: 3, hearts: 2, diamonds: 1 };
const cardPoints: Record<string, number> = { ace: 11, "10": 10, king: 4, queen: 3, jack: 2, "9": 0 };
const fehlOrder: Record<string, number> = { ace: 4, "10": 3, king: 2, "9": 1 };

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Doppelkopf: Karo, Damen, Buben und die Herz-Zehn sind Trumpf.",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    mustTrump: "Du musst Trumpf bedienen.",
    mustFollow: "Du musst Farbe bedienen.",
    plays: "legt",
    takesTrick: "nimmt den Stich",
    eyes: "Augen",
    re: "Re",
    kontra: "Kontra",
    reWins: "Re gewinnt mit",
    kontraWins: "Kontra gewinnt mit",
    youAre: "Du spielst",
    trick: "Stich",
    lastTrick: "Letzter Stich",
    countedLater: "Augen werden am Ende gezählt",
    end: "Runde beenden",
    ended: "Der Host hat die Runde beendet."
  },
  en: {
    intro: "Doppelkopf: diamonds, queens, jacks and the ten of hearts are trump.",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    mustTrump: "You have to follow trump.",
    mustFollow: "You have to follow suit.",
    plays: "plays",
    takesTrick: "takes the trick",
    eyes: "points",
    re: "Re",
    kontra: "Kontra",
    reWins: "Re wins with",
    kontraWins: "Kontra wins with",
    youAre: "You play",
    trick: "Trick",
    lastTrick: "Last trick",
    countedLater: "eyes are counted at the end",
    end: "End round",
    ended: "The host ended the round."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

export function isDoppelkopfTrump(card: CardInstance): boolean {
  return (
    card.suitId === "diamonds" ||
    card.rankId === "queen" ||
    card.rankId === "jack" ||
    (card.suitId === "hearts" && card.rankId === "10")
  );
}

/** Rangwert innerhalb des Trumpfs: Dulle, Damen, Buben, dann Karo. */
function trumpValue(card: CardInstance): number {
  if (card.suitId === "hearts" && card.rankId === "10") {
    return 100;
  }

  if (card.rankId === "queen") {
    return 90 + (suitOrder[card.suitId ?? ""] ?? 0);
  }

  if (card.rankId === "jack") {
    return 80 + (suitOrder[card.suitId ?? ""] ?? 0);
  }

  return 70 + (fehlOrder[card.rankId] ?? 0);
}

function cardValue(card: CardInstance): number {
  return cardPoints[card.rankId] ?? 0;
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function trickCardIds(state: CardGameState): string[] {
  return state.table.zones[trickZoneId] ?? [];
}

function pointsOf(state: CardGameState, playerId: string): number {
  return readNumber(state, pointsKey(playerId));
}

/** Re ist, wer eine Kreuz-Dame hält. */
function isRe(state: CardGameState, playerId: string): boolean {
  return handOf(state.table, playerId).some((cardId) => {
    const card = state.table.cards[cardId];
    return card?.suitId === "clubs" && card.rankId === "queen";
  });
}

/** Die Parteien stehen mit dem Austeilen fest, auch wenn die Damen längst liegen. */
function partyKey(playerId: string): string {
  return `party:${playerId}`;
}

function isReParty(state: CardGameState, playerId: string): boolean {
  return state.extra[partyKey(playerId)] === true;
}

function leadKind(state: CardGameState): string {
  return readText(state, leadKey) ?? noLead;
}

/** Trumpf schlägt Fehl, sonst gewinnt die höchste Karte der angespielten Farbe. */
function trickWinner(state: CardGameState): string {
  const cardIds = trickCardIds(state);
  const order = state.table.turnOrder;
  const leaderIndex = readNumber(state, trickLeaderKey);
  const lead = leadKind(state);
  let bestIndex = 0;
  let bestScore = -1;

  cardIds.forEach((cardId, index) => {
    const card = state.table.cards[cardId];

    if (!card) {
      return;
    }

    const trump = isDoppelkopfTrump(card);
    const follows = lead === trumpLead ? trump : !trump && card.suitId === lead;

    if (!trump && !follows) {
      return;
    }

    // Trumpf sticht jede Fehlfarbe; gleiche Karten entscheidet die erste.
    const score = trump ? 1000 + trumpValue(card) : fehlOrder[card.rankId] ?? 0;

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
  const rePoints = seats
    .filter((playerId) => isReParty(state, playerId))
    .reduce((sum, playerId) => sum + pointsOf(state, playerId), 0);
  const kontraPoints = seats
    .filter((playerId) => !isReParty(state, playerId))
    .reduce((sum, playerId) => sum + pointsOf(state, playerId), 0);
  const half = readNumber(state, halfKey);
  const reWon = rePoints > half;
  let next = state;

  for (const playerId of seats) {
    next = appendLog(
      next,
      playerName(context, playerId),
      `${isReParty(next, playerId) ? text.re : text.kontra} · ${pointsOf(next, playerId)} ${text.eyes}`
    );
  }

  const winnerName = reWon ? (text.re as string) : (text.kontra as string);

  return finishGame(
    next,
    null,
    null,
    `${reWon ? text.reWins : text.kontraWins} ${reWon ? rePoints : kontraPoints} ${text.eyes} (${winnerName})`
  );
}

export const doppelkopfRuleset: CardRuleset = {
  id: "doppelkopf",
  label: { de: "Doppelkopf", en: "Doppelkopf" },
  defaultDeckId: "doppelkopf-48",
  fixedDeckId: "doppelkopf-48",
  defaultHandSize: 12,
  /** Doppelkopf ist ein Spiel zu viert. */
  minSeats: 4,
  openStartCard: false,
  turnBased: true,

  handSizeFor({ playerCount }) {
    return Math.max(1, Math.floor(48 / Math.max(1, playerCount)));
  },

  setupRound(state) {
    const counters: Record<string, number | string | boolean | null> = {
      [leadKey]: noLead,
      [trickLeaderKey]: 0,
      [trickCountKey]: 0
    };
    let dealtPoints = 0;

    for (const playerId of state.table.turnOrder) {
      counters[pointsKey(playerId)] = 0;
      counters[partyKey(playerId)] = isRe(state, playerId);

      for (const cardId of handOf(state.table, playerId)) {
        const card = state.table.cards[cardId];
        dealtPoints += card ? cardValue(card) : 0;
      }
    }

    counters[halfKey] = Math.floor(dealtPoints / 2);

    return {
      ...state,
      table: {
        ...state.table,
        zones: { ...state.table.zones, [trickZoneId]: [], [lastTrickZoneId]: [], [wonZoneId]: [] }
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
              "Two hidden parties play against each other: whoever holds a queen of clubs is Re, everyone else is Kontra.",
              "The party that collects more than half of all points wins the round."
            ]
          },
          {
            title: "The deck",
            lines: [
              "Nine to ace in four suits, every card twice — 48 cards, 240 points in total.",
              "Ace 11, ten 10, king 4, queen 3, jack 2, nine 0."
            ]
          },
          {
            title: "Trump",
            lines: [
              "Trump are all diamonds, all queens, all jacks and the ten of hearts.",
              "From the top: ten of hearts, then the queens clubs–spades–hearts–diamonds,",
              "then the jacks in the same order, then ace, ten, king, nine of diamonds.",
              "Everything else is plain suit: clubs, spades and hearts (without the ten)."
            ]
          },
          {
            title: "Playing a trick",
            lines: [
              "If trump is led, everyone holding trump has to play trump.",
              "If a plain suit is led, that suit has to be followed.",
              "Trump beats every plain card; otherwise the highest card of the suit led wins.",
              "Two identical cards: the one played first wins.",
              "Whoever takes the trick leads the next one."
            ]
          },
          {
            title: "Not included yet",
            lines: [
              "Announcements (Re / Kontra), solos and marriage are not implemented.",
              "The game is meant for four players; with another number the cards are simply split evenly."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: [
              "Zwei verdeckte Parteien spielen gegeneinander: Wer eine Kreuz-Dame hält, ist Re, alle anderen sind Kontra.",
              "Die Partei mit mehr als der Hälfte aller Augen gewinnt die Runde."
            ]
          },
          {
            title: "Das Blatt",
            lines: [
              "Neun bis Ass in vier Farben, jede Karte doppelt — 48 Karten mit zusammen 240 Augen.",
              "Ass 11, Zehn 10, König 4, Dame 3, Bube 2, Neun 0."
            ]
          },
          {
            title: "Trumpf",
            lines: [
              "Trumpf sind alle Karo, alle Damen, alle Buben und die Herz-Zehn.",
              "Von oben: Herz-Zehn, dann die Damen Kreuz–Pik–Herz–Karo,",
              "dann die Buben in derselben Reihenfolge, dann Ass, Zehn, König, Neun in Karo.",
              "Alles andere ist Fehl: Kreuz, Pik und Herz (ohne die Zehn)."
            ]
          },
          {
            title: "Einen Stich spielen",
            lines: [
              "Wird Trumpf angespielt, muss jeder Trumpf legen, der welchen hat.",
              "Wird eine Fehlfarbe angespielt, muss diese Farbe bedient werden.",
              "Trumpf sticht jede Fehlkarte, sonst gewinnt die höchste Karte der angespielten Farbe.",
              "Bei zwei gleichen Karten gewinnt die zuerst gelegte.",
              "Wer den Stich nimmt, spielt den nächsten an."
            ]
          },
          {
            title: "Noch nicht dabei",
            lines: [
              "Ansagen (Re / Kontra), Solospiele und die Hochzeit sind nicht umgesetzt.",
              "Gedacht ist das Spiel für vier Personen; bei anderer Zahl werden die Karten einfach gleichmäßig verteilt."
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

    const lead = leadKind(state);

    if (lead === noLead) {
      return { allowed: true };
    }

    const trump = isDoppelkopfTrump(card);
    const hand = handOf(state.table, playerId);

    if (lead === trumpLead) {
      if (trump) {
        return { allowed: true };
      }

      const hasTrump = hand.some((entry) => {
        const handCard = state.table.cards[entry];
        return handCard ? isDoppelkopfTrump(handCard) : false;
      });

      return hasTrump ? { allowed: false, hint: text.mustTrump as string } : { allowed: true };
    }

    if (!trump && card.suitId === lead) {
      return { allowed: true };
    }

    const canFollow = hand.some((entry) => {
      const handCard = state.table.cards[entry];
      return handCard ? !isDoppelkopfTrump(handCard) && handCard.suitId === lead : false;
    });

    return canFollow ? { allowed: false, hint: text.mustFollow as string } : { allowed: true };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = doppelkopfRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    const card = state.table.cards[cardId] as CardInstance;
    const face = toCardFace(context.deck, card);
    const wasEmpty = trickCardIds(state).length === 0;
    const table = moveCard(state.table, cardId, { kind: "zone", zoneId: trickZoneId }, "bottom");
    const lead = wasEmpty
      ? isDoppelkopfTrump(card)
        ? trumpLead
        : card.suitId ?? noLead
      : leadKind(state);

    let next = appendLog(
      clearError(
        writeExtra({ ...state, table, turnNumber: state.turnNumber + 1, updatedAt: context.now }, {
          [leadKey]: lead,
          [trickLeaderKey]: wasEmpty ? state.table.activeIndex : readNumber(state, trickLeaderKey)
        })
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

    const winnerId = trickWinner(next);
    const winnerIndex = Math.max(0, next.table.turnOrder.indexOf(winnerId));
    const played = trickCardIds(next);
    const eyes = played.reduce((sum, entry) => {
      const trickCard = next.table.cards[entry];
      return sum + (trickCard ? cardValue(trickCard) : 0);
    }, 0);
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
        { ...next, table: { ...cleared, activeIndex: winnerIndex } },
        {
          [pointsKey(winnerId)]: pointsOf(next, winnerId) + eyes,
          [leadKey]: noLead,
          [lastTrickWinnerKey]: winnerId,
          [trickLeaderKey]: winnerIndex,
          [trickCountKey]: trickCount
        }
      ),
      playerName(context, winnerId),
      countsLive(context) ? `${text.takesTrick} (${eyes} ${text.eyes})` : (text.takesTrick as string)
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

    const stacks: CardTableStackState[] = [
      {
        id: trickZoneId,
        label: `${text.trick} ${readNumber(state, trickCountKey) + (cards.length > 0 ? 1 : 0)}`,
        kind: "zone",
        count: cards.length,
        cards,
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

  condition() {
    return undefined;
  },

  privateNote(state, context, playerId) {
    const text = words(context);
    const party = isReParty(state, playerId) ? text.re : text.kontra;
    const tail = countsLive(context)
      ? `${pointsOf(state, playerId)} ${text.eyes}`
      : (text.countedLater as string);

    return `${text.youAre} ${party} · ${tail}`;
  },

  seatStatus(state, context, playerId) {
    const text = words(context);
    // Die Parteien bleiben verdeckt, bis abgerechnet wird - und wer erst am
    // Ende auszählen lässt, sieht bis dahin auch keine Augen.
    if (!state.gameOver) {
      if (!countsLive(context)) {
        return undefined;
      }

      const points = pointsOf(state, playerId);
      return points > 0 ? `${points}` : undefined;
    }

    return `${isReParty(state, playerId) ? text.re : text.kontra} · ${pointsOf(state, playerId)}`;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    const seats = state.table.turnOrder;
    const rePoints = seats
      .filter((playerId) => isReParty(state, playerId))
      .reduce((sum, playerId) => sum + pointsOf(state, playerId), 0);
    const reWon = rePoints > readNumber(state, halfKey);

    return seats
      .filter((playerId) => isReParty(state, playerId) === reWon)
      .map((playerId) => ({ playerId, delta: 1, reason: "Doppelkopf" }));
  },

  /**
   * KI-Zug.
   *
   * Der Bot schaut ausdrücklich nicht in die Parteien der anderen - er weiß nur
   * das, was am Tisch liegt. Daraus folgt eine schlichte, aber tragfähige
   * Haltung: Trumpf ist Kapital. Er zieht Trumpf, wenn er lang ist, sticht nur
   * fette Stiche und dann so billig wie möglich, und wirft ansonsten die
   * augenärmste Karte weg, damit ein fremder Stich wenigstens leer bleibt.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const playable = handOf(state.table, playerId).filter(
      (cardId) => doppelkopfRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    if (playable.length === 0) {
      return { kind: "wait" };
    }

    const cardOf = (cardId: string): CardInstance | null => state.table.cards[cardId] ?? null;
    const rank = (cardId: string): number => {
      const card = cardOf(cardId);

      if (!card) {
        return 0;
      }

      return isDoppelkopfTrump(card) ? 1_000 + trumpValue(card) : fehlOrder[card.rankId] ?? 0;
    };
    const augen = (cardId: string): number => {
      const card = cardOf(cardId);
      return card ? cardValue(card) : 0;
    };

    const trick = trickCardIds(state);

    if (trick.length === 0) {
      const trumpCards = playable.filter((cardId) => {
        const card = cardOf(cardId);
        return card ? isDoppelkopfTrump(card) : false;
      });

      // Lange Trumpfhand: ziehen, solange die Gegner noch bedienen müssen.
      if (trumpCards.length >= 5) {
        return { kind: "play", cardId: bestOf(trumpCards, rank) as string };
      }

      const fehl = playable.filter((cardId) => !trumpCards.includes(cardId));
      const lead = fehl.length > 0 ? fehl : playable;

      return { kind: "play", cardId: bestOf(lead, (cardId) => -augen(cardId) - rank(cardId) / 1_000) as string };
    }

    const pot = trick.reduce((sum, cardId) => sum + augen(cardId), 0);
    const winners = playable.filter((cardId) => wouldTakeTrick(state, playerId, cardId));

    // Ein fetter Stich ist einen Trumpf wert - ein leerer nicht.
    if (pot >= 10 && winners.length > 0) {
      return { kind: "play", cardId: bestOf(winners, (cardId) => -rank(cardId)) as string };
    }

    const losers = playable.filter((cardId) => !winners.includes(cardId));
    const dump = losers.length > 0 ? losers : playable;

    return { kind: "play", cardId: bestOf(dump, (cardId) => -augen(cardId) - rank(cardId) / 1_000) as string };
  }
};

/** Würde diese Karte den Stich im Moment anführen? */
function wouldTakeTrick(state: CardGameState, playerId: string, cardId: string): boolean {
  const simulated: CardGameState = {
    ...state,
    table: {
      ...state.table,
      zones: { ...state.table.zones, [trickZoneId]: [...trickCardIds(state), cardId] }
    }
  };

  return trickWinner(simulated) === playerId;
}
