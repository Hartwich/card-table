import { handOf } from "../cards/cardTable.js";
import type { CardTableChoiceState } from "../protocol.js";
import type {
  CardBotIntent,
  CardGameState,
  CardRuleset,
  CardRulesetContext
} from "../rules/types.js";

/**
 * Der generische Bot.
 *
 * Er kennt keine einzige Regel, sondern fragt das Regelwerk: Welche Karte darf
 * ich legen, welche Aktionen sind gerade freigeschaltet? Damit spielt er in
 * jedem Kartenspiel regelkonform - aber ohne Plan. Regelwerke mit eigenem
 * `botMove` übernehmen die Taktik selbst; dieser Fallback greift nur, wo noch
 * keine steht.
 */

export function pickRandom<T>(entries: readonly T[]): T | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  return entries[Math.floor(Math.random() * entries.length)];
}

/** Spielbare Handkarten eines Spielers, in Handreihenfolge. */
export function playableCardIds(
  state: CardGameState,
  ruleset: CardRuleset,
  context: CardRulesetContext,
  playerId: string
): string[] {
  return handOf(state.table, playerId).filter(
    (cardId) => ruleset.canPlayCard(state, context, playerId, cardId).allowed
  );
}

/**
 * Beantwortet eine Rückfrage vor dem Legen. Trifft eine Option eine Farbe, die
 * der Bot auf der Hand hat, nimmt er die häufigste - so wünscht sich ein Bube
 * in Mau-Mau nichts, was der Bot selbst nicht bedienen kann.
 */
export function answerChoice(
  state: CardGameState,
  choice: CardTableChoiceState,
  playerId: string
): string | undefined {
  const counts = new Map<string, number>();

  for (const cardId of handOf(state.table, playerId)) {
    const suitId = state.table.cards[cardId]?.suitId;

    if (suitId) {
      counts.set(suitId, (counts.get(suitId) ?? 0) + 1);
    }
  }

  const ranked = [...choice.options].sort(
    (left, right) => (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0)
  );
  const best = ranked[0];

  if (best && (counts.get(best.id) ?? 0) > 0) {
    return best.id;
  }

  return pickRandom(choice.options)?.id;
}

/** Legt eine Karte inklusive Antwort auf eine mögliche Rückfrage. */
export function playIntent(
  state: CardGameState,
  ruleset: CardRuleset,
  context: CardRulesetContext,
  playerId: string,
  cardId: string
): CardBotIntent {
  const choice = ruleset.choiceForCard(state, context, cardId);

  return {
    kind: "play",
    cardId,
    choiceId: choice ? answerChoice(state, choice, playerId) : undefined
  };
}

export function fallbackBotMove(
  state: CardGameState,
  ruleset: CardRuleset,
  context: CardRulesetContext,
  playerId: string
): CardBotIntent {
  const playable = playableCardIds(state, ruleset, context, playerId);
  const cardId = pickRandom(playable);

  if (cardId) {
    return playIntent(state, ruleset, context, playerId, cardId);
  }

  const actions = ruleset
    .controllerActions(state, context, playerId)
    .filter((action) => action.enabled);

  if (actions.some((action) => action.id === "draw")) {
    return { kind: "draw" };
  }

  const fallbackAction = actions[0];

  return fallbackAction ? { kind: "action", actionId: fallbackAction.id } : { kind: "wait" };
}
