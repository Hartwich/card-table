import type { ScoreEntry } from "@open-party-lab/game-core";
import type { CardTableActionState, CardTableChoiceState } from "../protocol.js";
import { handOf, moveCard, toCardFaces } from "../cards/cardTable.js";
import { finishGame, playerName, type CardGameState, type CardRuleset } from "./types.js";
import type { CardTableStackState } from "../protocol.js";

const centerZone = "symboljagd-center";
const lastChallengeKey = "symboljagdLastChallenge";
const lastSolvedAtKey = "symboljagdLastSolvedAt";
const feedbackKeys = {
  playerId: "symboljagdFeedbackPlayerId",
  playerName: "symboljagdFeedbackPlayerName",
  symbolId: "symboljagdFeedbackSymbolId",
  occurredAt: "symboljagdFeedbackOccurredAt"
} as const;
const blockedKey = (playerId: string) => `symboljagdBlocked:${playerId}`;
const names = ["Fuchs", "Eule", "Schlüssel", "Mond", "Sonne", "Kaktus", "Drache", "Apfel", "Pilz", "Anker", "Teekanne", "Krone", "Feder", "Fisch", "Karotte", "Geist", "Spinne", "Schmetterling", "Schneeflocke", "Blitz", "Herz", "Kleeblatt", "Kerze", "Sanduhr", "Kompass", "Fernrohr", "Brille", "Hammer", "Geige", "Zauberstab", "Zaubertrank", "Kristallkugel", "Luftballon", "Papierboot", "Schildkröte", "Katze", "Hund", "Biene", "Marienkäfer", "Orange", "Käse", "Eiswaffel", "Zylinder", "Ring", "Glocke", "Regenschirm", "Segelboot", "Leuchtturm", "Diamant", "Perle", "Muschel", "Planet", "Sternschnuppe", "Phönixfeder", "Burg", "Frosch", "Blaue Flamme", "Akkordeon", "Feuerwehrauto", "Fahrrad", "Kamera", "Cupcake", "Fußball", "Rollschuh", "Gießkanne", "Farbpalette", "Pokal", "Faltkarte", "Rucksack", "Trommel", "Garnspule", "Leitkegel", "Gartenschlauch", "Wecker", "Fäustling", "Gummistiefel", "Zug", "Flamingo-Schwimmring", "Schachturm", "Theatermaske", "Bücherstapel", "Vase", "Jo-Jo", "Boxhandschuh", "Schaukelpferd", "Koffer", "Glasmurmel", "Farbroller", "Ampel", "Radio", "Lupe"];
const namesEn = ["Fox", "Owl", "Key", "Moon", "Sun", "Cactus", "Dragon", "Apple", "Mushroom", "Anchor", "Teapot", "Crown", "Feather", "Fish", "Carrot", "Ghost", "Spider", "Butterfly", "Snowflake", "Lightning", "Heart", "Clover", "Candle", "Hourglass", "Compass", "Telescope", "Glasses", "Hammer", "Violin", "Wand", "Potion", "Crystal ball", "Balloon", "Paper boat", "Turtle", "Cat", "Dog", "Bee", "Ladybug", "Orange", "Cheese", "Ice cream", "Top hat", "Ring", "Bell", "Umbrella", "Sailboat", "Lighthouse", "Diamond", "Pearl", "Seashell", "Planet", "Shooting star", "Phoenix feather", "Castle", "Frog", "Blue flame", "Accordion", "Fire truck", "Bicycle", "Camera", "Cupcake", "Soccer ball", "Roller skate", "Watering can", "Paint palette", "Trophy", "Folded map", "Backpack", "Drum", "Sewing spool", "Traffic cone", "Garden hose", "Alarm clock", "Mitten", "Rubber boot", "Train", "Flamingo float", "Chess rook", "Opera mask", "Books", "Vase", "Yo-yo", "Boxing glove", "Rocking horse", "Suitcase", "Glass marble", "Paint roller", "Traffic light", "Radio", "Magnifying glass"];

function symbols(state: Parameters<CardRuleset["choiceForCard"]>[0], cardId: string): string[] {
  return state.table.cards[cardId]?.tags.filter((tag) => tag.startsWith("sym:")).map((tag) => tag.slice(4)) ?? [];
}

function centerCardId(state: Parameters<CardRuleset["choiceForCard"]>[0]): string | undefined {
  return state.table.zones[centerZone]?.[0];
}

function blockedUntil(state: Parameters<CardRuleset["choiceForCard"]>[0], playerId: string): number {
  const value = state.extra[blockedKey(playerId)];
  return typeof value === "number" ? value : 0;
}

