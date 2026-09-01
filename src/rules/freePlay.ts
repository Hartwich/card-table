import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import {
  advanceTurn,
  drawCards,
  handOf,
  playCardToDiscard,
  recycleDiscardPile,
  toCardFace
} from "../cards/cardTable.js";
import type { CardTableActionState } from "../protocol.js";
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
 * Freies Spiel.
 *
 * Kein Regelwerk im engeren Sinn, sondern der offene Tisch: jeder darf ziehen
 * und ablegen, der Zug wird von Hand weitergegeben. Nützlich als Vorlage für
 * neue Kartenspiele und um Deck, Tisch und Handkarten auszuprobieren.
 */

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Freier Kartentisch: jeder darf ziehen und ablegen.",
    draw: "Ziehen",
    pass: "Zug weitergeben",
    recycle: "Ablage mischen",
    end: "Runde beenden",
    drew: "zieht eine Karte",
    played: "legt",
    passed: "gibt den Zug weiter",
    recycled: "Der Ablagestapel wurde neu gemischt.",
    ended: "Der Host hat die Runde beendet.",
    empty: "hat alle Karten abgelegt.",
    exhausted: "Es sind keine Karten mehr im Stapel.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand."
  },
  en: {
    intro: "Open card table: anyone may draw and play.",
    draw: "Draw",
    pass: "Pass turn",
    recycle: "Reshuffle pile",
    end: "End round",
    drew: "draws a card",
    played: "plays",
    passed: "passes the turn",
    recycled: "The discard pile was reshuffled.",
    ended: "The host ended the round.",
    empty: "played their last card.",
    exhausted: "No cards left in the pile.",
    notInHand: "That card is not in your hand."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

export const freePlayRuleset: CardRuleset = {
  id: "free-play",
  label: { de: "Freies Spiel", en: "Free play" },
  defaultDeckId: "french-52",
  defaultHandSize: 5,
  openStartCard: true,
  turnBased: false,

  rules(context) {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "What this is",
            lines: [
              "An open table without rules — for card games you referee yourselves.",
              "The server checks nothing except that a card is really in your hand."
            ]
          },
          {
            title: "Your turn",
            lines: [
              "Anyone may play a card onto the pile at any time.",
              "Anyone may draw a card at any time.",
              "The turn marker is passed on by hand with Pass turn."
            ]
          },
          {
            title: "The table",
            lines: [
              "The draw pile refills itself from the discard pile when it runs out.",
              "The host can reshuffle the pile or end the round at any point."
            ]
          },
          {
            title: "End of the round",
            lines: [
              "A player with an empty hand ends the round and scores one point.",
              "Otherwise the host ends it."
            ]
          }
        ]
      : [
          {
            title: "Worum es geht",
            lines: [
              "Ein offener Tisch ohne Regeln — für Kartenspiele, die ihr selbst schiedsrichtert.",
              "Der Server prüft nichts außer, dass eine Karte wirklich auf deiner Hand liegt."
            ]
          },
          {
            title: "Dein Zug",
            lines: [
              "Jeder darf jederzeit eine Karte auf die Ablage legen.",
              "Jeder darf jederzeit eine Karte ziehen.",
              "Die Zugmarke wird von Hand mit „Zug weitergeben“ weitergereicht."
            ]
          },
          {
            title: "Der Tisch",
            lines: [
              "Ist der Nachziehstapel leer, wird die Ablage automatisch neu gemischt.",
              "Der Host kann die Ablage jederzeit mischen oder die Runde beenden."
            ]
          },
          {
            title: "Rundenende",
            lines: [
              "Wer keine Karte mehr auf der Hand hat, beendet die Runde und bekommt einen Punkt.",
              "Ansonsten beendet der Host die Runde."
            ]
          }
        ];
  },

  introMessage(context) {
    return words(context).intro as string;
  },

  canPlayCard(state, _context, playerId, cardId) {
    return { allowed: handOf(state.table, playerId).includes(cardId) };
  },

  playCard(state, context, playerId, cardId) {
    if (!handOf(state.table, playerId).includes(cardId)) {
      return withError(state, words(context).notInHand as string);
    }

    const face = toCardFace(context.deck, state.table.cards[cardId]!);
    const table = playCardToDiscard(state.table, playerId, cardId);
    const next = appendLog(
      clearError({ ...state, table, turnNumber: state.turnNumber + 1, updatedAt: context.now }),
      playerName(context, playerId),
      `${words(context).played} ${face.rankLabel} ${face.suitSymbol}`
    );

    if (handOf(table, playerId).length === 0) {
      return finishGame(
        next,
        playerId,
        playerName(context, playerId),
        `${playerName(context, playerId)} ${words(context).empty}`
      );
    }

    return next;
  },

  drawCard(state, context, playerId) {
    const result = drawCards(state.table, playerId, 1);

    if (result.exhausted) {
      return withError(state, words(context).exhausted as string);
    }

    return appendLog(
      clearError({ ...state, table: result.state, updatedAt: context.now }),
      playerName(context, playerId),
      words(context).drew as string
    );
  },

  runAction(state, context, playerId, actionId) {
    if (actionId !== "pass") {
      return state;
    }

    return appendLog(
      clearError({
        ...state,
        table: advanceTurn(state.table),
        turnNumber: state.turnNumber + 1,
        drawnThisTurn: 0,
        updatedAt: context.now
      }),
      playerName(context, playerId),
      words(context).passed as string
    );
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const enabled = !state.gameOver && state.phase === "playing";

    return [
      { id: "draw", label: words(context).draw as string, kind: "secondary", enabled },
      {
        id: "pass",
        label: words(context).pass as string,
        kind: "secondary",
        enabled: enabled && state.table.turnOrder[state.table.activeIndex] === playerId
      }
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    const enabled = !state.gameOver && state.phase === "playing";

    return [
      { id: "draw", label: words(context).draw as string, kind: "primary", enabled },
      { id: "pass", label: words(context).pass as string, kind: "secondary", enabled },
      { id: "recycle", label: words(context).recycle as string, kind: "secondary", enabled },
      { id: "end", label: words(context).end as string, kind: "danger", enabled }
    ];
  },

  runHostAction(state, context, actionId) {
    const active = state.table.turnOrder[state.table.activeIndex];

    if (actionId === "draw" && active) {
      return freePlayRuleset.drawCard(state, context, active);
    }

    if (actionId === "pass" && active) {
      return freePlayRuleset.runAction(state, context, active, "pass");
    }

    if (actionId === "recycle") {
      return appendLog(
        { ...state, table: recycleDiscardPile(state.table), updatedAt: context.now },
        null,
        words(context).recycled as string
      );
    }

    if (actionId === "end") {
      return finishGame(state, null, null, words(context).ended as string);
    }

    return state;
  },

  choiceForCard() {
    return undefined;
  },

  condition() {
    return undefined;
  },

  seatStatus() {
    return undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Kartentisch" }]
      : [];
  }

  // Kein botMove: Im freien Spiel gibt es keine Regeln, an denen sich eine
  // Taktik ausrichten könnte. Hier übernimmt der generische Bot - er legt eine
  // Karte ab und gibt weiter.
};
