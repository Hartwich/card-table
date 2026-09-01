import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableRuleSectionState } from "../protocol.js";
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
 * Schwarzer Peter.
 *
 * Alle Karten werden verteilt, Paare wandern sofort auf den Ablagestapel.
 * Danach zieht reihum jeder eine verdeckte Karte beim nächsten Mitspieler.
 * Am Ende bleibt genau eine Karte übrig - wer sie hält, hat verloren.
 *
 * Zeigt auf dem Fundament, dass Karten auch direkt von Hand zu Hand wandern
 * dürfen.
 */

const deckSize = 49;

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Schwarzer Peter: Paare ablegen, beim Nachbarn ziehen - und den Peter loswerden.",
    draw: "Karte ziehen",
    notYourTurn: "Du bist nicht am Zug.",
    noSource: "Es gibt niemanden zum Ziehen.",
    cannotPlay: "Hier wird nur gezogen, nicht gelegt.",
    drewFrom: "zieht bei",
    pairs: "legt ein Paar ab",
    pairsMany: "legt Paare ab",
    outNow: "ist fertig",
    hasPeter: "hat den Schwarzen Peter.",
    youHavePeter: "Du hast den Peter!",
    cards: "Karten",
    done: "fertig",
    end: "Runde beenden",
    ended: "Der Host hat die Runde beendet."
  },
  en: {
    intro: "Old Maid: discard pairs, draw from your neighbour - and get rid of the odd card.",
    draw: "Draw a card",
    notYourTurn: "It is not your turn.",
    noSource: "There is nobody to draw from.",
    cannotPlay: "Here you only draw, you never play a card.",
    drewFrom: "draws from",
    pairs: "discards a pair",
    pairsMany: "discards pairs",
    outNow: "is out",
    hasPeter: "is left holding the odd card.",
    youHavePeter: "You hold the odd card!",
    cards: "cards",
    done: "done",
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

function playersWithCards(state: CardGameState): string[] {
  return state.table.turnOrder.filter((playerId) => handOf(state.table, playerId).length > 0);
}

/** Legt alle Paare einer Hand ab und meldet, wie viele es waren. */
function discardPairs(
  state: CardGameState,
  playerId: string
): { state: CardGameState; pairs: number } {
  let table = state.table;
  let pairs = 0;
  let found = true;

  while (found) {
    found = false;
    const hand = handOf(table, playerId);
    const byRank = new Map<string, string[]>();

    for (const cardId of hand) {
      const card = table.cards[cardId];

      if (!card) {
        continue;
      }

      const bucket = byRank.get(card.rankId) ?? [];
      bucket.push(cardId);
      byRank.set(card.rankId, bucket);
    }

    for (const bucket of byRank.values()) {
      if (bucket.length >= 2) {
        table = moveCard(table, bucket[0] as string, { kind: "discard" }, "top");
        table = moveCard(table, bucket[1] as string, { kind: "discard" }, "top");
        pairs += 1;
        found = true;
        break;
      }
    }
  }

  return { state: { ...state, table }, pairs };
}

/** Nächster Spieler im Uhrzeigersinn, der noch Karten hält. */
function nextHolder(state: CardGameState, fromIndex: number): string | null {
  const order = state.table.turnOrder;

  for (let step = 1; step <= order.length; step += 1) {
    const playerId = order[(fromIndex + step) % order.length] as string;

    if (handOf(state.table, playerId).length > 0) {
      return playerId;
    }
  }

  return null;
}

function moveToNextHolder(state: CardGameState): CardGameState {
  const order = state.table.turnOrder;

  for (let step = 1; step <= order.length; step += 1) {
    const index = (state.table.activeIndex + step) % order.length;

    if (handOf(state.table, order[index] as string).length > 0) {
      return { ...state, table: { ...state.table, activeIndex: index } };
    }
  }

  return state;
}

export const schwarzerPeterRuleset: CardRuleset = {
  id: "schwarzer-peter",
  label: { de: "Schwarzer Peter", en: "Old Maid" },
  defaultDeckId: "peter-49",
  fixedDeckId: "peter-49",
  defaultHandSize: 8,
  openStartCard: false,
  turnBased: true,

  handSizeFor({ playerCount }) {
    return Math.max(1, Math.floor(deckSize / Math.max(1, playerCount)));
  },

  setupRound(state, context) {
    // Beim Schwarzen Peter bleibt keine Karte im Stapel liegen.
    let table = state.table;
    let seat = 0;

    while (table.drawPile.length > 0) {
      const cardId = table.drawPile[0] as string;
      const playerId = table.turnOrder[seat % table.turnOrder.length] as string;
      table = moveCard(table, cardId, { kind: "hand", playerId }, "bottom");
      seat += 1;
    }

    let working: CardGameState = { ...state, table };

    for (const playerId of working.table.turnOrder) {
      working = discardPairs(working, playerId).state;
    }

    const firstHolder = Math.max(
      0,
      working.table.turnOrder.findIndex((playerId) => handOf(working.table, playerId).length > 0)
    );

    return appendLog(
      { ...working, table: { ...working.table, activeIndex: firstHolder } },
      null,
      words(context).intro as string
    );
  },

  rules(context): CardTableRuleSectionState[] {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: [
              "Get rid of all your cards.",
              "One card in the deck has no partner — whoever holds it at the end loses the round."
            ]
          },
          {
            title: "Setting up",
            lines: [
              "Every card is dealt out; nothing stays in a pile.",
              "Pairs of equal rank are discarded automatically, right away and after every draw."
            ]
          },
          {
            title: "Your turn",
            lines: [
              "Draw one card blindly from the next player who still holds cards.",
              "Does it pair with something in your hand, both cards are discarded at once.",
              "Then it is that neighbour's turn."
            ]
          },
          {
            title: "End of the round",
            lines: [
              "Anyone whose hand is empty is out and safe.",
              "When only one player is left, they hold the odd card and lose.",
              "Everyone else scores a point."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: [
              "Werde alle deine Karten los.",
              "Eine Karte im Blatt hat keinen Partner — wer sie am Ende hält, verliert die Runde."
            ]
          },
          {
            title: "Aufbau",
            lines: [
              "Alle Karten werden ausgeteilt, es bleibt kein Stapel liegen.",
              "Paare gleichen Werts wandern automatisch auf die Ablage — sofort und nach jedem Ziehen."
            ]
          },
          {
            title: "Dein Zug",
            lines: [
              "Zieh verdeckt eine Karte beim nächsten Mitspieler, der noch Karten hat.",
              "Passt sie zu einer deiner Karten, wandert das Paar sofort auf die Ablage.",
              "Danach ist dieser Nachbar an der Reihe."
            ]
          },
          {
            title: "Rundenende",
            lines: [
              "Wessen Hand leer ist, ist raus und in Sicherheit.",
              "Bleibt nur noch einer übrig, hält er den Schwarzen Peter und verliert.",
              "Alle anderen bekommen einen Punkt."
            ]
          }
        ];
  },

  introMessage(context) {
    return words(context).intro as string;
  },

  canPlayCard(state, context) {
    return { allowed: false, hint: words(context).cannotPlay as string };
  },

  playCard(state, context) {
    return withError(state, words(context).cannotPlay as string);
  },

  drawCard(state, context, playerId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    const source = nextHolder(state, state.table.activeIndex);

    if (!source || source === playerId) {
      return withError(state, text.noSource as string);
    }

    const sourceHand = handOf(state.table, source);
    const cardId = sourceHand[Math.floor(Math.random() * sourceHand.length)] as string;
    const table = moveCard(state.table, cardId, { kind: "hand", playerId }, "bottom");
    let next = appendLog(
      clearError({ ...state, table, turnNumber: state.turnNumber + 1, updatedAt: context.now }),
      playerName(context, playerId),
      `${text.drewFrom} ${playerName(context, source)}`
    );

    const result = discardPairs(next, playerId);
    next = result.state;

    if (result.pairs > 0) {
      next = appendLog(
        next,
        playerName(context, playerId),
        result.pairs === 1 ? (text.pairs as string) : (text.pairsMany as string)
      );
    }

    if (handOf(next.table, playerId).length === 0) {
      next = appendLog(next, playerName(context, playerId), text.outNow as string);
    }

    const remaining = playersWithCards(next);

    if (remaining.length <= 1) {
      const loser = remaining[0] ?? null;

      return finishGame(
        next,
        null,
        null,
        loser ? `${playerName(context, loser)} ${text.hasPeter}` : (text.outNow as string)
      );
    }

    return moveToNextHolder(next);
  },

  runAction(state, context, playerId, actionId) {
    return actionId === "draw" ? schwarzerPeterRuleset.drawCard(state, context, playerId) : state;
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    return [
      {
        id: "draw",
        label: words(context).draw as string,
        kind: "primary",
        enabled: state.phase === "playing" && !state.gameOver && isActive(state, playerId)
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
      return schwarzerPeterRuleset.drawCard(state, context, active);
    }

    return actionId === "end"
      ? finishGame(state, null, null, words(context).ended as string)
      : state;
  },

  choiceForCard() {
    return undefined;
  },

  condition() {
    return undefined;
  },

  privateNote(state, context, playerId) {
    const text = words(context);
    const hand = handOf(state.table, playerId);
    const hasPeter = hand.some((cardId) => {
      const card = state.table.cards[cardId] as CardInstance | undefined;
      return card?.rankId === "peter";
    });

    if (hasPeter) {
      return text.youHavePeter as string;
    }

    return `${hand.length} ${text.cards}`;
  },

  seatStatus(state, context, playerId) {
    return handOf(state.table, playerId).length === 0 ? (words(context).done as string) : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    // Verloren hat, wer als Einziger noch Karten hält - alle anderen punkten.
    return state.table.turnOrder
      .filter((playerId) => handOf(state.table, playerId).length === 0)
      .map((playerId) => ({ playerId, delta: 1, reason: "Schwarzer Peter" }));
  },

  /**
   * KI-Zug.
   *
   * Hier gibt es nichts zu entscheiden: Gezogen wird blind, Paare fliegen von
   * selbst raus. Der Bot zieht also - taktisch ist Schwarzer Peter reines
   * Glück, und ein Bot, der hier "nachdenkt", würde nur so tun.
   */
  botMove(state, _context, playerId) {
    return isActive(state, playerId) ? { kind: "draw" } : { kind: "wait" };
  }
};
