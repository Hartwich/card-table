import { advanceTurn } from "../cards/cardTable.js";
import { appendLog, type CardBotIntent, type CardGameState, type CardRuleset, type CardRulesetContext } from "../rules/types.js";
import { fallbackBotMove } from "./fallback.js";
import { isBotId } from "./botSeats.js";

/**
 * Antrieb der KI-Spieler.
 *
 * Der Antrieb entscheidet nichts über das Spiel. Er stellt nur fest, wann ein
 * Bot dran ist, wartet eine sichtbare Denkpause ab und schickt die Absicht des
 * Regelwerks anschließend durch genau dieselben Pfade wie den Input eines
 * echten Spielers. Ein Bot kann damit nicht an den Regeln vorbeispielen.
 */

/** Denkpause vor jedem KI-Zug, damit man am Tisch mitlesen kann. */
export const botThinkDelayMs = 1_200;

function withReadyAt(state: CardGameState, readyAt: number | null): CardGameState {
  return state.botReadyAt === readyAt ? state : { ...state, botReadyAt: readyAt };
}

function applyIntent(
  state: CardGameState,
  ruleset: CardRuleset,
  context: CardRulesetContext,
  playerId: string,
  intent: CardBotIntent
): CardGameState {
  switch (intent.kind) {
    case "play":
      return ruleset.playCard(state, context, playerId, intent.cardId, intent.choiceId);
    case "draw":
      return ruleset.drawCard(state, context, playerId);
    case "action":
      return ruleset.runAction(state, context, playerId, intent.actionId);
    default:
      return state;
  }
}

function moveFor(
  state: CardGameState,
  ruleset: CardRuleset,
  context: CardRulesetContext,
  playerId: string,
  mayImprovise: boolean
): CardBotIntent {
  const own = ruleset.botMove?.(state, context, playerId);

  if (own && own.kind !== "wait") {
    return own;
  }

  // Sagt das Regelwerk ausdrücklich "warten", bleibt es dabei. Und wer nicht
  // handeln darf, bekommt auch keinen generischen Zug untergeschoben - der
  // würde sonst Karten legen, die gar nicht an der Reihe sind.
  if (own || !mayImprovise) {
    return { kind: "wait" };
  }

  return fallbackBotMove(state, ruleset, context, playerId);
}

/** Sackgasse: Der Bot findet nichts, das den Zustand bewegt. */
function forceProgress(
  state: CardGameState,
  ruleset: CardRuleset,
  context: CardRulesetContext
): CardGameState {
  if (!ruleset.turnBased || state.table.turnOrder.length < 2) {
    return withReadyAt(state, null);
  }

  return withReadyAt(
    appendLog(
      {
        ...state,
        table: advanceTurn(state.table),
        drawnThisTurn: 0,
        turnNumber: state.turnNumber + 1,
        lastError: undefined,
        updatedAt: context.now
      },
      null,
      context.language === "en" ? "Skipped an AI turn." : "KI-Zug übersprungen."
    ),
    null
  );
}

/**
 * Ein Tick des Bot-Antriebs. Gibt den unveränderten Zustand zurück, solange
 * kein Bot dran ist oder die Denkpause noch läuft.
 */
export function driveBots(
  state: CardGameState,
  ruleset: CardRuleset,
  context: CardRulesetContext
): CardGameState {
  if (state.bots.length === 0 || state.gameOver || state.phase !== "playing") {
    return withReadyAt(state, null);
  }

  const activeId = state.table.turnOrder[state.table.activeIndex] ?? null;
  const candidates: Array<{ playerId: string; mayImprovise: boolean }> = [];

  if (activeId && isBotId(activeId)) {
    candidates.push({ playerId: activeId, mayImprovise: true });
  }

  // Ohne Zugreihenfolge darf jeder jederzeit handeln; sonst nur, wenn das
  // Regelwerk Zwischenrufe kennt - etwa das Zweifeln bei Lügen.
  if (!ruleset.turnBased || ruleset.botActsOutOfTurn) {
    for (const bot of state.bots) {
      if (bot.id !== activeId && state.table.turnOrder.includes(bot.id)) {
        candidates.push({ playerId: bot.id, mayImprovise: !ruleset.turnBased });
      }
    }
  }

  for (const candidate of candidates) {
    const intent = moveFor(state, ruleset, context, candidate.playerId, candidate.mayImprovise);

    if (intent.kind === "wait") {
      continue;
    }

    if (state.botReadyAt === null) {
      return { ...state, botReadyAt: context.now + botThinkDelayMs };
    }

    if (context.now < state.botReadyAt) {
      return state;
    }

    const next = applyIntent(state, ruleset, context, candidate.playerId, intent);

    if (next !== state) {
      return withReadyAt(next, null);
    }

    return forceProgress(state, ruleset, context);
  }

  return withReadyAt(state, null);
}
