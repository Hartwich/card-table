import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { advanceTurn, drawCards, handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type {
  CardTableActionState,
  CardTableChoiceState,
  CardTableRuleSectionState
} from "../protocol.js";
import { bestOf } from "../bots/tactics.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  readNumber,
  withError,
  writeExtra,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Fischen.
 *
 * Du wählst eine deiner Karten und fragst einen Mitspieler nach diesem Wert.
 * Hat er welche, muss er alle abgeben und du bist noch einmal dran; hat er
 * keine, fischst du eine Karte aus dem Stapel. Vier gleiche Werte legst du als
 * Quartett ab.
 *
 * Zeigt auf dem Fundament, wie eine Karte eine gezielte Frage an eine bestimmte
 * Person auslöst.
 */

const setsKey = (playerId: string): string => `sets:${playerId}`;

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Fischen: Frag einen Mitspieler nach einem Wert, den du selbst auf der Hand hast.",
    fish: "Fischen",
    askWho: "Wen fragst du?",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    needTarget: "Wähle einen Mitspieler.",
    emptyPile: "Der Stapel ist leer.",
    handNotEmpty: "Frag zuerst - gefischt wird nur mit leerer Hand.",
    asks: "fragt",
    for: "nach",
    hands: "gibt",
    cardsOver: "Karten ab",
    goFish: "geht fischen",
    caught: "fischt genau die gesuchte Karte",
    set: "legt ein Quartett ab",
    sets: "Quartette",
    winner: "hat die meisten Quartette.",
    end: "Runde beenden",
    ended: "Der Host hat die Runde beendet."
  },
  en: {
    intro: "Go Fish: ask another player for a rank you hold yourself.",
    fish: "Go fish",
    askWho: "Who do you ask?",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    needTarget: "Choose a player.",
    emptyPile: "The pile is empty.",
    handNotEmpty: "Ask first - fishing is only for an empty hand.",
    asks: "asks",
    for: "for",
    hands: "hands over",
    cardsOver: "cards",
    goFish: "goes fishing",
    caught: "fishes exactly the card asked for",
    set: "completes a set",
    sets: "sets",
    winner: "has the most sets.",
    end: "End round",
    ended: "The host ended the round."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function setsOf(state: CardGameState, playerId: string): number {
  return readNumber(state, setsKey(playerId));
}

/** Legt vollständige Quartette ab und zählt sie. */
function discardSets(state: CardGameState, playerId: string): { state: CardGameState; sets: number } {
  let table = state.table;
  let sets = 0;
  let found = true;

  while (found) {
    found = false;
    const byRank = new Map<string, string[]>();

    for (const cardId of handOf(table, playerId)) {
      const card = table.cards[cardId];

      if (!card) {
        continue;
      }

      const bucket = byRank.get(card.rankId) ?? [];
      bucket.push(cardId);
      byRank.set(card.rankId, bucket);
    }

    for (const bucket of byRank.values()) {
      if (bucket.length >= 4) {
        for (const cardId of bucket.slice(0, 4)) {
          table = moveCard(table, cardId, { kind: "discard" }, "top");
        }

        sets += 1;
        found = true;
        break;
      }
    }
  }

  const next = sets > 0
    ? writeExtra({ ...state, table }, { [setsKey(playerId)]: setsOf(state, playerId) + sets })
    : { ...state, table };

  return { state: next, sets };
}

function opponentsWithCards(state: CardGameState, playerId: string): string[] {
  return state.table.turnOrder.filter(
    (entry) => entry !== playerId && handOf(state.table, entry).length > 0
  );
}

/** Endet die Runde, wenn niemand mehr fragen oder fischen kann. */
function checkEnd(state: CardGameState, context: CardRulesetContext): CardGameState | null {
  const text = words(context);
  const holders = state.table.turnOrder.filter(
    (playerId) => handOf(state.table, playerId).length > 0
  ).length;
  const cardsLeft =
    state.table.drawPile.length +
    state.table.turnOrder.reduce((sum, playerId) => sum + handOf(state.table, playerId).length, 0);

  // Vorbei ist es, wenn nichts mehr da ist - oder niemand mehr gefragt werden kann.
  if (cardsLeft > 0 && !(state.table.drawPile.length === 0 && holders <= 1)) {
    return null;
  }

  const best = state.table.turnOrder.reduce(
    (leader, playerId) => (setsOf(state, playerId) > setsOf(state, leader) ? playerId : leader),
    state.table.turnOrder[0] ?? ""
  );

  return finishGame(
    state,
    best || null,
    best ? playerName(context, best) : null,
    best ? `${playerName(context, best)} ${text.winner}` : (text.ended as string)
  );
}

/** Gibt ab, wenn die Frage ins Leere ging. */
function passTurn(state: CardGameState, context: CardRulesetContext): CardGameState {
  return {
    ...state,
    table: advanceTurn(state.table),
    turnNumber: state.turnNumber + 1,
    updatedAt: context.now
  };
}

export const fischenRuleset: CardRuleset = {
  id: "fischen",
  label: { de: "Fischen", en: "Go Fish" },
  defaultDeckId: "french-52",
  allowedDeckIds: ["french-52", "skat-32"],
  defaultHandSize: 5,
  openStartCard: false,
  turnBased: true,

  setupRound(state) {
    const counters: Record<string, number> = {};

    for (const playerId of state.table.turnOrder) {
      counters[setsKey(playerId)] = 0;
    }

    let working: CardGameState = { ...state, extra: { ...state.extra, ...counters } };

    for (const playerId of working.table.turnOrder) {
      working = discardSets(working, playerId).state;
    }

    return working;
  },

  rules(context): CardTableRuleSectionState[] {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: ["Collect sets of four cards of the same rank. Most sets wins the round."]
          },
          {
            title: "Your turn",
            lines: [
              "Pick a card from your hand and choose a player to ask for that rank.",
              "You can only ask for a rank you already hold.",
              "Has that player any, they hand over every single one — and you go again."
            ]
          },
          {
            title: "Go fish",
            lines: [
              "Has the player none, you draw one card from the pile.",
              "Is it exactly the rank you asked for, you go again. Otherwise the turn passes.",
              "With an empty hand you simply draw a card, as long as the pile has any."
            ]
          },
          {
            title: "Sets",
            lines: [
              "Four cards of a rank are discarded automatically and counted as a set.",
              "The round ends when no cards are left anywhere."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: ["Sammle Quartette — vier Karten desselben Werts. Wer die meisten hat, gewinnt die Runde."]
          },
          {
            title: "Dein Zug",
            lines: [
              "Wähle eine Karte von deiner Hand und dann den Mitspieler, den du nach diesem Wert fragst.",
              "Fragen darfst du nur nach Werten, die du selbst hast.",
              "Hat er welche, muss er alle abgeben — und du bist gleich noch einmal dran."
            ]
          },
          {
            title: "Fischen",
            lines: [
              "Hat er keine, ziehst du eine Karte vom Stapel.",
              "Ist es genau der gefragte Wert, bist du noch einmal dran. Sonst ist der Nächste dran.",
              "Mit leerer Hand ziehst du einfach eine Karte, solange der Stapel noch welche hat."
            ]
          },
          {
            title: "Quartette",
            lines: [
              "Vier gleiche Werte wandern automatisch auf die Ablage und zählen als Quartett.",
              "Die Runde endet, wenn nirgends mehr Karten liegen."
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

    return opponentsWithCards(state, playerId).length > 0
      ? { allowed: true }
      : { allowed: false, hint: text.emptyPile as string };
  },

  playCard(state, context, playerId, cardId, choiceId) {
    const text = words(context);
    const check = fischenRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    if (!choiceId || !opponentsWithCards(state, playerId).includes(choiceId)) {
      return withError(state, text.needTarget as string);
    }

    const card = state.table.cards[cardId] as CardInstance;
    const face = toCardFace(context.deck, card);
    const matches = handOf(state.table, choiceId).filter(
      (entry) => state.table.cards[entry]?.rankId === card.rankId
    );

    let next = appendLog(
      clearError({ ...state, turnNumber: state.turnNumber + 1, updatedAt: context.now }),
      playerName(context, playerId),
      `${text.asks} ${playerName(context, choiceId)} ${text.for} ${face.rankLabel}`
    );

    if (matches.length > 0) {
      let table = next.table;

      for (const entry of matches) {
        table = moveCard(table, entry, { kind: "hand", playerId }, "bottom");
      }

      next = appendLog(
        { ...next, table },
        playerName(context, choiceId),
        `${text.hands} ${matches.length} ${text.cardsOver}`
      );
    } else if (next.table.drawPile.length === 0) {
      const empty = discardSets(next, playerId);
      return checkEnd(empty.state, context) ?? passTurn(empty.state, context);
    } else {
      const result = drawCards(next.table, playerId, 1);
      const drawnId = result.drawnCardIds[0];
      const drawn = drawnId ? next.table.cards[drawnId] : null;

      next = appendLog(
        { ...next, table: result.state },
        playerName(context, playerId),
        text.goFish as string
      );

      if (!drawn || drawn.rankId !== card.rankId) {
        const sets = discardSets(next, playerId);
        return checkEnd(sets.state, context) ?? passTurn(sets.state, context);
      }

      next = appendLog(next, playerName(context, playerId), text.caught as string);
    }

    const collected = discardSets(next, playerId);
    next = collected.state;

    if (collected.sets > 0) {
      next = appendLog(next, playerName(context, playerId), text.set as string);
    }

    return checkEnd(next, context) ?? next;
  },

  drawCard(state, context, playerId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    // Fischen geht mit leerer Hand - oder wenn es niemanden mehr zu fragen gibt.
    if (handOf(state.table, playerId).length > 0 && opponentsWithCards(state, playerId).length > 0) {
      return withError(state, text.handNotEmpty as string);
    }

    if (state.table.drawPile.length === 0) {
      const ended = checkEnd(state, context);
      return ended ?? passTurn(clearError(state), context);
    }

    const result = drawCards(state.table, playerId, 1);
    const drawn = discardSets({ ...clearError(state), table: result.state }, playerId);

    return appendLog(drawn.state, playerName(context, playerId), text.goFish as string);
  },

  runAction(state, context, playerId, actionId) {
    return actionId === "fish" ? fischenRuleset.drawCard(state, context, playerId) : state;
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const active = isActive(state, playerId) && state.phase === "playing" && !state.gameOver;

    return [
      {
        id: "fish",
        label: words(context).fish as string,
        kind: "primary",
        enabled:
          active &&
          (handOf(state.table, playerId).length === 0 ||
            opponentsWithCards(state, playerId).length === 0)
      }
    ];
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
    return actionId === "end"
      ? finishGame(state, null, null, words(context).ended as string)
      : state;
  },

  choiceForCard(state, context): CardTableChoiceState | undefined {
    const active = state.table.turnOrder[state.table.activeIndex];

    if (!active) {
      return undefined;
    }

    const options = opponentsWithCards(state, active).map((playerId) => ({
      id: playerId,
      label: playerName(context, playerId),
      symbol: `${handOf(state.table, playerId).length}`
    }));

    return options.length > 0
      ? { id: "ask-target", label: words(context).askWho as string, options }
      : undefined;
  },

  condition() {
    return undefined;
  },

  privateNote(state, context, playerId) {
    return `${words(context).sets}: ${setsOf(state, playerId)}`;
  },

  seatStatus(state, context, playerId) {
    const sets = setsOf(state, playerId);
    return sets > 0 ? `${sets} ${words(context).sets}` : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    const best = state.table.turnOrder.reduce(
      (top, playerId) => Math.max(top, setsOf(state, playerId)),
      0
    );

    return best === 0
      ? []
      : state.table.turnOrder
          .filter((playerId) => setsOf(state, playerId) === best)
          .map((playerId) => ({ playerId, delta: 1, reason: "Fischen" }));
  },

  /**
   * KI-Zug.
   *
   * Gefragt wird nach dem Wert, von dem der Bot selbst am meisten hat - drei
   * gleiche machen aus einer Antwort sofort einen Satz. Gefragt wird der
   * Mitspieler mit den meisten Karten, weil er am ehesten liefert. Ohne
   * Handkarten oder ohne Gegenüber bleibt nur fischen.
   */
  botMove(state, _context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const hand = handOf(state.table, playerId);
    const opponents = opponentsWithCards(state, playerId);

    if (hand.length === 0 || opponents.length === 0) {
      return { kind: "draw" };
    }

    const counts = new Map<string, number>();

    for (const cardId of hand) {
      const rankId = state.table.cards[cardId]?.rankId;

      if (rankId) {
        counts.set(rankId, (counts.get(rankId) ?? 0) + 1);
      }
    }

    const cardId = bestOf(hand, (entry) => counts.get(state.table.cards[entry]?.rankId ?? "") ?? 0);
    const target = bestOf(opponents, (entry) => handOf(state.table, entry).length);

    if (!cardId || !target) {
      return { kind: "draw" };
    }

    return { kind: "play", cardId, choiceId: target };
  }
};
