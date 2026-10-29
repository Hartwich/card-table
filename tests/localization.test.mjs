import assert from "node:assert/strict";
import { test } from "node:test";
import { localizeDeck } from "../dist/cards/localization.js";
import { french52Deck, peter49Deck } from "../dist/cards/deckPresets.js";

test("English card faces localize suit/rank labels without changing card IDs or ranks", () => {
  const french = localizeDeck(french52Deck, "en");
  assert.equal(french.suits.find(suit => suit.id === "spades").label, "Spades");
  assert.equal(french.ranks.find(rank => rank.id === "queen").label, "Q");
  assert.deepEqual(french.cards, french52Deck.cards);
  assert.equal(localizeDeck(french52Deck, "de"), french52Deck);
  assert.equal(localizeDeck(peter49Deck, "en").ranks.find(rank => rank.id === "peter").centerLabel, "OLD MAID");
});
