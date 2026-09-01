import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { advanceTurn, drawCards, handOf, moveCard, toCardFace } from "../cards/cardTable.js";
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
  withError,
  writeExtra,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Zahlenreihe.
 *
 * Vier Farbreihen von 1 bis 20. Eröffnet wird jede Reihe mit der Elf, danach
 * wird an beiden Enden um genau eins verlängert. Wer am Zug ist, legt so viele
 * Karten an, wie er will und kann; erst wenn nichts mehr passt, wird gezogen.
 *
 * Zeigt auf dem Fundament, wie ein Regelwerk mehrere offene Ablagereihen statt
 * eines einzelnen Ablagestapels benutzt und wie ein Zug aus mehreren Aktionen
 * bestehen kann.
 */

const startRank = 11;
const laidKey = "laidThisTurn";

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Zahlenreihe: Jede Farbreihe beginnt mit der 11, danach legst du nach oben oder unten an.",
    draw: "Ziehen",
    done: "Fertig",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    needEleven: "Diese Reihe beginnt mit der 11.",
    noFit: "Passt an keinem Ende der Reihe.",
    canStillPlay: "Du kannst noch anlegen.",
    nothingYet: "Leg an oder zieh eine Karte.",
    plays: "legt",
    opens: "eröffnet",
    drew: "zieht eine Karte",
    passed: "beendet den Zug",
    empty: "Der Stapel ist leer.",
    noDraw: "kann nicht ziehen und setzt aus",
    wins: "hat alle Karten abgelegt.",
    startHint: "Start: 11",
    playable: "Spielbar",
    lastCard: "letzte Karte",
    end: "Runde beenden",
    ended: "Der Host hat die Runde beendet."
  },
  en: {
    intro: "Number Rows: every colour row starts with the 11, then you extend it up or down.",
    draw: "Draw",
    done: "Done",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    needEleven: "This row starts with the 11.",
    noFit: "Does not fit either end of the row.",
    canStillPlay: "You can still play a card.",
    nothingYet: "Play a card or draw one.",
    plays: "plays",
    opens: "opens",
    drew: "draws a card",
    passed: "ends the turn",
    empty: "The pile is empty.",
    noDraw: "cannot draw and passes",
    wins: "played their last card.",
    startHint: "Start: 11",
    playable: "Playable",
    lastCard: "last card",
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

function playableCount(state: CardGameState, context: CardRulesetContext, playerId: string): number {
  return handOf(state.table, playerId).filter(
    (cardId) => numberRowsRuleset.canPlayCard(state, context, playerId, cardId).allowed
  ).length;
}

/** Gibt an den nächsten Spieler ab und setzt die Zugzähler zurück. */
function endTurn(state: CardGameState, context: CardRulesetContext): CardGameState {
  return writeExtra(
    {
      ...state,
      table: advanceTurn(state.table),
      drawnThisTurn: 0,
      turnNumber: state.turnNumber + 1,
      updatedAt: context.now
    },
    { [laidKey]: 0 }
  );
}

export const numberRowsRuleset: CardRuleset = {
  id: "zahlenreihe",
  label: { de: "Zahlenreihe", en: "Number Rows" },
  defaultDeckId: "zahlen-80",
  fixedDeckId: "zahlen-80",
  defaultHandSize: 10,
  openStartCard: false,
  turnBased: true,

  setupRound(state, context) {
    const zones: Record<string, string[]> = { ...state.table.zones };

    for (const suit of context.deck.suits) {
      zones[suit.id] = [];
    }

    return { ...state, table: { ...state.table, zones }, extra: { ...state.extra, [laidKey]: 0 } };
  },

  rules(context): CardTableRuleSectionState[] {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: ["Be the first to play every card in your hand."]
          },
          {
            title: "The deck",
            lines: [
              "Four colours, each with the numbers 1 to 20.",
              "Every colour builds its own row on the table."
            ]
          },
          {
            title: "Opening a row",
            lines: [
              "An empty row can only be started with the 11 of that colour.",
              "Until a row is open, no other card of that colour can be played."
            ]
          },
          {
            title: "Extending a row",
            lines: [
              "A row grows at both ends, always by exactly one.",
              "A row showing 9 to 13 accepts the 8 and the 14 — nothing else.",
              "Rows stop naturally at 1 and at 20."
            ]
          },
          {
            title: "Your turn",
            lines: [
              "Play as many cards as you like and can, one after another.",
              "Press Done to hand over once you are finished.",
              "If nothing fits, draw one card. If it fits you may play it, otherwise the turn passes.",
              "With an empty draw pile a player who cannot play simply passes."
            ]
          },
          {
            title: "End of the round",
            lines: ["The first player with an empty hand wins the round and scores one point."]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: ["Lege als Erster alle Karten deiner Hand ab."]
          },
          {
            title: "Das Blatt",
            lines: [
              "Vier Farben mit den Zahlen 1 bis 20.",
              "Jede Farbe bildet auf dem Tisch eine eigene Reihe."
            ]
          },
          {
            title: "Eine Reihe eröffnen",
            lines: [
              "Eine leere Reihe wird ausschließlich mit der 11 dieser Farbe eröffnet.",
              "Solange eine Reihe nicht offen ist, kann keine andere Karte dieser Farbe gelegt werden."
            ]
          },
          {
            title: "Anlegen",
            lines: [
              "Eine Reihe wächst an beiden Enden, immer um genau eins.",
              "An eine Reihe von 9 bis 13 passen die 8 und die 14 — sonst nichts.",
              "Bei 1 und 20 ist eine Reihe zu Ende."
            ]
          },
          {
            title: "Dein Zug",
            lines: [
              "Lege so viele Karten an, wie du willst und kannst — eine nach der anderen.",
              "Mit „Fertig“ gibst du ab, wenn du genug gelegt hast.",
              "Passt nichts, ziehst du genau eine Karte. Passt sie, darfst du sie legen, sonst ist der Nächste dran.",
              "Ist der Nachziehstapel leer, setzt aus, wer nicht anlegen kann."
            ]
          },
          {
            title: "Rundenende",
            lines: ["Wer zuerst keine Karte mehr hat, gewinnt die Runde und bekommt einen Punkt."]
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
    const check = numberRowsRuleset.canPlayCard(state, context, playerId, cardId);

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

    const played = appendLog(
      clearError(
        writeExtra({ ...state, table, updatedAt: context.now }, { [laidKey]: readNumber(state, laidKey) + 1 })
      ),
      playerName(context, playerId),
      `${ends ? text.plays : text.opens} ${face.rankLabel} ${face.suitSymbol}`
    );

    if (handOf(table, playerId).length === 0) {
      return finishGame(
        played,
        playerId,
        playerName(context, playerId),
        `${playerName(context, playerId)} ${text.wins}`
      );
    }

    // Ein Zug darf weiterlaufen, solange noch etwas passt.
    return playableCount(played, context, playerId) > 0 ? played : endTurn(played, context);
  },

  drawCard(state, context, playerId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    if (playableCount(state, context, playerId) > 0) {
      return withError(state, text.canStillPlay as string);
    }

    if (state.drawnThisTurn > 0) {
      return endTurn(state, context);
    }

    const result = drawCards(state.table, playerId, 1);

    if (result.exhausted) {
      return appendLog(clearError(endTurn(state, context)), playerName(context, playerId), text.noDraw as string);
    }

    const drawn = clearError({
      ...state,
      table: result.state,
      drawnThisTurn: 1,
      updatedAt: context.now
    });

    if (playableCount(drawn, context, playerId) > 0) {
      return appendLog(drawn, playerName(context, playerId), text.drew as string);
    }

    return appendLog(endTurn(drawn, context), playerName(context, playerId), `${text.drew} - ${text.passed}`);
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (actionId !== "pass" || !isActive(state, playerId)) {
      return state;
    }

    if (readNumber(state, laidKey) === 0 && state.drawnThisTurn === 0) {
      return withError(state, text.nothingYet as string);
    }

    return appendLog(clearError(endTurn(state, context)), playerName(context, playerId), text.passed as string);
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const text = words(context);
    const active = isActive(state, playerId) && state.phase === "playing" && !state.gameOver;
    const canPlay = active && playableCount(state, context, playerId) > 0;

    return [
      {
        id: "draw",
        label: text.draw as string,
        kind: "primary",
        enabled: active && !canPlay && state.drawnThisTurn === 0,
        hint: canPlay ? (text.canStillPlay as string) : undefined
      },
      {
        id: "pass",
        label: text.done as string,
        kind: "secondary",
        enabled: active && (readNumber(state, laidKey) > 0 || state.drawnThisTurn > 0)
      }
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    const text = words(context);
    const enabled = state.phase === "playing" && !state.gameOver;

    return [
      { id: "draw", label: text.draw as string, kind: "primary", enabled },
      { id: "pass", label: text.done as string, kind: "secondary", enabled },
      { id: "end", label: text.end as string, kind: "danger", enabled }
    ];
  },

  runHostAction(state, context, actionId) {
    const active = state.table.turnOrder[state.table.activeIndex];

    if (actionId === "draw" && active) {
      return numberRowsRuleset.drawCard(state, context, active);
    }

    if (actionId === "pass" && active) {
      return numberRowsRuleset.runAction(state, context, active, "pass");
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

    return opened ? undefined : { label: words(context).startHint as string, color: "neutral" };
  },

  privateNote(state, context, playerId) {
    return `${words(context).playable}: ${playableCount(state, context, playerId)}`;
  },

  seatStatus(state, context, playerId) {
    return handOf(state.table, playerId).length === 1 ? (words(context).lastCard as string) : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Zahlenreihe" }]
      : [];
  },

  /**
   * KI-Zug.
   *
   * Ein Zug besteht aus beliebig vielen Karten, also legt der Bot so lange, wie
   * etwas passt - Ziel ist die leere Hand. Er beginnt mit den Karten, die
   * direkt an ein Reihenende anschließen, damit er sich keine Lücke aufreißt,
   * in die er später selbst nicht mehr hineinkommt.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const playable = handOf(state.table, playerId).filter(
      (cardId) => numberRowsRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    const cardId = bestOf(playable, (entry) => {
      const card = state.table.cards[entry];

      if (!card?.suitId) {
        return -100;
      }

      const ends = rowEnds(state, card.suitId);

      if (!ends) {
        // Eine Reihe eröffnen ist immer gut: sie schafft neue Anlegeplätze.
        return 10;
      }

      const value = rankValue(card);

      return -Math.min(Math.abs(value - ends.low), Math.abs(value - ends.high));
    });

    if (cardId) {
      return { kind: "play", cardId };
    }

    if (state.drawnThisTurn === 0) {
      return { kind: "draw" };
    }

    return { kind: "action", actionId: "pass" };
  }
};
