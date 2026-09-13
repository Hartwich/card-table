import assert from "node:assert/strict";
import { test } from "node:test";
import { createCardTable } from "../dist/cards/cardTable.js";
import { resolveCardDeck } from "../dist/cards/deckPresets.js";
import { doppelkopfRuleset } from "../dist/rules/doppelkopf.js";
import { herzelnRuleset } from "../dist/rules/herzeln.js";
import { trickBetRuleset } from "../dist/rules/stichwette.js";
import { trickPauseMs } from "../dist/rules/trickPause.js";
import { stackHtml } from "../dist/host/cardHtml.js";

const players = ["anna", "ben", "cara", "david"];
const colors = ["#ed5565", "#38bdf8", "#facc15", "#a78bfa"];

for (const rules of [doppelkopfRuleset, herzelnRuleset, trickBetRuleset]) {
  for (let leader = 0; leader < 4; leader += 1) {
    for (let winnerOffset = 0; winnerOffset < 4; winnerOffset += 1) {
      test(`${rules.id}: leader ${leader}, winner offset ${winnerOffset}, colors through sweep`, () => {
        const deck = resolveCardDeck(rules.defaultDeckId);
        const context = {
          deck, language: "de", now: 1000,
          playerNames: Object.fromEntries(players.map((id) => [id, id])),
          playerColors: Object.fromEntries(players.map((id, i) => [id, colors[i]])),
          scores: {}, settings: {}, previousExtra: {}
        };
        const table = createCardTable({ deck, playerIds: players, handSize: 0 });
        table.activeIndex = leader;
        table.zones = { stich: [], "letzter-stich": [], abgelegt: [] };
        const playedIds = [];
        const lowRanks = ["9", "king", "10"];
        for (let offset = 0; offset < 4; offset += 1) {
          const rank = offset === winnerOffset ? "ace" : lowRanks.shift();
          const hand = ["clubs", "spades"].map((suit) =>
            Object.values(table.cards).find((card) => card.suitId === suit && card.rankId === rank).id
          );
          table.hands[players[(leader + offset) % 4]] = hand;
          playedIds.push(hand[0]);
        }
        const dealt = new Set(Object.values(table.hands).flat());
        table.drawPile = table.drawPile.filter((id) => !dealt.has(id));
        let state = {
          rulesetId: rules.id, deckId: deck.id, handSize: 2, table,
          turnNumber: 0, pendingDraw: 0, drawnThisTurn: 0, wishSuitId: null,
          log: [], nextLogId: 1, gameOver: false,
          extra: { phase: "play", trickLeaderIndex: leader },
          bots: [], botScores: {}, botReadyAt: null, updatedAt: context.now
        };
        const expectedColors = [];
        const stack = () => rules.tableStacks(state, context).find((entry) => entry.id === "stich");
        const checkColors = () => {
          assert.deepEqual(stack().cards.map((card) => card.ownerColor), expectedColors);
          const markup = stackHtml(stack(), "classic", 176);
          assert.deepEqual([...markup.matchAll(/--ct-owner:([^";]+)/g)].map((match) => match[1]), expectedColors);
        };
        for (let offset = 0; offset < 4; offset += 1) {
          const playerId = players[(leader + offset) % 4];
          assert.equal(rules.canPlayCard(state, context, playerId, playedIds[offset]).allowed, true);
          state = rules.playCard(state, context, playerId, playedIds[offset]);
          expectedColors.push(context.playerColors[playerId]);
          assert.deepEqual(stack().cards.map((card) => card.cardId), playedIds.slice(0, offset + 1));
          checkColors();
        }
        const winnerIndex = (leader + winnerOffset) % 4;
        const winnerId = players[winnerIndex];
        assert.equal(state.table.activeIndex, winnerIndex);
        assert.equal(state.extra.lastTrickWinner, winnerId);
        const nextCard = state.table.hands[winnerId][0];
        assert.equal(rules.canPlayCard(state, context, winnerId, nextCard).allowed, false);
        context.now += trickPauseMs - 1;
        assert.equal(rules.tick(state, context), state);
        checkColors();
        context.now += 1;
        state = rules.tick(state, context);
        assert.deepEqual(state.table.zones.stich, []);
        assert.deepEqual(state.table.zones["letzter-stich"], playedIds);
        assert.equal(state.lastTrickWinnerId, winnerId);
        assert.equal(state.lastTrickSerial, 1);
        assert.equal(rules.canPlayCard(state, context, winnerId, nextCard).allowed, true);
        state = rules.playCard(state, context, winnerId, nextCard);
        assert.equal(stack().cards[0].cardId, nextCard);
        assert.equal(stack().cards[0].ownerColor, colors[winnerIndex]);
      });
    }
  }
}
