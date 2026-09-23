import assert from "node:assert/strict";
import { test } from "node:test";
import { createCardTable } from "../dist/cards/cardTable.js";
import { resolveCardDeck } from "../dist/cards/deckPresets.js";
import { fischenRuleset as fish } from "../dist/rules/fischen.js";
import { luegenRuleset as cheat } from "../dist/rules/luegen.js";
import { schwarzerPeterRuleset as peter } from "../dist/rules/schwarzerPeter.js";
import { freePlayRuleset as free } from "../dist/rules/freePlay.js";

function fixture(rules) {
  const deck = resolveCardDeck(rules.defaultDeckId);
  const players = ["a", "b", "c"];
  const context = { deck, language: "de", now: 1000, playerNames: { a: "A", b: "B", c: "C" }, playerColors: {}, scores: {}, settings: {}, previousExtra: {} };
  const table = createCardTable({ deck, playerIds: players, handSize: 0 });
  table.discardPile = [...table.drawPile];
  table.drawPile = [];
  const state = { phase: "playing", rulesetId: rules.id, deckId: deck.id, table, turnNumber: 0, log: [], nextLogId: 1, gameOver: false, extra: {}, updatedAt: 0 };
  const rank = (id) => Object.values(table.cards).filter(c => c.rankId === id).map(c => c.id);
  const assign = (ids, destination) => {
    table.discardPile = table.discardPile.filter(id => !ids.includes(id));
    if (destination === "draw") table.drawPile.push(...ids);
    else table.hands[destination].push(...ids);
  };
  return { state, context, rank, assign };
}

test("Go Fish finishes immediately when the last stock card completes the final set", () => {
  const { state, context, rank, assign } = fixture(fish);
  const cards = rank("ace");
  assign(cards.slice(0, 3), "a");
  assign(cards.slice(3), "draw");
  const next = fish.drawCard(state, context, "a");
  assert.equal(next.gameOver, true);
  assert.equal(next.winnerPlayerId, "a");
  assert.equal(next.extra["sets:a"], 1);
  assert.equal(next.table.drawPile.length, 0);
  assert.equal(next.updatedAt, context.now);
});

test("Go Fish reports all tied winners without selecting an arbitrary first player", () => {
  const { state, context } = fixture(fish);
  state.extra = { "sets:a": 2, "sets:b": 2, "sets:c": 1 };
  const next = fish.drawCard(state, context, "a");
  assert.equal(next.gameOver, true);
  assert.equal(next.winnerPlayerId, undefined);
  assert.deepEqual(fish.buildScore(next).map(s => s.playerId), ["a", "b"]);
});

test("Go Fish skips empty hands once the stock runs out", () => {
  const { state, context, rank, assign } = fixture(fish);
  assign(rank("ace").slice(0, 1), "a");
  assign(rank("king").slice(0, 1), "c");
  const next = fish.playCard(state, context, "a", state.table.hands.a[0], "c");
  assert.equal(next.table.turnOrder[next.table.activeIndex], "c");
});

test("Go Fish bots remember public failed requests instead of repeating an endless cycle", () => {
  const { state, context, rank, assign } = fixture(fish);
  assign(rank("ace").slice(0, 1), "a");
  assign(rank("king").slice(0, 3), "b");
  assign(rank("ace").slice(1), "c");
  const next = fish.playCard(state, context, "a", state.table.hands.a[0], "b");
  next.table.activeIndex = 0;
  const move = fish.botMove(next, context, "a");
  assert.equal(move.choiceId, "c");
  const received = fish.playCard(next, context, "a", next.table.hands.a[0], "c");
  assert.equal(received.extra["sets:a"], 1);
});

test("Cheat last-card bluff stays challengeable and can be accepted", () => {
  const { state, context, rank, assign } = fixture(cheat);
  assign(rank("king").slice(0, 1), "a");
  assign(rank("ace").slice(0, 1), "b");
  state.extra.claimIndex = context.deck.ranks.findIndex(r => r.id === "ace");
  state.table.zones.stapel = [];
  const next = cheat.playCard(state, context, "a", state.table.hands.a[0]);
  assert.equal(next.gameOver, false);
  assert.equal(next.extra.pendingWinnerId, "a");
  assert.equal(cheat.canPlayCard(next, context, "b", next.table.hands.b[0]).allowed, false);
  assert.equal(cheat.runAction(next, context, "c", "accept"), next);
  assert.equal(cheat.runAction(next, context, "b", "accept").winnerPlayerId, "a");
  const caught = cheat.runAction(next, context, "b", "doubt");
  assert.equal(caught.gameOver, false);
  assert.equal(caught.table.hands.a.length, 1);
  assert.equal(caught.extra.pendingWinnerId, null);
});

test("Cheat honest final card wins even when challenged", () => {
  const { state, context, rank, assign } = fixture(cheat);
  assign(rank("ace").slice(0, 1), "a");
  state.extra.claimIndex = context.deck.ranks.findIndex(r => r.id === "ace");
  state.table.zones.stapel = [];
  const played = cheat.playCard(state, context, "a", state.table.hands.a[0]);
  const next = cheat.runAction(played, context, "c", "doubt");
  assert.equal(next.gameOver, true);
  assert.equal(next.winnerPlayerId, "a");
  assert.equal(next.table.hands.c.length, 1);
});

test("Old Maid ends during setup if automatic pairing leaves just the odd card", () => {
  const { state, context, rank, assign } = fixture(peter);
  assign(rank("peter"), "a");
  const next = peter.setupRound(state, context);
  assert.equal(next.gameOver, true);
  assert.deepEqual(peter.buildScore(next).map(s => s.playerId), ["b", "c"]);
});

test("Free play only lets the player with the turn marker pass it", () => {
  const { state, context } = fixture(free);
  assert.equal(free.runAction(state, context, "b", "pass"), state);
  assert.equal(free.runAction(state, context, "a", "pass").table.activeIndex, 1);
});
