import assert from "node:assert/strict";
import { test } from "node:test";
import { createCardTable } from "../dist/cards/cardTable.js";
import { resolveCardDeck } from "../dist/cards/deckPresets.js";
import { doppelkopfRuleset as rules } from "../dist/rules/doppelkopf.js";

function fixture() {
  const players = ["anna", "ben", "cara", "david"];
  const deck = resolveCardDeck(rules.defaultDeckId);
  const context = { deck, language: "de", now: 1000, playerNames: Object.fromEntries(players.map(id => [id, id])), playerColors: {}, scores: {}, settings: {}, previousExtra: {} };
  const table = createCardTable({ deck, playerIds: players, handSize: 0 });
  table.hands.anna = Object.values(table.cards).filter(card => card.suitId === "clubs" && card.rankId === "queen").map(card => card.id);
  const state = rules.setupRound({ phase: "playing", rulesetId: rules.id, deckId: deck.id, handSize: 12, table, turnNumber: 0, pendingDraw: 0, drawnThisTurn: 0, wishSuitId: null, log: [], nextLogId: 1, gameOver: false, extra: {}, bots: [], botScores: {}, botReadyAt: null, updatedAt: 1000 }, context);
  return { state, context };
}

test("only the holder of both club queens receives all three choices", () => {
  const { state, context } = fixture();
  const choices = rules.controllerActions(state, context, "anna").filter(a => a.id.startsWith("reserve:wedding-"));
  assert.equal(choices.length, 3);
  assert.ok(choices.every(a => a.enabled));
  assert.ok(!rules.controllerActions(state, context, "ben").some(a => a.id.startsWith("reserve:wedding")));
  assert.equal(rules.runAction(state, context, "ben", "reserve:wedding-suit"), state);
});

for (const choice of ["silent", "suit", "trump"]) {
  test(`wedding ${choice} resolves from reservations`, () => {
    let { state, context } = fixture();
    state = rules.runAction(state, context, "anna", `reserve:wedding-${choice}`);
    for (const id of ["ben", "cara", "david"]) state = rules.runAction(state, context, id, "reserve:healthy");
    assert.equal(state.extra.phase, "play");
    assert.equal(state.extra.gameKind, choice === "silent" ? "normal" : "wedding");
    assert.equal(state.extra.weddingChoice, choice === "silent" ? null : choice);
    if (choice === "silent") {
      assert.equal(state.extra["reserve:anna"], "healthy");
      assert.equal(state.extra["party:anna"], true);
      assert.equal(state.extra["party:ben"], false);
      assert.ok(!JSON.stringify(state.log).includes("Hochzeit"));
    }
  });
}
