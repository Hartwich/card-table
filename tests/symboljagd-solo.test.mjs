import assert from "node:assert/strict";
import test from "node:test";
import { serverGame } from "../dist/server/index.js";
import { cardTableManifest } from "../dist/manifest.js";
import { roundScreenHtml } from "../dist/host/roundScreens.js";
import { buildCardTableControllerModel } from "../dist/controller/index.js";
import { formatCompletionTime } from "../dist/timeFormat.js";

function context(symbols = 8, players = 1, bots = 0) {
  return {
    roomCode: "SOLO", roundNumber: 1, now: 1000, deltaMs: 0, language: "de", theme: "light",
    selectedGame: cardTableManifest, previousRound: null,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: "#123456", score: 0, connected: true })),
    roomSettings: { cardTableRuleset: "symboljagd", cardTableBotCount: bots, cardTableSymboljagdSymbolsPerCard: String(symbols) }
  };
}

function play(state, ctx, symbol) {
  const card = state.table.hands.p0[0];
  const center = state.table.zones["symboljagd-center"][0];
  return serverGame.handleInput(state, { type: "card-table:play", playerId: "p0", cardId: card, choiceId: `${center}|${symbol}`, sentAt: ctx.now }, ctx);
}

const symbolsOf = (state, id) => state.table.cards[id].tags.filter(tag => tag.startsWith("sym:")).map(tag => tag.slice(4));

for (const [symbols, cardCount] of [[8, 57], [9, 73], [10, 91]]) {
  test(`solo with ${symbols} symbols: no bots, complete deck, frozen server time, host and phone results`, () => {
    let ctx = context(symbols);
    const intro = serverGame.createInitialState(ctx);
    assert.equal(intro.bots.length, 0);
    assert.deepEqual(intro.table.turnOrder, ["p0"]);
    assert.equal(intro.table.hands.p0.length, cardCount - 1);
    ctx = { ...ctx, now: 10000 };
    let state = serverGame.startRound(intro, ctx);
    const startedAt = ctx.now;
    assert.equal(serverGame.toPublicState(state, ctx).symboljagdSoloTimeMs, undefined);
    const centerSymbols = symbolsOf(state, state.table.zones["symboljagd-center"][0]);
    const wrongSymbol = symbolsOf(state, state.table.hands.p0[0]).find(symbol => !centerSymbols.includes(symbol));
    state = play(state, ctx, wrongSymbol);
    assert.equal(state.extra["symboljagdBlocked:p0"], startedAt + 5000);
    ctx = { ...ctx, now: ctx.now + 5000 };
    while (!state.gameOver) {
      ctx = { ...ctx, now: ctx.now + 50 };
      const own = symbolsOf(state, state.table.hands.p0[0]);
      const center = symbolsOf(state, state.table.zones["symboljagd-center"][0]);
      state = play(state, ctx, own.find(symbol => center.includes(symbol)));
    }
    const expected = 5000 + (cardCount - 1) * 50;
    assert.equal(state.extra.symboljagdSoloTimeMs, expected);
    assert.equal(state.table.hands.p0.length, 0);
    const later = { ...ctx, now: ctx.now + 60000 };
    const publicState = serverGame.toPublicState(state, later);
    assert.equal(publicState.symboljagdSoloTimeMs, expected);
    const controllerState = serverGame.toControllerStateForPlayer(state, later, "p0");
    const model = buildCardTableControllerModel({ state: { room: { language: "de" }, player: { id: "p0" }, game: { phase: "result", state: controllerState } }, onInput() {} });
    assert.equal(model.symboljagdSoloTime, formatCompletionTime(expected, "de"));
    for (const phase of ["result", "scoreboard", "finished"]) {
      const html = roundScreenHtml({ game: { phase, state: publicState }, room: { language: "de" } });
      assert.ok(html.includes(formatCompletionTime(expected, "de")));
      assert.match(html, /Deine Zeit/);
      assert.match(html, /data-card-table-menu/);
    }
    const next = serverGame.createInitialState({ ...later, roundNumber: 2, previousRound: { gameId: "card-table", state } });
    assert.equal(next.extra.symboljagdSoloTimeMs, undefined);
  });
}

test("explicit AI and multiplayer remain available; other card games still fill missing seats", () => {
  assert.equal(serverGame.createInitialState(context(8, 1, 1)).bots.length, 1);
  const ctx = context(8, 2);
  const state = serverGame.createInitialState(ctx);
  assert.equal(state.bots.length, 0);
  assert.equal(serverGame.toPublicState(state, ctx).symboljagdSoloTimeMs, undefined);
  const other = { ...context(), roomSettings: { cardTableRuleset: "doppelkopf", cardTableBotCount: 0 } };
  assert.equal(serverGame.createInitialState(other).bots.length, 3);
});

test("solo mistakes receive a penalty even if the symbol matched the preceding center", () => {
  const ctx = context();
  let state = serverGame.startRound(serverGame.createInitialState(ctx), ctx);
  const old = symbolsOf(state, state.table.zones["symboljagd-center"][0]);
  const hand = state.table.hands.p0;
  const first = hand[0];
  const firstSymbols = symbolsOf(state, first);
  const second = hand.slice(1).find(id => symbolsOf(state, id).some(symbol => old.includes(symbol) && !firstSymbols.includes(symbol)));
  assert.ok(second);
  state.table.hands.p0 = [first, second, ...hand.filter(id => id !== first && id !== second)];
  state = play(state, ctx, firstSymbols.find(symbol => old.includes(symbol)));
  const previousMatch = symbolsOf(state, second).find(symbol => old.includes(symbol) && !firstSymbols.includes(symbol));
  const next = play(state, { ...ctx, now: ctx.now + 50 }, previousMatch);
  assert.equal(next.extra["symboljagdBlocked:p0"], ctx.now + 5050);
});

test("time display handles zero, rounding across a minute, and both languages", () => {
  assert.equal(formatCompletionTime(0, "de"), "0:00,00");
  assert.equal(formatCompletionTime(59999, "de"), "1:00,00");
  assert.equal(formatCompletionTime(65430, "en"), "1:05.43");
});
