import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { drawCards, handOf, moveCard, playCardToDiscard, recycleDiscardPile, toCardFace } from "../cards/cardTable.js";
import type { CardInstance } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableStackState } from "../protocol.js";
import { bestOf } from "../bots/tactics.js";
import { appendLog, clearError, finishGame, playerName, readText, withError, writeExtra, type CardGameState, type CardRuleset, type CardRulesetContext } from "./types.js";

const zonePrefix = "romme-meld-";
const phaseKey = "rommePhase";
const selectedKey = "rommeSelected";
const openedKey = "rommeOpened";
const turnKey = "rommeTurns";
type Meld = { ids: string[]; points: number };

function order(context: CardRulesetContext, card: CardInstance): number {
  return context.deck.ranks.find(rank => rank.id === card.rankId)?.order ?? 0;
}
function points(context: CardRulesetContext, card: CardInstance, aceLow = false): number {
  if (card.rankId === "joker") return 20;
  const value = order(context, card);
  return aceLow && value === 14 ? 1 : Math.min(value, 10) === 10 ? 10 : value;
}
function selected(state: CardGameState): string[] {
  return (readText(state, selectedKey) ?? "").split(",").filter(Boolean);
}
function phase(state: CardGameState): string { return readText(state, phaseKey) ?? "draw"; }
function opened(state: CardGameState, id: string): boolean {
  return (readText(state, openedKey) ?? "").split(",").includes(id);
}
function active(state: CardGameState, id: string): boolean { return state.table.turnOrder[state.table.activeIndex] === id; }
function allMelds(state: CardGameState): string[] {
  return Object.keys(state.table.zones).filter(id => id.startsWith(zonePrefix));
}
function handValue(state: CardGameState, context: CardRulesetContext, playerId: string): number {
  return handOf(state.table, playerId).reduce((sum, id) => sum + points(context, state.table.cards[id]!), 0);
}

/** Return a valid set/sequence and its face value; jokers fill one missing place. */
function meld(ids: string[], state: CardGameState, context: CardRulesetContext): Meld | null {
  if (ids.length < 3) return null;
  const cards = ids.map(id => state.table.cards[id]).filter((c): c is CardInstance => Boolean(c));
  if (cards.length !== ids.length) return null;
  const jokers = cards.filter(card => card.rankId === "joker").length;
  const naturals = cards.filter(card => card.rankId !== "joker");
  if (naturals.length < 2) return null;
  const rankIds = naturals.map(card => order(context, card));
  let result: Meld | null = null;

  // A set has one rank and one card per suit; duplicates from the second deck do not make a set.
  if (new Set(rankIds).size === 1 && new Set(naturals.map(card => card.suitId)).size === naturals.length && ids.length <= 4) {
    result = { ids, points: naturals.reduce((sum, card) => sum + points(context, card), jokers * ((rankIds[0] ?? 0) === 14 ? 11 : Math.min(rankIds[0] ?? 0, 10))) };
  }

  // A run is same-suit, consecutive, and may use ace low or high, never wrap around.
  const suits = new Set(naturals.map(card => card.suitId));
  if (suits.size === 1 && naturals.every(card => card.suitId !== null)) {
    for (const aceValue of [1, 14]) {
      const values = rankIds.map(value => value === 14 ? aceValue : value).sort((a, b) => a - b);
      if (new Set(values).size !== values.length) continue;
      for (let start = 1; start <= 15 - ids.length; start += 1) {
        const sequence = Array.from({ length: ids.length }, (_, index) => start + index);
        if (sequence.some(value => value > 14) || values.some(value => !sequence.includes(value))) continue;
        if (sequence.length - values.length !== jokers) continue;
        result = { ids, points: sequence.reduce((sum, value) => sum + (value === 1 ? 1 : value === 14 ? 11 : Math.min(value, 10)), 0) };
        break;
      }
      if (result) break;
    }
  }
  return result;
}

