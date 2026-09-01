import { doppelkopfRuleset } from "./doppelkopf.js";
import { fischenRuleset } from "./fischen.js";
import { freePlayRuleset } from "./freePlay.js";
import { herzelnRuleset } from "./herzeln.js";
import { luegenRuleset } from "./luegen.js";
import { mauMauRuleset } from "./mauMau.js";
import { schwarzerPeterRuleset } from "./schwarzerPeter.js";
import { schwimmenRuleset } from "./schwimmen.js";
import { trickBetRuleset } from "./stichwette.js";
import { numberRowsRuleset } from "./zahlenreihe.js";
import type { CardRuleset } from "./types.js";

export * from "./types.js";
export { freePlayRuleset } from "./freePlay.js";
export { mauMauRuleset, mauMauRules } from "./mauMau.js";
export { schwimmenRuleset, schwimmenHandValue } from "./schwimmen.js";
export { trickBetRuleset } from "./stichwette.js";
export { numberRowsRuleset } from "./zahlenreihe.js";
export { luegenRuleset } from "./luegen.js";
export { schwarzerPeterRuleset } from "./schwarzerPeter.js";
export { fischenRuleset } from "./fischen.js";
export { herzelnRuleset } from "./herzeln.js";
export { doppelkopfRuleset, isDoppelkopfTrump } from "./doppelkopf.js";

/** Alle verfügbaren Regelwerke. Ein neues Kartenspiel wird hier eingetragen. */
export const cardRulesets: CardRuleset[] = [
  mauMauRuleset,
  schwimmenRuleset,
  trickBetRuleset,
  numberRowsRuleset,
  luegenRuleset,
  schwarzerPeterRuleset,
  fischenRuleset,
  herzelnRuleset,
  doppelkopfRuleset,
  freePlayRuleset
];

export const defaultCardRulesetId = mauMauRuleset.id;

export function resolveCardRuleset(rulesetId: string | null | undefined): CardRuleset {
  return cardRulesets.find((ruleset) => ruleset.id === rulesetId) ?? mauMauRuleset;
}
