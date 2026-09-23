import assert from "node:assert/strict";
import { test } from "node:test";
import { createCardTable } from "../dist/cards/cardTable.js";
import { resolveCardDeck } from "../dist/cards/deckPresets.js";
import { herzelnRuleset as hearts } from "../dist/rules/herzeln.js";
import { trickBetRuleset as bets } from "../dist/rules/stichwette.js";

function fixture(rules, count = 4, round = 1, seed = 42) {
  const deck = resolveCardDeck(rules.defaultDeckId);
  const players = Array.from({ length: count }, (_, i) => `p${i}`);
  const handSize = rules.handSizeFor({ playerCount: count, roundNumber: round });
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const context = { deck, language: "en", now: 1000, playerNames: Object.fromEntries(players.map(id => [id, id])), playerColors: {}, scores: {}, settings: {}, previousExtra: {} };
  let state = { phase: "playing", rulesetId: rules.id, deckId: deck.id, handSize,
    table: createCardTable({ deck, playerIds: players, handSize, random }),
    turnNumber: 0, pendingDraw: 0, drawnThisTurn: 0, wishSuitId: null,
    log: [], nextLogId: 1, gameOver: false, extra: {}, bots: [], botScores: {}, gameScores: {}, botReadyAt: null, updatedAt: context.now };
  state = rules.setupRound(state, context);
  const card = (suit, rank) => Object.values(state.table.cards).find(c => c.suitId === suit && c.rankId === rank).id;
  return { state, context, card };
}

test("Hearts: first-trick discard restrictions and forced penalty exception", () => {
  const { state, context, card } = fixture(hearts);
  state.extra.openerCardId = null;
  state.extra.leadSuitId = "clubs";
  state.table.activeIndex = 0;
  const heart = card("hearts", "2"), queen = card("spades", "queen"), diamond = card("diamonds", "ace");
  state.table.hands.p0 = [heart, queen, diamond];
  assert.equal(hearts.canPlayCard(state, context, "p0", heart).allowed, false);
  assert.equal(hearts.canPlayCard(state, context, "p0", queen).allowed, false);
  assert.equal(hearts.canPlayCard(state, context, "p0", diamond).allowed, true);
  state.table.hands.p0 = [heart, queen];
  assert.equal(hearts.canPlayCard(state, context, "p0", heart).allowed, true);
  state.extra.trickCount = 1;
  state.table.hands.p0.push(diamond);
  assert.equal(hearts.canPlayCard(state, context, "p0", queen).allowed, true);
});

test("Trick Bets: full final deal has no trump; malformed bids do not consume turn", () => {
  const { state, context } = fixture(bets, 4, 15);
  assert.equal(state.handSize, 15);
  assert.equal(state.extra.trumpSuitId, null);
  assert.deepEqual(state.table.zones.trumpf, []);
  for (const bid of ["1.5", "1junk", "", "-1", "16"]) {
    assert.equal(bets.runAction(state, context, "p0", `bid:${bid}`), state);
  }
  assert.equal(bets.runAction(state, context, "p0", "bid:15").extra["bid:p0"], 15);
});

test("Trick Bets: crown reveal requires dealer choice before any bids or plays", () => {
  let { state, context } = fixture(bets);
  const crown = Object.values(state.table.cards).find(c => c.rankId === "crown").id;
  state.table.drawPile = [crown];
  state = bets.setupRound(state, context);
  assert.equal(state.extra.phase, "trump-choice");
  assert.equal(state.table.activeIndex, 3);
  assert.equal(bets.controllerActions(state, context, "p3").length, 4);
  assert.ok(bets.controllerActions(state, context, "p3").every(a => a.enabled));
  assert.ok(bets.controllerActions(state, context, "p0").every(a => !a.enabled));
  assert.equal(bets.runAction(state, context, "p3", "bid:0"), state);
  assert.equal(bets.runAction(state, context, "p0", "trump:clubs"), state);
  assert.equal(bets.canPlayCard(state, context, "p3", state.table.hands.p3[0]).allowed, false);
  const move = bets.botMove(state, context, "p3");
  assert.equal(move.kind, "action");
  assert.ok(move.actionId.startsWith("trump:"));
  state = bets.runAction(state, context, "p3", "trump:clubs");
  assert.equal(state.extra.phase, "bid");
  assert.equal(state.extra.trumpSuitId, "clubs");
  assert.equal(state.table.activeIndex, 0);
});