function jokerTargets(ids: string[], state: CardGameState, context: CardRulesetContext): Array<{ jokerId: string; suitId: string; rankId: string }> {
  const cards = ids.map(id => state.table.cards[id]).filter((card): card is CardInstance => Boolean(card));
  const jokers = cards.filter(card => card.rankId === "joker");
  const natural = cards.filter(card => card.rankId !== "joker");
  if (!jokers.length || natural.length < 2 || !meld(ids, state, context)) return [];
  const targets: Array<{ jokerId: string; suitId: string; rankId: string }> = [];
  const sameRank = natural.every(card => card.rankId === natural[0]!.rankId);
  if (sameRank && new Set(natural.map(card => card.suitId)).size === natural.length && ids.length <= 4) {
    const missing = context.deck.suits.filter(suit => !natural.some(card => card.suitId === suit.id));
    jokers.forEach((joker, index) => { const suit = missing[index]; if (suit) targets.push({ jokerId: joker.id, suitId: suit.id, rankId: natural[0]!.rankId }); });
    return targets;
  }
  const suitId = natural[0]?.suitId;
  if (!suitId || natural.some(card => card.suitId !== suitId)) return [];
  const values = natural.map(card => order(context, card));
  for (const aceValue of [1, 14]) {
    const sorted = values.map(value => value === 14 ? aceValue : value).sort((a, b) => a - b);
    if (new Set(sorted).size !== sorted.length) continue;
    for (let start = 1; start <= 15 - ids.length; start += 1) {
      const sequence = Array.from({ length: ids.length }, (_, index) => start + index);
      if (sequence.some(value => value > 14) || sorted.some(value => !sequence.includes(value)) || sequence.length - sorted.length !== jokers.length) continue;
      const missing = sequence.filter(value => !sorted.includes(value));
      missing.forEach((value, index) => {
        const rank = context.deck.ranks.find(entry => entry.id !== "joker" && entry.order === (value === 1 || value === 14 ? 14 : value));
        const joker = jokers[index];
        if (rank && joker) targets.push({ jokerId: joker.id, suitId, rankId: rank.id });
      });
      if (targets.length === jokers.length) return targets;
      targets.length = 0;
    }
  }
  return [];
}

function meldOptions(ids: string[], state: CardGameState, context: CardRulesetContext): Meld[] {
  const result: Meld[] = [];
  const limit = 1 << ids.length;
  for (let mask = 0; mask < limit; mask += 1) {
    if (popcount(mask) < 3) continue;
    const group = ids.filter((_, index) => mask & (1 << index));
    const value = meld(group, state, context);
    if (value) result.push(value);
  }
  return result.sort((a, b) => b.points - a.points || b.ids.length - a.ids.length);
}
function popcount(n: number): number { let count = 0; while (n) { count += n & 1; n >>>= 1; } return count; }

/** Best disjoint combination of melds, used for first meld and bot planning. */
function bestCombination(ids: string[], state: CardGameState, context: CardRulesetContext): Meld[] {
  const options = meldOptions(ids, state, context);
  let best: Meld[] = [];
  let bestPoints = 0;
  const visit = (start: number, used: Set<string>, chosen: Meld[], total: number) => {
    if (total > bestPoints || total === bestPoints && chosen.reduce((n, item) => n + item.ids.length, 0) > best.reduce((n, item) => n + item.ids.length, 0)) {
      best = chosen;
      bestPoints = total;
    }
    for (let i = start; i < options.length; i += 1) {
      const option = options[i]!;
      if (option.ids.some(id => used.has(id))) continue;
      visit(i + 1, new Set([...used, ...option.ids]), [...chosen, option], total + option.points);
    }
  };
  visit(0, new Set(), [], 0);
  return best;
}

function finishDeal(state: CardGameState, context: CardRulesetContext, winner: string | null): CardGameState {
  const text = context.language === "en" ? "wins the deal." : "gewinnt den Durchgang.";
  const deadwood = new Map(state.table.turnOrder.map(id => [id, handValue(state, context, id)]));
  const scores = state.table.turnOrder.map(id => {
    const delta = winner ? id === winner ? state.table.turnOrder.filter(other => other !== id).reduce((sum, other) => sum + (deadwood.get(other) ?? 0), 0) + 40 : -(deadwood.get(id) ?? 0) : -(deadwood.get(id) ?? 0);
    return { playerId: id, delta, reason: "Rommé" };
  });
  const top = Math.max(...scores.map(score => score.delta));
  const winnerIds = scores.filter(score => score.delta === top).map(score => score.playerId);
  const winners = winnerIds.map(id => playerName(context, id));
  const next = writeExtra(state, { scoreEntries: JSON.stringify(scores), scoreBreakdown: JSON.stringify(scores.map(score => `${playerName(context, score.playerId)}: ${score.delta > 0 ? "+" : ""}${score.delta} (${context.language === "en" ? "hand" : "Hand"}: ${deadwood.get(score.playerId)})`)) });
  return finishGame(next, winnerIds.length === 1 ? winnerIds[0]! : null, winners.join(" & "), winner ? `${playerName(context, winner)} ${text}` : (context.language === "en" ? `Stock exhausted. ${winners.join(" & ")} share the lowest deadwood.` : `Stapel leer. ${winners.join(" & ")} teilen sich den niedrigsten Restwert.`));
}

