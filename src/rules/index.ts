import { elferRausRuleset } from "./elferRaus.js";
import { freePlayRuleset } from "./freePlay.js";
import { mauMauRuleset } from "./mauMau.js";
import { schwimmenRuleset } from "./schwimmen.js";
import { wizardRuleset } from "./wizard.js";
import type { CardRuleset } from "./types.js";

export * from "./types.js";
export { freePlayRuleset } from "./freePlay.js";
export { mauMauRuleset, mauMauRules } from "./mauMau.js";
export { schwimmenRuleset, schwimmenHandValue } from "./schwimmen.js";
export { wizardRuleset } from "./wizard.js";
export { elferRausRuleset } from "./elferRaus.js";

/** Alle verfügbaren Regelwerke. Ein neues Kartenspiel wird hier eingetragen. */
export const cardRulesets: CardRuleset[] = [
  mauMauRuleset,
  schwimmenRuleset,
  wizardRuleset,
  elferRausRuleset,
  freePlayRuleset
];

export const defaultCardRulesetId = mauMauRuleset.id;

export function resolveCardRuleset(rulesetId: string | null | undefined): CardRuleset {
  return cardRulesets.find((ruleset) => ruleset.id === rulesetId) ?? mauMauRuleset;
}
