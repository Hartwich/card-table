import assert from "node:assert/strict";
import { test } from "node:test";
import { createCardTable } from "../dist/cards/cardTable.js";
import { resolveCardDeck } from "../dist/cards/deckPresets.js";
import { mauMauRuleset as mau } from "../dist/rules/mauMau.js";
import { schwimmenRuleset as swim, schwimmenHandValue } from "../dist/rules/schwimmen.js";
import { numberRowsRuleset as rows } from "../dist/rules/zahlenreihe.js";

function fixture(rules, deckId = rules.defaultDeckId) {
  const deck = resolveCardDeck(deckId);
  const context = { deck, language: "de", now: 1000, playerNames: { a: "A", b: "B", c: "C" },
    playerColors: {}, settings: {}, scores: {}, previousExtra: {} };
  const table = createCardTable({ deck, playerIds: ["a", "b", "c"], handSize: 0 });
  table.drawPile = [];
  const state = { rulesetId: rules.id, deckId, table, phase: "playing", gameOver: false,
    pendingDraw: 0, drawnThisTurn: 0, wishSuitId: null, turnNumber: 0, extra: {},
    log: [], nextLogId: 1, bots: [], botScores: {}, gameScores: {}, updatedAt: 1000 };
  const card = (suit, rank) => Object.values(table.cards).find(c => c.suitId === suit && c.rankId === rank).id;
  return { state, context, card };
}

test("Mau-Mau: a pass cannot move a seven penalty to another player", () => {
  const { state, context } = fixture(mau);
  state.pendingDraw = 4;
  const next = mau.runAction(state, context, "a", "pass");
  assert.equal(next.table.activeIndex, 0);
  assert.equal(next.pendingDraw, 4);
  assert.ok(next.lastError);
});

test("Mau-Mau: after drawing only the new card may be played", () => {
  const { state, context, card } = fixture(mau);
  state.table.discardPile = [card("hearts", "2")];
  const old = card("hearts", "3"), fresh = card("hearts", "4");
  state.table.hands.a = [old];
  state.table.drawPile = [fresh];
  const next = mau.drawCard(state, context, "a");
  assert.equal(mau.canPlayCard(next, context, "a", old).allowed, false);
  assert.equal(mau.canPlayCard(next, context, "a", fresh).allowed, true);
  assert.equal(mau.runAction(next, context, "a", "pass").table.activeIndex, 1);
});

test("Mau-Mau: an unplayable drawn card ends the turn even with an old match", () => {
  const { state, context, card } = fixture(mau);
  state.table.discardPile = [card("hearts", "2")];
  state.table.hands.a = [card("hearts", "3")];
  state.table.drawPile = [card("clubs", "4")];
  assert.equal(mau.drawCard(state, context, "a").table.activeIndex, 1);
});

test("Mau-Mau: exhausted pile passes if someone can play, otherwise ends without winner", () => {
  const { state, context, card } = fixture(mau);
  state.table.discardPile = [card("hearts", "2")];
  state.table.hands.a = [card("clubs", "3")];
  state.table.hands.b = [card("hearts", "4")];
  assert.equal(mau.drawCard(state, context, "a").table.activeIndex, 1);
  state.table.hands.b = [card("clubs", "4")];
  const next = mau.drawCard(state, context, "a");
  assert.equal(next.gameOver, true);
  assert.equal(next.winnerPlayerId, undefined);
});

test("Mau-Mau: partial and zero penalty draws advance and record the actual amount", () => {
  const { state, context, card } = fixture(mau);
  state.pendingDraw = 4;
  state.table.discardPile = [card("hearts", "7")];
  state.table.drawPile = [card("clubs", "3")];
  const next = mau.drawCard(state, context, "a");
  assert.equal(next.pendingDraw, 0);
  assert.equal(next.table.activeIndex, 1);
  assert.match(next.log[0].text, /1 Karten/);
  state.table.drawPile = [];
  assert.equal(mau.drawCard(state, context, "a").table.activeIndex, 1);
});

