import type { CardFace, CardInstance, DeckDefinition } from "./cardTypes.js";

/**
 * Zustand eines Kartentischs.
 *
 * Bewusst flach: alle Karteninstanzen liegen in `cards`, jede Ablage hält nur
 * Karten-Ids. Damit ist der Zustand klein, serialisierbar und um eigene Zonen
 * erweiterbar. Konvention: Index 0 ist immer die oberste Karte eines Stapels.
 */
export interface CardTableState {
  deckId: string;
  cards: Record<string, CardInstance>;
  drawPile: string[];
  discardPile: string[];
  hands: Record<string, string[]>;
  /** Frei benannte Tischzonen, z. B. "stich" oder "auslage". */
  zones: Record<string, string[]>;
  turnOrder: string[];
  activeIndex: number;
  direction: 1 | -1;
}

export type CardPileRef =
  | { kind: "draw" }
  | { kind: "discard" }
  | { kind: "hand"; playerId: string }
  | { kind: "zone"; zoneId: string };

export type RandomSource = () => number;

export function shuffleCardIds(cardIds: string[], random: RandomSource = Math.random): string[] {
  const result = [...cardIds];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index] as string;
    result[index] = result[swapIndex] as string;
    result[swapIndex] = current;
  }

  return result;
}

/** Erzeugt aus einer Deck-Definition die Karteninstanzen einer Runde. */
export function buildCardInstances(deck: DeckDefinition): CardInstance[] {
  const instances: CardInstance[] = [];

  for (const definition of deck.cards) {
    const copies = Math.max(1, definition.copies ?? 1);

    for (let copy = 1; copy <= copies; copy += 1) {
      instances.push({
        id: `${definition.id}#${copy}`,
        definitionId: definition.id,
        suitId: definition.suitId,
        rankId: definition.rankId,
        tags: definition.tags ? [...definition.tags] : []
      });
    }
  }

  return instances;
}

export interface CreateCardTableOptions {
  deck: DeckDefinition;
  playerIds: string[];
  handSize?: number;
  /** Legt die oberste Karte offen auf den Ablagestapel. */
  openStartCard?: boolean;
  zoneIds?: string[];
  random?: RandomSource;
}

export function createCardTable(options: CreateCardTableOptions): CardTableState {
  const instances = buildCardInstances(options.deck);
  const cards: Record<string, CardInstance> = {};

  for (const instance of instances) {
    cards[instance.id] = instance;
  }

  const shuffled = shuffleCardIds(
    instances.map((instance) => instance.id),
    options.random ?? Math.random
  );
  const hands: Record<string, string[]> = {};
  const handSize = Math.max(0, options.handSize ?? 0);
  let cursor = 0;

  for (const playerId of options.playerIds) {
    hands[playerId] = shuffled.slice(cursor, cursor + handSize);
    cursor += handSize;
  }

  const remaining = shuffled.slice(cursor);
  const discardPile: string[] = [];

  if (options.openStartCard && remaining.length > 0) {
    discardPile.push(remaining.shift() as string);
  }

  const zones: Record<string, string[]> = {};

  for (const zoneId of options.zoneIds ?? []) {
    zones[zoneId] = [];
  }

  return {
    deckId: options.deck.id,
    cards,
    drawPile: remaining,
    discardPile,
    hands,
    zones,
    turnOrder: [...options.playerIds],
    activeIndex: 0,
    direction: 1
  };
}

function readPile(state: CardTableState, pile: CardPileRef): string[] {
  switch (pile.kind) {
    case "draw":
      return state.drawPile;
    case "discard":
      return state.discardPile;
    case "hand":
      return state.hands[pile.playerId] ?? [];
    case "zone":
      return state.zones[pile.zoneId] ?? [];
    default:
      return [];
  }
}

function writePile(state: CardTableState, pile: CardPileRef, cardIds: string[]): CardTableState {
  switch (pile.kind) {
    case "draw":
      return { ...state, drawPile: cardIds };
    case "discard":
      return { ...state, discardPile: cardIds };
    case "hand":
      return { ...state, hands: { ...state.hands, [pile.playerId]: cardIds } };
    case "zone":
      return { ...state, zones: { ...state.zones, [pile.zoneId]: cardIds } };
    default:
      return state;
  }
}

export function findCardPile(state: CardTableState, cardId: string): CardPileRef | null {
  if (state.drawPile.includes(cardId)) {
    return { kind: "draw" };
  }

  if (state.discardPile.includes(cardId)) {
    return { kind: "discard" };
  }

  for (const [playerId, hand] of Object.entries(state.hands)) {
    if (hand.includes(cardId)) {
      return { kind: "hand", playerId };
    }
  }

  for (const [zoneId, zone] of Object.entries(state.zones)) {
    if (zone.includes(cardId)) {
      return { kind: "zone", zoneId };
    }
  }

  return null;
}

