import assert from "node:assert/strict";
import { test } from "node:test";
import { serverGame } from "../dist/server/index.js";
import { cardTableManifest } from "../dist/manifest.js";
import { roundScreenHtml } from "../dist/host/roundScreens.js";

function context(ruleset, deck, count = 6) {
  return {
    roomCode: "TEST", roundNumber: 2, now: 1000, deltaMs: 0,
    language: "de", theme: "light", selectedGame: cardTableManifest,
    previousRound: null,
    players: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: "#123456", score: 0, connected: true })),
    roomSettings: { cardTableRuleset: ruleset, cardTableDeck: deck, cardTableHandSize: 12 }
  };
}

for (const ruleset of ["mau-mau", "fischen", "luegen", "free-play"]) {
  test(`${ruleset}: oversized lobby deal leaves equally populated hands`, () => {
    const ctx = context(ruleset, "skat-32");
    const state = serverGame.startRound(serverGame.createInitialState(ctx), ctx);
    const hands = Object.values(state.table.hands);
    assert.ok(hands.every(hand => hand.length > 0));
    if (ruleset !== "fischen") assert.equal(new Set(hands.map(hand => hand.length)).size, 1);
    else assert.ok(hands.every(hand => hand.length <= state.handSize)); // Initial quartets are already laid down.
    const cards = [...hands.flat(), ...state.table.drawPile, ...state.table.discardPile, ...Object.values(state.table.zones).flat()];
    assert.equal(cards.length, 32);
    assert.equal(new Set(cards).size, 32);
    if (ruleset === "mau-mau") assert.equal(state.table.discardPile.length, 1);
  });
}

test("private hand value is sent only to its controller", () => {
  const ctx = context("schwimmen", "skat-32", 2);
  const state = serverGame.startRound(serverGame.createInitialState(ctx), ctx);
  assert.equal(serverGame.toPublicState(state, ctx).privateNote, undefined);
  assert.match(serverGame.toControllerStateForPlayer(state, ctx, "p0").privateNote, /\d/);
});

test("Stichwette advances its own series and retains scores across countdown", () => {
  const ctx = context("stichwette", "stichwette-60", 3);
  ctx.roundNumber = 17;
  let state = serverGame.createInitialState(ctx);
  assert.equal(state.handSize, 1);
  state = { ...state, phase: "finished", gameScores: { p0: 20, p1: -10 } };
  const nextCtx = { ...ctx, roundNumber: 18, previousRound: { gameId: "card-table", state } };
  const intro = serverGame.createInitialState(nextCtx);
  assert.equal(intro.handSize, 2);
  const playing = serverGame.startRound(intro, { ...nextCtx, previousRound: null });
  assert.deepEqual(playing.table, intro.table);
  assert.deepEqual(playing.gameScores, { p0: 20, p1: -10 });
  assert.equal(playing.extra.seriesRound, 2);
  const changed = serverGame.createInitialState({ ...nextCtx, roomSettings: { cardTableRuleset: "herzeln" } });
  assert.equal(changed.extra.seriesRound, 1);
  assert.deepEqual(changed.gameScores, {});
});

test("all result screens expose main menu and the next-round instruction", () => {
  for (const phase of ["result", "scoreboard", "finished"]) {
    const html = roundScreenHtml({ game: { phase }, room: { language: "de" } });
    assert.match(html, /data-card-table-menu/);
    assert.match(html, /nächste Runde/);
  }
});


test("Stichwette starts a fresh series after its full-deck finale", () => {
  const ctx = context("stichwette", "stichwette-60", 3);
  const previous = serverGame.createInitialState(ctx);
  previous.extra.seriesComplete = true;
  previous.extra.seriesRound = 20;
  previous.gameScores = {p0:400};
  const next = serverGame.createInitialState({...ctx, previousRound:{gameId:"card-table",state:previous}});
  assert.equal(next.handSize,1);
  assert.equal(next.extra.seriesRound,1);
  assert.deepEqual(next.gameScores,{});
});