test("Mau-Mau: wish ends after the next matching card and sevens stack", () => {
  const { state, context, card } = fixture(mau);
  state.table.discardPile = [card("hearts", "jack")];
  state.wishSuitId = "clubs";
  state.table.hands.a = [card("clubs", "7"), card("spades", "3")];
  const next = mau.playCard(state, context, "a", card("clubs", "7"));
  assert.equal(next.wishSuitId, null);
  assert.equal(next.pendingDraw, 2);
  next.table.hands.b = [card("hearts", "7"), card("hearts", "jack")];
  assert.equal(mau.canPlayCard(next, context, "b", card("hearts", "jack")).allowed, false);
  assert.equal(mau.playCard(next, context, "b", card("hearts", "7")).pendingDraw, 4);
});

test("Schwimmen: same-suit totals and triples retain the documented variant", () => {
  const { state, context, card } = fixture(swim, "french-52");
  assert.equal(schwimmenHandValue(state, context, [card("hearts", "ace"), card("hearts", "king"), card("hearts", "10")]), 31);
  assert.equal(schwimmenHandValue(state, context, [card("hearts", "ace"), card("clubs", "ace"), card("spades", "ace")]), 30.5);
  assert.equal(schwimmenHandValue(state, context, [card("hearts", "ace"), card("clubs", "king"), card("clubs", "10")]), 20);
});

test("Schwimmen: dealt 31 resolves out of turn and protects simultaneous 31 hands", () => {
  const { state, context, card } = fixture(swim, "french-52");
  state.table.hands.a = [card("clubs", "2"), card("clubs", "3"), card("clubs", "4")];
  for (const [id, suit] of [["b", "hearts"], ["c", "spades"]]) {
    state.table.hands[id] = [card(suit, "ace"), card(suit, "king"), card(suit, "10")];
  }
  const next = swim.tick(state, context);
  assert.equal(next.extra["lives:a"], 2);
  assert.equal(next.extra["lives:b"], undefined);
  assert.equal(next.extra["lives:c"], undefined);
  assert.equal(next.table.zones.tisch.length, 3);
});

test("Schwimmen: knocking gives each other player one turn, then lowest loses", () => {
  const { state, context, card } = fixture(swim, "french-52");
  for (const [id, ranks] of [["a", ["ace", "king", "9"]], ["b", ["2", "3", "4"]], ["c", ["5", "6", "7"]]]) {
    state.table.hands[id] = ranks.map(rank => card("hearts", rank));
  }
  let next = swim.runAction(state, context, "a", "knock");
  next = swim.runAction(next, context, "b", "push");
  assert.equal(next.table.activeIndex, 2);
  assert.equal(next.extra["lives:b"], undefined);
  next = swim.runAction(next, context, "c", "push");
  assert.equal(next.extra["lives:b"], 2);
  assert.equal(next.extra.knockerId, null);
});

test("Schwimmen: one-card swap conserves both three-card groups", () => {
  const { state, context, card } = fixture(swim, "french-52");
  state.table.hands.a = ["2", "3", "4"].map(rank => card("hearts", rank));
  state.table.zones.tisch = ["5", "6", "7"].map(rank => card("clubs", rank));
  const given = state.table.hands.a[0], taken = state.table.zones.tisch[1];
  const next = swim.playCard(state, context, "a", given, taken);
  assert.equal(next.table.hands.a.length, 3);
  assert.equal(next.table.zones.tisch.length, 3);
  assert.ok(next.table.hands.a.includes(taken));
  assert.ok(next.table.zones.tisch.includes(given));
  assert.equal(swim.tableStacks(next, context)[0].layout, "spread");
});

test("Number Rows: only eleven opens, both ends extend and gaps are rejected", () => {
  const { state, context, card } = fixture(rows);
  const suit = context.deck.suits[0].id;
  state.table.hands.a = ["9", "10", "11", "12", "14"].map(rank => card(suit, rank));
  assert.equal(rows.canPlayCard(state, context, "a", card(suit, "10")).allowed, false);
  const next = rows.playCard(state, context, "a", card(suit, "11"));
  assert.equal(rows.canPlayCard(next, context, "a", card(suit, "10")).allowed, true);
  assert.equal(rows.canPlayCard(next, context, "a", card(suit, "12")).allowed, true);
  assert.equal(rows.canPlayCard(next, context, "a", card(suit, "14")).allowed, false);
  assert.equal(rows.drawCard(next, context, "a").table.activeIndex, 0);
  assert.equal(rows.runAction(next, context, "a", "pass").table.activeIndex, 1);
});