/** Verschiebt eine Karte zwischen zwei Ablagen. */
export function moveCard(
  state: CardTableState,
  cardId: string,
  target: CardPileRef,
  position: "top" | "bottom" = "top"
): CardTableState {
  const source = findCardPile(state, cardId);

  if (!source) {
    return state;
  }

  const withoutCard = writePile(
    state,
    source,
    readPile(state, source).filter((entry) => entry !== cardId)
  );
  const targetCards = readPile(withoutCard, target);

  return writePile(
    withoutCard,
    target,
    position === "top" ? [cardId, ...targetCards] : [...targetCards, cardId]
  );
}

/** Mischt den Ablagestapel ohne oberste Karte zurück in den Nachziehstapel. */
export function recycleDiscardPile(
  state: CardTableState,
  random: RandomSource = Math.random
): CardTableState {
  if (state.discardPile.length <= 1) {
    return state;
  }

  const [top, ...rest] = state.discardPile;

  return {
    ...state,
    drawPile: [...state.drawPile, ...shuffleCardIds(rest, random)],
    discardPile: [top as string]
  };
}

export interface DrawResult {
  state: CardTableState;
  drawnCardIds: string[];
  exhausted: boolean;
}

/** Zieht Karten und recycelt bei Bedarf den Ablagestapel. */
export function drawCards(
  state: CardTableState,
  playerId: string,
  count: number,
  random: RandomSource = Math.random
): DrawResult {
  let working = state;
  const drawnCardIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    if (working.drawPile.length === 0) {
      working = recycleDiscardPile(working, random);
    }

    if (working.drawPile.length === 0) {
      return { state: working, drawnCardIds, exhausted: true };
    }

    const [cardId, ...rest] = working.drawPile;
    const hand = working.hands[playerId] ?? [];

    working = {
      ...working,
      drawPile: rest,
      hands: { ...working.hands, [playerId]: [...hand, cardId as string] }
    };
    drawnCardIds.push(cardId as string);
  }

  return { state: working, drawnCardIds, exhausted: false };
}

/** Legt eine Handkarte offen auf den Ablagestapel. */
export function playCardToDiscard(
  state: CardTableState,
  playerId: string,
  cardId: string
): CardTableState {
  if (!(state.hands[playerId] ?? []).includes(cardId)) {
    return state;
  }

  return moveCard(state, cardId, { kind: "discard" }, "top");
}

export function topDiscardCardId(state: CardTableState): string | null {
  return state.discardPile[0] ?? null;
}

export function topDiscardCard(state: CardTableState): CardInstance | null {
  const cardId = topDiscardCardId(state);
  return cardId ? state.cards[cardId] ?? null : null;
}

export function activePlayerId(state: CardTableState): string | null {
  return state.turnOrder[state.activeIndex] ?? null;
}

export function advanceTurn(state: CardTableState, steps = 1): CardTableState {
  if (state.turnOrder.length === 0) {
    return state;
  }

  const size = state.turnOrder.length;
  const raw = state.activeIndex + state.direction * steps;

  return { ...state, activeIndex: ((raw % size) + size) % size };
}

export function reverseDirection(state: CardTableState): CardTableState {
  return { ...state, direction: state.direction === 1 ? -1 : 1 };
}

export function handOf(state: CardTableState, playerId: string): string[] {
  return state.hands[playerId] ?? [];
}

/** Übersetzt eine Karteninstanz in das gemeinsame Anzeigemodell. */
export function toCardFace(deck: DeckDefinition, card: CardInstance): CardFace {
  const suit = deck.suits.find((entry) => entry.id === card.suitId);
  const rank = deck.ranks.find((entry) => entry.id === card.rankId);
  const isJoker = card.rankId === "joker" || card.tags.includes("joker");

  return {
    cardId: card.id,
    suitId: card.suitId,
    suitSymbol: suit?.symbol ?? rank?.symbol ?? "★",
    suitLabel: suit?.label ?? rank?.centerLabel ?? "Joker",
    rankLabel: rank?.label ?? card.rankId.toUpperCase(),
    color: suit?.color ?? rank?.color ?? "neutral",
    centerLabel: rank?.centerLabel ?? (isJoker ? "JOKER" : undefined),
    points: rank?.points
  };
}

export function toCardFaces(
  deck: DeckDefinition,
  state: CardTableState,
  cardIds: string[]
): CardFace[] {
  return cardIds
    .map((cardId) => state.cards[cardId])
    .filter((card): card is CardInstance => Boolean(card))
    .map((card) => toCardFace(deck, card));
}
