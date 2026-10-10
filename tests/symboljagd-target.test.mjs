import assert from "node:assert/strict";
import test from "node:test";
import { serverGame } from "../dist/server/index.js";
import { cardTableManifest } from "../dist/manifest.js";
import { isLobbyFieldVisible } from "@open-party-lab/game-core";

function context(symbols = 8, players = 1, target = 30) {
  return { roomCode: "TARGET", roundNumber: 1, now: 1000, deltaMs: 0, language: "de", theme: "light",
    selectedGame: cardTableManifest, previousRound: null,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: "#123456", score: 0, connected: true })),
    roomSettings: { cardTableRuleset: "symboljagd", cardTableBotCount: 0,
      cardTableSymboljagdSymbolsPerCard: String(symbols), cardTableSymboljagdDealMode: "fixed", cardTableSymboljagdCardTarget: target } };
}

function inputFor(state, ctx, playerId) {
  const view = serverGame.toControllerStateForPlayer(state, ctx, playerId);
  const center = state.table.cards[state.table.zones["symboljagd-center"][0]].tags;
  const choice = view.pendingChoice.options.find(option => center.includes(`sym:${option.symbolImage}`));
  assert.ok(choice);
  return { type: "card-table:play", playerId, cardId: view.hand[0].cardId, choiceId: choice.id, sentAt: ctx.now };
}

for (const symbols of [8, 9, 10]) for (const players of [1, 2, 16]) for (const target of [30, 100]) {
  test(`${symbols} symbols, ${players} players: exact target ${target}, unique live cards and repeated recycling`, () => {
    let ctx = context(symbols, players, target);
    let state = serverGame.startRound(serverGame.createInitialState(ctx), ctx);
    const cardCount = Object.keys(state.table.cards).length;
    const completed = Object.fromEntries(ctx.players.map(player => [player.id, 0]));
    const seenCenters = new Set();
    let recycled = false;
    for (let step = 0; !state.gameOver && step < target * players; step++) {
      const playerId = ctx.players[step % players].id;
      ctx = { ...ctx, now: ctx.now + 50 };
      const centerId = state.table.zones["symboljagd-center"][0];
      if (seenCenters.has(centerId)) recycled = true;
      seenCenters.add(centerId);
      state = serverGame.handleInput(state, inputFor(state, ctx, playerId), ctx);
      completed[playerId]++;
      const cards = [...Object.values(state.table.hands).flat(), ...state.table.drawPile, ...state.table.discardPile, ...Object.values(state.table.zones).flat()];
      assert.equal(cards.length, cardCount);
      assert.equal(new Set(cards).size, cardCount);
      const view = serverGame.toPublicState(state, ctx);
      assert.equal(view.stacks.length, 1);
      for (const seat of view.seats) assert.equal(seat.handCount, target - completed[seat.playerId]);
      if (!state.gameOver) assert.ok(Object.values(state.table.hands).every(hand => hand.length === 1));
    }
    assert.equal(state.gameOver, true);
    assert.equal(completed[state.winnerPlayerId], target);
    assert.ok(Object.values(completed).every(count => count <= target));
    if (target * players > cardCount + players) assert.equal(recycled, true);
    if (players === 1) assert.equal(state.extra.symboljagdSoloTimeMs, target * 50);
  });
}

test("replayed challenge generations are ignored even when the same center ID returns", () => {
  const ctx = context();
  const state = serverGame.startRound(serverGame.createInitialState(ctx), ctx);
  const input = inputFor(state, ctx, "p0");
  const changed = { ...state, extra: { ...state.extra, symboljagdChallengeSerial: 2 } };
  assert.equal(serverGame.handleInput(changed, input, ctx), changed);
});

test("near-simultaneous old matches stay penalty-free after history cards move back into reserve", () => {
  const ctx = context(8, 16);
  let state = serverGame.startRound(serverGame.createInitialState(ctx), ctx);
  const oldCenter = state.table.zones["symboljagd-center"][0];
  state = serverGame.handleInput(state, inputFor(state, ctx, "p0"), ctx);
  const currentCenter = state.table.zones["symboljagd-center"][0];
  // Model a reserve refill while the old center is still in the grace window.
  state = { ...state, table: { ...state.table, zones: { ...state.table.zones,
    "symboljagd-reserve": [...state.table.zones["symboljagd-reserve"], ...state.table.zones["symboljagd-history"]], "symboljagd-history": [] } } };
  const oldTags = state.table.cards[oldCenter].tags;
  const currentTags = state.table.cards[currentCenter].tags;
  let tested = 0;
  for (const player of ctx.players.slice(1)) {
    const view = serverGame.toControllerStateForPlayer(state, ctx, player.id);
    const oldMatch = view.pendingChoice.options.find(option => oldTags.includes(`sym:${option.symbolImage}`) && !currentTags.includes(`sym:${option.symbolImage}`));
    if (!oldMatch) continue;
    const input = { type: "card-table:play", playerId: player.id, cardId: view.hand[0].cardId, choiceId: oldMatch.id, sentAt: ctx.now + 50 };
    assert.equal(serverGame.handleInput(state, input, { ...ctx, now: ctx.now + 50 }), state);
    tested++;
  }
  assert.ok(tested > 0);
});

test("setup accepts mode/target, clamps counts and hides Symboljagd settings in other rulesets", () => {
  const ctx = context();
  const update = serverGame.handleHostAction(null, { type: "configure-lobby", symboljagdDealMode: "fixed", symboljagdCardTarget: 999 }, ctx);
  assert.equal(update.roomSettings.cardTableSymboljagdDealMode, "fixed");
  assert.equal(update.roomSettings.cardTableSymboljagdCardTarget, 300);
  for (const id of ["symboljagdDealMode", "symboljagdCardTarget"]) {
    const field = cardTableManifest.lobbySetup.fields.find(field => field.id === id);
    assert.equal(isLobbyFieldVisible(field, cardTableManifest.lobbySetup.fields, { cardTableRuleset: "mau-mau", cardTableSymboljagdDealMode: "fixed" }), false);
  }
});