test("Number Rows: an empty pile allows an otherwise blocked player to advance", () => {
  const { state, context, card } = fixture(rows);
  state.table.hands.a = [card(context.deck.suits[0].id, "1")];
  assert.equal(rows.drawCard(state, context, "a").table.activeIndex, 1);
});

test("Number Rows: all four target rows exist and advertise both legal ends", () => {
  const { state, context, card } = fixture(rows);
  state.table.hands.a = [card("rot", "11")];
  const setup = rows.setupRound(state, context);
  setup.extra.openingCardId = null;
  const empty = rows.tableStacks(setup, context);
  assert.equal(empty.length, 4);
  assert.equal(new Set(empty.map(stack => stack.id)).size, 4);
  assert.ok(empty.every(stack => stack.count === 0 && stack.label.includes("11")));
  for (const suit of context.deck.suits) {
    setup.table.zones[suit.id] = [9, 10, 11, 12, 13].map(rank => card(suit.id, String(rank)));
    setup.table.hands.a = [8, 14, 7, 15].map(rank => card(suit.id, String(rank)));
    const stack = rows.tableStacks(setup, context).find(stack => stack.id === suit.id);
    assert.equal(stack.layout, "spread");
    assert.deepEqual(stack.cards.map(face => face.rankLabel), ["9", "13"]);
    assert.match(stack.label, /8 \/ 14/);
    for (const rank of [8, 14]) assert.ok(rows.canPlayCard(setup, context, "a", card(suit.id, String(rank))).allowed);
    for (const rank of [7, 15]) assert.equal(rows.canPlayCard(setup, context, "a", card(suit.id, String(rank))).allowed, false);
    setup.table.zones[suit.id] = Array.from({length:20}, (_,i) => card(suit.id, String(i+1)));
    assert.match(rows.tableStacks(setup, context).find(stack => stack.id === suit.id).label, /vollständig/);
  }
  for (const [playerCount, expected] of [[2,20],[3,20],[4,15],[5,12],[6,10]]) {
    assert.equal(rows.handSizeFor({playerCount,configured:3}), expected);
    assert.equal(rows.handSizeFor({playerCount,configured:12}), expected);
  }
});

test("Number Rows: starting eleven respects colour priority and ends the opening turn", () => {
  for (const suit of ["rot", "gelb", "gruen", "blau"]) {
    const { state, context, card } = fixture(rows);
    const suits = ["rot", "gelb", "gruen", "blau"];
    state.table.hands.b = suits.slice(suits.indexOf(suit)).map(s => card(s, "11"));
    state.table.hands.b.push(card(suit, "10"));
    let next = rows.setupRound(state, context);
    assert.equal(next.table.activeIndex, 1);
    assert.equal(rows.canPlayCard(next, context, "b", card(suit, "10")).allowed, false);
    assert.equal(rows.runAction(next, context, "b", "pass").table.activeIndex, 1);
    next = rows.playCard(next, context, "b", card(suit, "11"));
    assert.equal(next.table.activeIndex, 2);
    assert.equal(next.extra.openingCardId, null);
  }
});

test("Number Rows: no initial eleven causes a fresh complete deal", () => {
  const { state, context } = fixture(rows);
  const next = rows.setupRound({ ...state, handSize: 20 }, context);
  assert.ok(next.extra.openingCardId);
  assert.ok(Object.values(next.table.hands).every(hand => hand.length === 20));
  assert.equal(new Set([...Object.values(next.table.hands).flat(), ...next.table.drawPile]).size, 80);
});