export const symboljagdRuleset: CardRuleset = {
  id: "symboljagd",
  label: { de: "Symboljagd", en: "Symbol Hunt" },
  defaultDeckId: "symboljagd-57",
  deckIdFor(settings) {
    const symbolsPerCard = Number(settings.cardTableSymboljagdSymbolsPerCard ?? 8);
    return symbolsPerCard === 10 ? "symboljagd-91" : symbolsPerCard === 9 ? "symboljagd-73" : "symboljagd-57";
  },
  defaultHandSize: 9,
  controllerHandLimit: 1,
  openStartCard: false,
  turnBased: false,
  minSeats: 2,
  handSizeFor({ playerCount, deckCards }) {
    return Math.max(1, Math.floor((deckCards - 1) / Math.max(1, playerCount)));
  },
  setupRound(state) {
    const shuffled = [
      ...state.table.turnOrder.flatMap((id) => state.table.hands[id] ?? []),
      ...state.table.drawPile,
      ...state.table.discardPile
    ];
    const center = shuffled.shift();
    const hands: Record<string, string[]> = Object.fromEntries(state.table.turnOrder.map((id) => [id, []]));
    shuffled.forEach((id, index) => {
      const playerId = state.table.turnOrder[index % state.table.turnOrder.length];
      if (playerId) hands[playerId]?.push(id);
    });
    return {
      ...state,
      table: {
        ...state.table,
        hands,
        drawPile: [],
        discardPile: [],
        zones: { ...state.table.zones, [centerZone]: center ? [center] : [], "symboljagd-history": [] }
      },
      extra: { ...state.extra, symboljagdLastChallenge: "", symboljagdLastSolvedAt: 0 }
    };
  },
  introMessage(context) {
    return context.language === "en"
      ? "Find the matching picture on your card and the center card. Tap that picture right on your card."
      : "Finde das gemeinsame Bild auf deiner Karte und der Mitte. Tippe das Bild direkt auf deiner Karte an.";
  },
  rules(context) {
    return context.language === "en" ? [
      { title: "Goal", lines: ["Be the first to play all your cards."] },
      { title: "How to play", lines: ["Everyone plays at once. Compare your top card with the center card: exactly one picture matches.", "Tap the matching picture directly on your card. A correct answer puts your card in the center and reveals your next card.", "A wrong answer locks you for 7 seconds, or until any player solves the current card.", "If another player solves the card first, a correct or mistaken tap from the old card within 2 seconds is treated as a near-simultaneous attempt and carries no penalty."] }
    ] : [
      { title: "Ziel", lines: ["Lege als Erste oder Erster alle eigenen Karten ab."] },
      { title: "Ablauf", lines: ["Alle spielen gleichzeitig. Vergleiche deine Karte mit der Karte in der Mitte: Genau ein Bild ist gleich.", "Tippe das passende Bild direkt auf deiner Karte an. Bei einem Treffer kommt deine Karte in die Mitte und deine nächste Karte wird aufgedeckt.", "Ein falscher Tipp sperrt dich 7 Sekunden oder bis jemand die aktuelle Karte löst.", "Löst jemand die Karte zuerst, zählt ein Klick auf die alte Karte innerhalb von 2 Sekunden als nahezu gleichzeitiger Versuch und wird nicht bestraft."] }
    ];
  },
  canPlayCard(state, context, playerId, cardId) {
    const hand = handOf(state.table, playerId);
    if (state.gameOver || state.phase !== "playing" || hand[0] !== cardId) return { allowed: false };
    if (blockedUntil(state, playerId) > context.now) return { allowed: false, hint: context.language === "en" ? "You are briefly locked out." : "Du bist kurz gesperrt." };
    return { allowed: true };
  },
  tableStacks(state, context): CardTableStackState[] {
    const cards = state.table.zones[centerZone] ?? [];
    return [{ id: centerZone, label: context.language === "en" ? "Center" : "Mitte", kind: "zone", count: cards.length, cards: toCardFaces(context.deck, state.table, cards), faceDown: false }];
  },
  playCard(state, context, playerId, cardId, choiceId) {
    const hand = handOf(state.table, playerId);
    if (hand[0] !== cardId || state.gameOver || state.phase !== "playing") return state;
    const centerId = centerCardId(state);
    if (!centerId || !choiceId) return state;
    const ownSymbols = symbols(state, cardId);
    const shared = ownSymbols.filter((symbol) => symbols(state, centerId).includes(symbol));
    const [challengeId, symbolId] = choiceId.split("|");
    const staleChallenge = challengeId !== centerId;
    const solvedAt = typeof state.extra[lastSolvedAtKey] === "number" ? state.extra[lastSolvedAtKey] as number : 0;
    if (staleChallenge) return state.extra[lastChallengeKey] === challengeId && context.now - solvedAt <= 2_000 ? state : state;
    if (blockedUntil(state, playerId) > context.now) return state;

    if (!ownSymbols.includes(symbolId!) || shared[0] !== symbolId) {
      return {
        ...state,
        extra: { ...state.extra, [blockedKey(playerId)]: context.now + 7_000 },
        updatedAt: context.now,
        message: context.language === "en" ? `${playerName(context, playerId)} picked the wrong picture.` : `${playerName(context, playerId)} hat das falsche Bild gewählt.`
      };
    }

    let table = moveCard(state.table, centerId, { kind: "zone", zoneId: "symboljagd-history" });
    table = moveCard(table, cardId, { kind: "zone", zoneId: centerZone });
    const extra: CardGameState["extra"] = {
      ...state.extra,
      [lastChallengeKey]: centerId,
      [lastSolvedAtKey]: context.now,
      [feedbackKeys.playerId]: playerId,
      [feedbackKeys.playerName]: playerName(context, playerId),
      [feedbackKeys.symbolId]: symbolId,
      [feedbackKeys.occurredAt]: context.now
    };
    for (const id of table.turnOrder) extra[blockedKey(id)] = 0;
    const next = { ...state, table, extra, updatedAt: context.now, message: `${playerName(context, playerId)}: ${names[Number(symbolId)] ?? symbolId}` };
    const remaining = handOf(table, playerId).length;
    return remaining === 0
      ? finishGame(next, playerId, playerName(context, playerId), context.language === "en" ? `${playerName(context, playerId)} wins!` : `${playerName(context, playerId)} gewinnt!`)
      : next;
  },
  drawCard(state) { return state; },
  runAction(state) { return state; },
  controllerActions(): CardTableActionState[] { return []; },
  hostActions(): CardTableActionState[] { return []; },
  runHostAction(state) { return state; },
  choiceForCard(state, context, cardId): CardTableChoiceState | undefined {
    const playerId = Object.entries(state.table.hands).find(([, cards]) => cards[0] === cardId)?.[0];
    const centerId = centerCardId(state);
    if (!playerId || !centerId || !symboljagdRuleset.canPlayCard(state, context, playerId, cardId).allowed) return undefined;
    return {
      id: `symboljagd:${centerId}`,
      label: context.language === "en" ? "Tap the matching picture" : "Tippe das passende Bild",
      options: symbols(state, cardId).map((id) => ({ id: `${centerId}|${id}`, label: (context.language === "en" ? namesEn : names)[Number(id)] ?? id, symbolImage: id }))
    };
  },
  condition() { return undefined; },
  seatStatus(state, context, playerId) {
    return blockedUntil(state, playerId) > context.now ? (context.language === "en" ? "Wrong picture · locked" : "Falsches Bild · gesperrt") : undefined;
  },
  tick(state, context) {
    const extra = { ...state.extra };
    let changed = false;
    const hasLock = state.table.turnOrder.some((id) => blockedUntil(state, id) > 0);
    for (const id of state.table.turnOrder) {
      if (blockedUntil(state, id) > 0 && blockedUntil(state, id) <= context.now) { extra[blockedKey(id)] = 0; changed = true; }
    }
    const second = Math.floor(context.now / 1_000);
    if (hasLock && extra.symboljagdTickSecond !== second) { extra.symboljagdTickSecond = second; changed = true; }
    return changed ? { ...state, extra } : state;
  },
  isFinished(state) { return state.gameOver; },
  buildScore(state): ScoreEntry[] { return state.winnerPlayerId ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Symboljagd" }] : []; },
  privateNote(state, context, playerId) {
    const remaining = blockedUntil(state, playerId) - context.now;
    if (remaining <= 0) return undefined;
    return context.language === "en" ? `Locked for ${Math.ceil(remaining / 1000)}s or until the next match.` : `Gesperrt: ${Math.ceil(remaining / 1000)} s oder bis zum nächsten Treffer.`;
  },
  botMove(state, context, playerId) {
    if (blockedUntil(state, playerId) > context.now) return { kind: "wait" };
    const own = handOf(state.table, playerId)[0];
    const center = centerCardId(state);
    if (!own || !center) return { kind: "wait" };
    const match = symbols(state, own).find((id) => symbols(state, center).includes(id));
    return match ? { kind: "play", cardId: own, choiceId: `${center}|${match}` } : { kind: "wait" };
  }
};
