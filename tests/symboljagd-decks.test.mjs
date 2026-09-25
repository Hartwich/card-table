import assert from "node:assert/strict";
import { test } from "node:test";
import { symboljagd57Deck, symboljagd73Deck, symboljagd91Deck, symboljagdSymbols } from "../dist/cards/deckPresets.js";
import { symboljagdRuleset } from "../dist/rules/symboljagd.js";

test("Symboljagd decks have the requested size and exactly one shared symbol per card pair", () => {
  assert.equal(symboljagdSymbols.length, 91);
  assert.equal(new Set(symboljagdSymbols).size, 91, "every symbol has its own identity");
  assert.equal(symboljagdRuleset.deckIdFor({}), "symboljagd-57");
  assert.equal(symboljagdRuleset.deckIdFor({ cardTableSymboljagdSymbolsPerCard: "9" }), "symboljagd-73");
  assert.equal(symboljagdRuleset.deckIdFor({ cardTableSymboljagdSymbolsPerCard: "10" }), "symboljagd-91");

  for (const [deck, order] of [[symboljagd57Deck, 7], [symboljagd73Deck, 8], [symboljagd91Deck, 9]]) {
    const expectedCards = order * order + order + 1;
    assert.equal(deck.cards.length, expectedCards, `${deck.id} card count`);

    const cards = deck.cards.map((card) => new Set(card.tags.filter((tag) => tag.startsWith("sym:")).map((tag) => tag.slice(4))));
    assert.ok(cards.every((symbols) => symbols.size === order + 1), `${deck.id} symbols per card`);

    for (let left = 0; left < cards.length; left += 1) {
      for (let right = left + 1; right < cards.length; right += 1) {
        const shared = [...cards[left]].filter((symbol) => cards[right].has(symbol));
        assert.equal(shared.length, 1, `${deck.id}: cards ${left + 1} and ${right + 1}`);
      }
    }
  }
});