function drawFromDiscard(tableState: CardGameState["table"], playerId: string): CardGameState["table"] {
  const [id, ...discardPile] = tableState.discardPile;
  if (!id) return tableState;
  const hand = handOf(tableState, playerId);
  return { ...tableState, discardPile, hands: { ...tableState.hands, [playerId]: [...hand, id] } };
}

export const rommeRuleset: CardRuleset = {
  id: "romme",
  label: { de: "Rommé", en: "Rummy" },
  defaultDeckId: "romme-108",
  fixedDeckId: "romme-108",
  defaultHandSize: 13,
  minSeats: 2,
  openStartCard: false,
  turnBased: true,
  handSizeFor: () => 13,
  setupRound(state, context) {
    const leaderIndex = ((context.roundNumber ?? 1) - 1) % state.table.turnOrder.length;
    const leaderId = state.table.turnOrder[leaderIndex]!;
    const [extraCard, ...drawPile] = state.table.drawPile;
    return { ...state, table: { ...state.table, drawPile, discardPile: [], zones: {}, activeIndex: leaderIndex, hands: { ...state.table.hands, [leaderId]: [...handOf(state.table, leaderId), ...(extraCard ? [extraCard] : [])] } }, extra: { ...state.extra, [phaseKey]: "opening-discard", [selectedKey]: "", [openedKey]: "", [turnKey]: 0 } };
  },
  rules(context) {
    return context.language === "en" ? [
      { title: "Goal", lines: ["Be the first to empty your hand by laying valid melds and discarding your last card.", "At the end of a deal, opponents lose the value left in their hands; the player going out earns those points plus 40."] },
      { title: "Cards and deal", lines: ["Two 52-card packs and four jokers (108 cards). Two to six players receive 13 cards; the starting player gets one extra and opens the discard pile.", "The dealer rotates clockwise. Remaining cards form the face-down stock."] },
      { title: "Your turn", lines: ["After the opening discard, draw one card from the stock or take the top discard. Select cards on your phone and lay valid melds; after your first lay, you may also add cards to any meld.", "Finish by discarding a card. A Joker may only be discarded as the final card that ends the deal. If the stock is empty, the discard pile is shuffled back except for its top card."] },
      { title: "Melds", lines: ["A set is three or four cards of the same rank in different suits. A sequence is at least three consecutive cards in one suit.", "Aces are low before 2 or high after King; sequences cannot wrap. Jokers replace one missing card. After opening, exchange a laid Joker for the exact card it represents and take the Joker into your hand.", "Your first lay must total at least 40 points in one or more melds. After that you may lay any valid meld or add to a meld already on the table."] },
      { title: "Scoring", lines: ["Number cards count their number, J/Q/K count 10, aces 11 (1 when used low in a sequence), and jokers 20.", "The first player to meld and discard the final card wins the deal and gets 40 points plus opponents' hand values. Others lose the value remaining in their hand.", "If the stock and discard pile run out, the lowest deadwood wins without the 40-point bonus; everybody loses their own deadwood value. Ties share the result."] }
    ] : [
      { title: "Ziel", lines: ["Leere als erste Person die Hand, indem du gültige Kombinationen auslegst und deine letzte Karte abwirfst.", "Am Durchgangsende verlieren die anderen den Wert ihrer Restkarten; wer ausmacht, erhält diese Punkte plus 40."] },
      { title: "Karten und Austeilen", lines: ["Zwei 52er-Blätter und vier Joker (108 Karten). Zwei bis sechs Personen erhalten 13 Karten; die startende Person bekommt eine Karte mehr und eröffnet die Ablage.", "Der Geber wechselt im Uhrzeigersinn. Die übrigen Karten bilden den verdeckten Nachziehstapel."] },
      { title: "Dein Zug", lines: ["Nach dem ersten Abwurf ziehst du eine Karte vom Nachziehstapel oder nimmst die oberste Ablage. Wähle Karten am Handy und lege gültige Kombinationen aus; nach deiner Erstauslage darfst du auch an jede Auslage anlegen.", "Beende den Zug mit einer Karte auf dem Ablagestapel. Einen Joker darfst du nur als letzte Karte zum Ausmachen abwerfen. Ist der Nachziehstapel leer, wird die Ablage bis auf ihre oberste Karte gemischt zurückgelegt."] },
      { title: "Kombinationen", lines: ["Ein Satz besteht aus drei oder vier Karten gleichen Rangs in verschiedenen Farben. Eine Folge besteht aus mindestens drei aufeinanderfolgenden Karten derselben Farbe.", "Asse zählen niedrig vor der 2 oder hoch nach dem König; Folgen laufen nicht um die Ecke. Joker ersetzen eine fehlende Karte. Nach der Erstauslage darfst du ihn mit der genau passenden Karte tauschen und auf die Hand nehmen.", "Die Erstauslage muss in einem oder mehreren Sätzen und/oder Folgen mindestens 40 Augen zählen. Danach darfst du beliebige gültige Kombinationen auslegen oder bestehende Auslagen ergänzen."] },
      { title: "Wertung", lines: ["Zahlen zählen ihren Wert, Bube/Dame/König je 10, Asse 11 (als niedriges Folge-Ass 1), Joker 20.", "Wer als Erste:r auslegt und die letzte Karte abwirft, erhält 40 Punkte plus die Restwerte der anderen. Die übrigen verlieren den Wert ihrer Handkarten.", "Sind Nachzieh- und Ablagestapel aufgebraucht, gewinnt der niedrigste Restwert ohne 40-Punkte-Bonus; alle ziehen den Wert ihrer Hand ab. Gleichstände teilen das Ergebnis."] }
    ];
  },
  canPlayCard(state, context, playerId, cardId) {
    if (!active(state, playerId) || !["discard", "opening-discard"].includes(phase(state))) return { allowed: false, hint: context.language === "en" ? "Draw and finish melding first." : "Ziehe und beende erst das Auslegen." };
    if (!handOf(state.table, playerId).includes(cardId)) return { allowed: false };
    if (state.table.cards[cardId]?.rankId === "joker" && handOf(state.table, playerId).length > 1) return { allowed: false, hint: context.language === "en" ? "A Joker can only be your final discard." : "Einen Joker darfst du nur als letzte Karte abwerfen." };
    return { allowed: true };
  },
  playCard(state, context, playerId, cardId) {
    const check = rommeRuleset.canPlayCard(state, context, playerId, cardId);
    if (!check.allowed) return withError(state, check.hint ?? "");
    let table = playCardToDiscard(state.table, playerId, cardId);
    const next = { ...state, table, turnNumber: state.turnNumber + 1, drawnThisTurn: 0, updatedAt: context.now };
    if (phase(state) === "opening-discard") {
      table = { ...table, activeIndex: (table.activeIndex + 1) % table.turnOrder.length };
      return writeExtra(appendLog(clearError({ ...next, table }), playerName(context, playerId), context.language === "en" ? "opened the discard pile." : "eröffnet den Ablagestapel."), { [phaseKey]: "draw", [selectedKey]: "" });
    }
    table = { ...table, activeIndex: (table.activeIndex + 1) % table.turnOrder.length };
    const result = writeExtra({ ...next, table }, { [phaseKey]: "draw", [selectedKey]: "", [turnKey]: Number(state.extra[turnKey] ?? 0) + 1 });
    return handOf(table, playerId).length === 0 ? finishDeal(result, context, playerId) : appendLog(clearError(result), playerName(context, playerId), context.language === "en" ? "discarded and ended the turn." : "wirft ab und beendet den Zug.");
  },
  drawCard(state, context, playerId) {
    if (!active(state, playerId) || phase(state) !== "draw") return state;
    let table = state.table;
    if (!table.drawPile.length) table = recycleDiscardPile(table);
    if (!table.drawPile.length) return finishDeal(state, context, null);
    const result = drawCards(table, playerId, 1);
    return writeExtra({ ...state, table: result.state, updatedAt: context.now }, { [phaseKey]: "meld", [selectedKey]: "" });
  },
  runAction(state, context, playerId, actionId) {
    if (!active(state, playerId)) return state;
    if (actionId === "take-discard" && phase(state) === "draw" && state.table.discardPile.length) return writeExtra({ ...state, table: drawFromDiscard(state.table, playerId), updatedAt: context.now }, { [phaseKey]: "meld", [selectedKey]: "" });
    if (phase(state) !== "meld" && phase(state) !== "discard" && phase(state) !== "opening-discard") return state;
    if (actionId.startsWith("select:")) {
      const id = actionId.slice(7);
      if (!handOf(state.table, playerId).includes(id)) return state;
      const current = selected(state);
      const next = current.includes(id) ? current.filter(entry => entry !== id) : [...current, id];
      return writeExtra({ ...state, updatedAt: context.now }, { [selectedKey]: next.join(",") });
    }
    if (actionId === "finish-meld" && phase(state) === "meld") return writeExtra({ ...state, updatedAt: context.now }, { [phaseKey]: "discard", [selectedKey]: "" });
    if (actionId === "lay-selected" && phase(state) === "meld") {
      const ids = selected(state);
      if (!ids.length || ids.some(id => !handOf(state.table, playerId).includes(id))) return state;
      const groups = bestCombination(ids, state, context);
      const total = groups.reduce((sum, group) => sum + group.points, 0);
      if (!groups.length || groups.reduce((sum, group) => sum + group.ids.length, 0) !== ids.length) return withError(state, context.language === "en" ? "Those cards do not form complete melds." : "Diese Karten ergeben keine vollständigen Kombinationen.");
      if (!opened(state, playerId) && total < 40) return withError(state, context.language === "en" ? "Your first meld must total 40 points." : "Deine Erstauslage muss 40 Augen erreichen.");
      if (handOf(state.table, playerId).length - ids.length < 1) return withError(state, context.language === "en" ? "Keep one card to discard." : "Behalte eine Karte zum Abwerfen.");
      let table = state.table;
      for (const group of groups) {
        const zoneId = `${zonePrefix}${Object.keys(table.zones).filter(key => key.startsWith(zonePrefix)).length + 1}`;
        table = { ...table, zones: { ...table.zones, [zoneId]: [] } };
        for (const id of group.ids) table = moveCard(table, id, { kind: "zone", zoneId }, "bottom");
      }
      return writeExtra(appendLog(clearError({ ...state, table, updatedAt: context.now }), playerName(context, playerId), context.language === "en" ? `laid ${groups.length} meld${groups.length === 1 ? "" : "s"}.` : `legt ${groups.length} Kombination${groups.length === 1 ? "" : "en"} aus.`), { [openedKey]: [...new Set([...readText(state, openedKey)?.split(",").filter(Boolean) ?? [], playerId])].join(","), [selectedKey]: "", [phaseKey]: "discard" });
    }
    if (actionId.startsWith("add:" ) && phase(state) === "meld" && opened(state, playerId)) {
      const index = Number(actionId.slice(4)); const zoneId = allMelds(state)[index]; const ids = selected(state);
      if (!zoneId || !ids.length || ids.some(id => !handOf(state.table, playerId).includes(id))) return state;
      const combined = [...(state.table.zones[zoneId] ?? []), ...ids];
      if (!meld(combined, state, context)) return withError(state, context.language === "en" ? "Those cards do not extend that meld." : "Diese Karten ergänzen die Auslage nicht gültig.");
      if (handOf(state.table, playerId).length - ids.length < 1) return withError(state, context.language === "en" ? "Keep one card to discard." : "Behalte eine Karte zum Abwerfen.");
      let table = state.table; for (const id of ids) table = moveCard(table, id, { kind: "zone", zoneId }, "bottom");
      return writeExtra({ ...state, table, updatedAt: context.now }, { [selectedKey]: "", [phaseKey]: "discard" });
    }
    if (actionId.startsWith("replace:") && phase(state) === "meld" && opened(state, playerId)) {
      const zoneId = allMelds(state)[Number(actionId.slice(8))];
      const ids = selected(state);
      if (!zoneId || ids.length !== 1 || !handOf(state.table, playerId).includes(ids[0]!)) return state;
      const substitute = jokerTargets(state.table.zones[zoneId] ?? [], state, context).find(item => item.suitId === state.table.cards[ids[0]!]?.suitId && item.rankId === state.table.cards[ids[0]!]?.rankId);
      if (!substitute) return withError(state, context.language === "en" ? "That card does not replace a Joker there." : "Diese Karte ersetzt dort keinen Joker.");
      let table = moveCard(state.table, ids[0]!, { kind: "zone", zoneId }, "bottom");
      table = moveCard(table, substitute.jokerId, { kind: "hand", playerId }, "bottom");
      return writeExtra({ ...state, table, updatedAt: context.now }, { [selectedKey]: "" });
    }
    if (actionId === "discard-selected" && (phase(state) === "discard" || phase(state) === "opening-discard")) {
      const ids = selected(state); if (ids.length !== 1) return state;
      return rommeRuleset.playCard(state, context, playerId, ids[0]!);
    }
    return state;
  },
  controllerActions(state, context, playerId): CardTableActionState[] {
    if (state.gameOver || state.phase !== "playing") return [];
    const isTurn = active(state, playerId); const current = selected(state);
    if (phase(state) === "draw") return [
      { id: "draw", label: context.language === "en" ? "Draw from stock → hand" : "Vom Nachziehstapel → Hand", kind: "primary", enabled: isTurn && state.table.drawPile.length > 0 },
      { id: "take-discard", label: context.language === "en" ? "Take top discard → hand" : "Oberste Ablage → Hand", kind: "secondary", enabled: isTurn && state.table.discardPile.length > 0 }
    ];
    const cards = handOf(state.table, playerId).map(id => ({ id: `select:${id}`, label: `${current.includes(id) ? "✓ " : ""}${toCardFace(context.deck, state.table.cards[id]!).rankLabel} ${toCardFace(context.deck, state.table.cards[id]!).suitSymbol}`, kind: "secondary" as const, enabled: isTurn }));
    if (phase(state) === "discard" || phase(state) === "opening-discard") return [...cards, { id: "discard-selected", label: phase(state) === "opening-discard" ? (context.language === "en" ? "Selected card → discard pile (start)" : "Ausgewählte Karte → Ablage eröffnen") : (context.language === "en" ? "Selected card → discard pile" : "Ausgewählte Karte → Ablagestapel"), kind: "primary", enabled: isTurn && current.length === 1 && (state.table.cards[current[0]!]?.rankId !== "joker" || handOf(state.table, playerId).length === 1) }];
    return [...cards,
      { id: "lay-selected", label: context.language === "en" ? "Lay melds → table center" : "Kombination(en) → Tischmitte", kind: "primary", enabled: isTurn && current.length >= 3 },
      { id: "finish-meld", label: context.language === "en" ? "Finish laying → discard a card" : "Auslegen beenden → Karte abwerfen", kind: "secondary", enabled: isTurn },
      ...allMelds(state).flatMap((zoneId, index) => {
        const canReplace = current.length === 1 && jokerTargets(state.table.zones[zoneId] ?? [], state, context).some(item => item.suitId === state.table.cards[current[0]!]?.suitId && item.rankId === state.table.cards[current[0]!]?.rankId);
        return [
          { id: `add:${index}`, label: context.language === "en" ? `Add to table meld ${index + 1}` : `An Tisch-Auslage ${index + 1} anlegen`, kind: "secondary" as const, enabled: isTurn && opened(state, playerId) && current.length > 0 },
          ...(canReplace ? [{ id: `replace:${index}`, label: context.language === "en" ? `Replace Joker in table meld ${index + 1}` : `Joker in Tisch-Auslage ${index + 1} tauschen`, kind: "secondary" as const, enabled: isTurn && opened(state, playerId) }] : [])
        ];
      })
    ];
  },
  hostActions() { return []; },
  runHostAction(state) { return state; },
  choiceForCard() { return undefined; },
  tableStacks(state, context): CardTableStackState[] {
    const faces = (ids: string[]) => ids.map(id => state.table.cards[id]).filter((card): card is CardInstance => Boolean(card)).map(card => toCardFace(context.deck, card));
    const stacks: CardTableStackState[] = [
      { id: "romme-stock", label: context.language === "en" ? "Stock" : "Nachziehstapel", kind: "draw", count: state.table.drawPile.length, cards: [], faceDown: true },
      { id: "romme-discard", label: context.language === "en" ? "Discard" : "Ablage", kind: "discard", count: state.table.discardPile.length, cards: faces(state.table.discardPile.slice(0, 3)), faceDown: false }
    ];
    for (const id of allMelds(state)) stacks.push({ id, label: `${context.language === "en" ? "Meld" : "Auslage"} ${id.slice(zonePrefix.length)}`, kind: "zone", count: state.table.zones[id]!.length, cards: faces(state.table.zones[id]!), faceDown: false, layout: "spread", capacity: 14 });
    return stacks;
  },
  introMessage(context) { return context.language === "en" ? "Draw one, make melds, discard one." : "Ziehe eine Karte, lege Kombinationen aus und wirf eine ab."; },
  condition(state, context) { return { label: phase(state) === "draw" ? (context.language === "en" ? "Draw" : "Ziehen") : phase(state) === "discard" ? (context.language === "en" ? "Discard" : "Abwerfen") : (context.language === "en" ? "Meld or lay" : "Auslegen"), symbol: "◆" }; },
  privateNote(state, context, playerId) { const count = selected(state).filter(id => handOf(state.table, playerId).includes(id)).length; return `${context.language === "en" ? "Hand" : "Hand"}: ${handOf(state.table, playerId).length} · ${context.language === "en" ? "Selected" : "Markiert"}: ${count}${!opened(state, playerId) ? (context.language === "en" ? " · First meld 40" : " · Erstauslage 40") : ""}`; },
  seatStatus(state, context, playerId) { return `${handOf(state.table, playerId).length} ${context.language === "en" ? "cards" : "Karten"}${opened(state, playerId) ? " · ✓" : ""}`; },
  isFinished(state) { return state.gameOver; },
  buildScore(state) {
    if (typeof state.extra.scoreEntries === "string") {
      try { return JSON.parse(state.extra.scoreEntries) as ScoreEntry[]; } catch { /* falls back to zero until a valid result exists */ }
    }
    return state.table.turnOrder.map(playerId => ({ playerId, delta: 0, reason: "Rommé" }));
  },
  botMove(state, context, playerId) {
    if (!active(state, playerId)) return { kind: "wait" };
    const hand = handOf(state.table, playerId);
    if (phase(state) === "draw") {
      const top = state.table.cards[state.table.discardPile[0] ?? ""];
      const neighbor = top && hand.some(id => { const card = state.table.cards[id]!; return card.suitId === top.suitId && Math.abs(order(context, card) - order(context, top)) === 1 || card.rankId === top.rankId; });
      return neighbor ? { kind: "action", actionId: "take-discard" } : { kind: "draw" };
    }
    if (phase(state) === "meld") {
      const combination = bestCombination(hand, state, context);
      const viable = opened(state, playerId) || combination.reduce((sum, group) => sum + group.points, 0) >= 40;
      const ids = viable ? combination.flatMap(group => group.ids) : [];
      const target = new Set(ids); const current = new Set(selected(state));
      const mismatch = [...new Set([...target, ...current])].filter(id => target.has(id) !== current.has(id));
      if (mismatch.length) return { kind: "action", actionId: `select:${mismatch[0]}` };
      if (ids.length) return { kind: "action", actionId: "lay-selected" };
      if (current.size) return { kind: "action", actionId: `select:${current.values().next().value as string}` };
      return { kind: "action", actionId: "finish-meld" };
    }
    const id = bestOf(hand.filter(cardId => state.table.cards[cardId]?.rankId !== "joker" || hand.length === 1), cardId => points(context, state.table.cards[cardId]!));
    if (!id) return { kind: "wait" };
    if (!selected(state).includes(id)) return { kind: "action", actionId: `select:${id}` };
    return { kind: "action", actionId: "discard-selected" };
  }
};