test("Number Rows: draw up to three, never pass a matching draw, end after playing it", () => {
  const { state, context, card } = fixture(rows);
  state.table.hands.a = [card("rot", "9")];
  state.table.zones.rot = [card("rot", "11")];
  state.table.drawPile = [card("blau", "1"), card("gelb", "1"), card("rot", "10")];
  let next = rows.drawCard(state, context, "a");
  assert.equal(next.drawnThisTurn, 1);
  assert.equal(next.table.activeIndex, 0);
  assert.equal(rows.runAction(next, context, "a", "pass").table.activeIndex, 0);
  next = rows.drawCard(next, context, "a");
  assert.equal(next.drawnThisTurn, 2);
  next = rows.drawCard(next, context, "a");
  assert.equal(next.drawnThisTurn, 3);
  assert.equal(next.table.activeIndex, 0);
  assert.equal(rows.runAction(next, context, "a", "pass").table.activeIndex, 0);
  next = rows.playCard(next, context, "a", card("rot", "10"));
  assert.equal(next.table.activeIndex, 1); // Nine now fits, but the draw turn is over.
  assert.ok(next.table.hands.a.includes(card("rot", "9")));
});

test("Number Rows: three misses or an exhausted stock pass; remaining ranks score negatively", () => {
  const { state, context, card } = fixture(rows);
  state.table.hands.a = [card("rot", "19"), card("rot", "2")];
  state.table.drawPile = [card("blau", "1"), card("gelb", "1"), card("gruen", "1"), card("rot", "1")];
  let next = state;
  for (let i = 0; i < 3; i++) next = rows.drawCard(next, context, "a");
  assert.equal(next.table.activeIndex, 1);
  assert.equal(next.table.drawPile.length, 1);
  assert.equal(rows.drawCard({...state, table:{...state.table, drawPile:[card("blau","1")]}}, context,"a").table.activeIndex,1);
  const score = rows.buildScore({...state, winnerPlayerId:"b", gameOver:true});
  assert.equal(score.find(s => s.playerId === "a").delta, -21);
  assert.equal(score.find(s => s.playerId === "b").delta, 0);
  assert.deepEqual(rows.buildScore(state), []);
});

for (const rules of [mau, swim, rows]) {
  for (const seats of [2, 4, 6]) {
    test(`${rules.id}: seeded bot rounds with ${seats} seats conserve all cards and finish`, () => {
      const originalRandom = Math.random;
      try {
        for (const seed of [19, 71, 203]) {
          let randomState = seed;
          Math.random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
          const { state: initial, context } = fixture(rules);
          const players = Array.from({ length: seats }, (_, i) => `p${i}`);
          const handSize = rules === rows ? rows.handSizeFor({playerCount:seats}) : rules.defaultHandSize;
          const table = createCardTable({ deck: context.deck, playerIds: players,
            handSize, openStartCard: rules.openStartCard });
          let state = { ...initial, table, handSize };
          state = rules.setupRound?.(state, context) ?? state;
          let step = 0;
          for (; step < 2000 && !state.gameOver; step++) {
            const locations = [...state.table.drawPile, ...state.table.discardPile,
              ...Object.values(state.table.hands).flat(), ...Object.values(state.table.zones).flat()];
            assert.equal(locations.length, Object.keys(state.table.cards).length, `seed ${seed}, step ${step}: missing cards`);
            assert.equal(new Set(locations).size, locations.length, `seed ${seed}, step ${step}: duplicate cards`);
            state = rules.tick?.(state, context) ?? state;
            if (state.gameOver) break;
            const player = state.table.turnOrder[state.table.activeIndex];
            const intent = rules.botMove(state, context, player);
            assert.notEqual(intent?.kind, "wait", `seed ${seed}, step ${step}: bot stalls`);
            if (intent.kind === "play") state = rules.playCard(state, context, player, intent.cardId, intent.choiceId);
            else if (intent.kind === "draw") state = rules.drawCard(state, context, player);
            else state = rules.runAction(state, context, player, intent.actionId);
            assert.equal(state.lastError, undefined, `seed ${seed}, step ${step}`);
          }
          assert.equal(state.gameOver, true, `seed ${seed} exceeded ${step} steps`);
        }
      } finally {
        Math.random = originalRandom;
      }
    });
  }
}
