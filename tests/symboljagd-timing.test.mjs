import assert from "node:assert/strict";
import test from "node:test";
import { createCardTable } from "../dist/cards/cardTable.js";
import { symboljagd57Deck } from "../dist/cards/deckPresets.js";
import { symboljagdRuleset as rules } from "../dist/rules/symboljagd.js";

function fixture() {
  const context = { deck: symboljagd57Deck, language: "de", now: 1000,
    playerNames: { a: "A", b: "B", c: "C" }, playerColors: {}, settings: {}, scores: {}, previousExtra: {} };
  const table = createCardTable({ deck: context.deck, playerIds: ["a", "b", "c"], handSize: 0 });
  table.cards = Object.fromEntries(Object.entries({ center: ["0", "1"], a: ["0", "2"], b: ["1", "3"], c: ["2", "4"], reserve: ["5"], reserveC: ["6"] })
    .map(([id, symbols]) => [id, { id, definitionId: id, suitId: "symbols", rankId: id, tags: symbols.map(symbol => `sym:${symbol}`) }]));
  table.hands = { a: ["a", "reserve"], b: ["b"], c: ["c", "reserveC"] };
  table.drawPile = [];
  table.discardPile = [];
  table.zones = { "symboljagd-center": ["center"], "symboljagd-history": [] };
  const state = { rulesetId: rules.id, deckId: context.deck.id, table, phase: "playing", gameOver: false,
    pendingDraw: 0, drawnThisTurn: 0, wishSuitId: null, turnNumber: 0, extra: {},
    log: [], nextLogId: 1, bots: [], botScores: {}, gameScores: {}, updatedAt: context.now };
  return { state, context };
}

test("wrong answers lock for five seconds and unlock at the exact deadline", () => {
  const { state, context } = fixture();
  const next = rules.playCard(state, context, "b", "b", "center|3");
  assert.equal(next.extra["symboljagdBlocked:b"], 6000);
  assert.equal(rules.canPlayCard(next, { ...context, now: 5999 }, "b", "b").allowed, false);
  assert.equal(rules.canPlayCard(next, { ...context, now: 6000 }, "b", "b").allowed, true);
  assert.equal(rules.tick(next, { ...context, now: 6000 }).extra["symboljagdBlocked:b"], 0);
});

test("a near-simultaneous correct old symbol is ignored with either the old or updated challenge ID", () => {
  const { state, context } = fixture();
  const next = rules.playCard(state, context, "a", "a", "center|0");
  for (const choice of ["center|1", "a|1"]) {
    assert.equal(rules.playCard(next, { ...context, now: 1050 }, "b", "b", choice), next);
  }
  assert.deepEqual(next.table.hands.b, ["b"]);
  assert.equal(next.extra["symboljagdBlocked:b"], 0);
});

test("grace survives multiple rapid center changes and expires two seconds after each solve", () => {
  const { state, context } = fixture();
  const first = rules.playCard(state, context, "a", "a", "center|0");
  const second = rules.playCard(first, { ...context, now: 1100 }, "c", "c", "a|2");
  assert.equal(rules.playCard(second, { ...context, now: 3000 }, "b", "b", "c|1"), second);
  const late = rules.playCard(second, { ...context, now: 3001 }, "b", "b", "c|1");
  assert.equal(late.extra["symboljagdBlocked:b"], 8001);
});

test("genuine mistakes and symbols absent from the player's card still incur a penalty during grace", () => {
  const { state, context } = fixture();
  const next = rules.playCard(state, context, "a", "a", "center|0");
  for (const symbol of ["3", "0"]) {
    const wrong = rules.playCard(next, { ...context, now: 1050 }, "b", "b", `a|${symbol}`);
    assert.equal(wrong.extra["symboljagdBlocked:b"], 6050);
  }
});

test("a current match wins normally and clears other players' penalties", () => {
  const { state, context } = fixture();
  const locked = rules.playCard(state, context, "b", "b", "center|3");
  const next = rules.playCard(locked, { ...context, now: 1050 }, "a", "a", "center|0");
  assert.equal(next.table.zones["symboljagd-center"][0], "a");
  assert.equal(next.extra["symboljagdBlocked:b"], 0);
  const current = rules.playCard(next, { ...context, now: 1100 }, "c", "c", "a|2");
  assert.equal(current.table.zones["symboljagd-center"][0], "c");
});

test("new rounds discard previous grace timestamps", () => {
  const { state, context } = fixture();
  state.extra["symboljagdSolved:center"] = context.now;
  const next = rules.setupRound(state, context);
  assert.equal(next.extra["symboljagdSolved:center"], undefined);
});