for (const rules of [hearts, bets]) {
  for (let count = 3; count <= 6; count++) {
    test(`${rules.id}: complete ${count}-seat deal without illegal moves or lost cards`, () => {
      let { state, context } = fixture(rules, count, 20, count * 1789);
      if (rules === hearts) {
        const dealt = Object.values(state.table.hands).flat().map(id => state.table.cards[id]);
        assert.equal(dealt.filter(c => c.suitId === "hearts").length, 13);
        assert.ok(dealt.some(c => c.suitId === "spades" && c.rankId === "queen"));
        assert.ok(state.extra.openerCardId);
        assert.ok(state.table.drawPile.every(id => state.table.cards[id].suitId === "diamonds"));
      }
      for (let step = 0; step < 200 && !state.gameOver; step++) {
        if (state.extra.sweepAt > 0) {
          const label = rules.tableStacks(state, context).find(s => s.id === "stich").label;
          assert.ok(label.startsWith(`Trick ${state.extra.trickCount}`), label);
          context.now = state.extra.sweepAt;
          state = rules.tick(state, context);
          continue;
        }
        const player = state.table.turnOrder[state.table.activeIndex];
        const move = rules.botMove(state, context, player);
        assert.notEqual(move.kind, "wait", `deadlock at step ${step}`);
        if (move.kind === "action") state = rules.runAction(state, context, player, move.actionId);
        else {
          assert.equal(rules.canPlayCard(state, context, player, move.cardId).allowed, true);
          state = rules.playCard(state, context, player, move.cardId);
        }
      }
      assert.equal(state.gameOver, true);
      assert.ok(Object.values(state.table.hands).every(hand => hand.length === 0));
      const locations = [...state.table.drawPile, ...state.table.discardPile, ...Object.values(state.table.zones).flat()];
      assert.equal(new Set(locations).size, Object.keys(state.table.cards).length);
      assert.equal(locations.length, Object.keys(state.table.cards).length);
      if (rules === hearts) {
        const sum = state.table.turnOrder.reduce((n, id) => n + state.extra[`pen:${id}`], 0);
        assert.ok(sum === 26 || sum === 26 * (count - 1));
      }
    });
  }
}

test("Trick Bets: dealer rotates and bidding/lead begin on the left", () => {
  let { state, context } = fixture(bets);
  context.roundNumber = 3;
  state.table.drawPile = [Object.values(state.table.cards).find(c => c.rankId === "crown").id];
  state = bets.setupRound(state, context);
  assert.equal(state.table.activeIndex, 1);
  state = bets.runAction(state, context, "p1", "trump:hearts");
  assert.equal(state.table.activeIndex, 2);
  for (const id of ["p2", "p3", "p0", "p1"]) state = bets.runAction(state, context, id, "bid:0");
  assert.equal(state.table.activeIndex, 2);
  assert.equal(state.extra.trickLeaderIndex, 2);
});

test("Trick Bets: arcane deck has four complete 1–13 suits and eight specials", () => {
  const { state, context } = fixture(bets);
  assert.equal(Object.keys(state.table.cards).length, 60);
  for (const suit of context.deck.suits) {
    const ranks = Object.values(state.table.cards).filter(c => c.suitId === suit.id).map(c => context.deck.ranks.find(r => r.id === c.rankId).order).sort((a,b) => a-b);
    assert.deepEqual(ranks, Array.from({length:13},(_,i)=>i+1));
  }
  for (const rank of ["crown", "feather"]) assert.equal(Object.values(state.table.cards).filter(c => c.rankId === rank).length,4);
});

test("Trick Bets: final series uses cumulative scores and preserves tied winners", () => {
  const { state, context } = fixture(bets, 3, 20);
  for (const id of state.table.turnOrder) { state.extra[`bid:${id}`] = 0; state.extra[`tricks:${id}`] = 0; }
  state.gameScores = {p0:10,p1:30,p2:30};
  const result = bets.runHostAction(state, context, "end");
  assert.equal(result.extra.seriesComplete, true);
  assert.equal(result.winnerPlayerId, undefined);
  assert.equal(result.winnerName, "p1 & p2");
});
