import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { createCardTable, handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance, DeckDefinition } from "../cards/cardTypes.js";
import type {
  CardTableActionState,
  CardTableChoiceState,
  CardTableStackState
} from "../protocol.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  readNumber,
  readText,
  withError,
  writeExtra,
  type CardBotIntent,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Schwimmen (31, Schnauz).
 *
 * Drei Handkarten, drei offene Karten in der Tischmitte. Wer am Zug ist,
 * tauscht eine Karte gegen eine Tischkarte, tauscht alle drei, schiebt oder
 * klopft. Nach dem Klopfen ist noch einmal reihum, dann wird verglichen:
 * Die niedrigste Hand verliert ein Leben, wer keins mehr hat, scheidet aus.
 *
 * Zeigt auf dem Fundament zwei Dinge, die Mau-Mau nicht braucht: eine offene
 * Tischzone und eine Auswahl, die zur gespielten Karte gehört.
 */

const tableZoneId = "tisch";
const startingLives = 3;
const fireValue = 31;
const tripleValue = 30.5;

const livesKey = (playerId: string): string => `lives:${playerId}`;
const knockerKey = "knockerId";
const passKey = "passCount";

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Schwimmen: Sammle möglichst viele Punkte in einer Farbe. 31 ist Feuer.",
    swapOne: "Tauschen",
    swapAll: "Alle drei",
    push: "Schieben",
    knock: "Klopfen",
    chooseTableCard: "Gegen welche Tischkarte tauschen?",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    needTableCard: "Wähle eine Tischkarte.",
    alreadyKnocked: "Es wurde bereits geklopft.",
    swapped: "tauscht",
    against: "gegen",
    swappedAll: "tauscht alle drei Karten",
    pushed: "schiebt",
    knocked: "klopft",
    newTableCards: "Drei neue Karten liegen auf dem Tisch.",
    noCards: "Der Stapel ist leer - es wird verglichen.",
    fire: "Feuer! 31 Punkte.",
    lost: "verliert ein Leben",
    swimming: "schwimmt",
    outNow: "scheidet aus",
    wins: "gewinnt Schwimmen.",
    points: "Deine Punkte",
    lives: "Leben",
    knockedTag: "geklopft",
    showdown: "Es wird aufgedeckt.",
    tie: "Gleichstand, niemand verliert ein Leben."
  },
  en: {
    intro: "Thirty-one: collect the highest total in one suit. 31 is fire.",
    swapOne: "Swap",
    swapAll: "Swap all",
    push: "Push",
    knock: "Knock",
    chooseTableCard: "Swap against which table card?",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    needTableCard: "Choose a table card.",
    alreadyKnocked: "Someone already knocked.",
    swapped: "swaps",
    against: "for",
    swappedAll: "swaps all three cards",
    pushed: "pushes",
    knocked: "knocks",
    newTableCards: "Three new cards are on the table.",
    noCards: "The pile is empty - hands are compared.",
    fire: "Fire! 31 points.",
    lost: "loses a life",
    swimming: "is swimming",
    outNow: "is out",
    wins: "wins Thirty-one.",
    points: "Your points",
    lives: "lives",
    knockedTag: "knocked",
    showdown: "Hands are revealed.",
    tie: "A tie - nobody loses a life."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

/** Kartenwert nach Schwimmen-Zählung: 7-10 nach Zahl, Bilder 10, Ass 11. */
function cardValue(deck: DeckDefinition, card: CardInstance): number {
  const order = deck.ranks.find((rank) => rank.id === card.rankId)?.order ?? 0;

  if (order >= 14) {
    return 11;
  }

  return order > 10 ? 10 : order;
}

/** Bester Farbwert einer Hand, oder 30,5 für einen Drilling. */
export function schwimmenHandValue(
  state: CardGameState,
  context: CardRulesetContext,
  cardIds: string[]
): number {
  const cards = cardIds
    .map((cardId) => state.table.cards[cardId])
    .filter((card): card is CardInstance => Boolean(card));

  if (cards.length === 0) {
    return 0;
  }

  const rankIds = new Set(cards.map((card) => card.rankId));

  if (cards.length >= 3 && rankIds.size === 1) {
    return tripleValue;
  }

  const bySuit = new Map<string, number>();

  for (const card of cards) {
    const suitId = card.suitId ?? "none";
    bySuit.set(suitId, (bySuit.get(suitId) ?? 0) + cardValue(context.deck, card));
  }

  return Math.max(...bySuit.values());
}

function livesOf(state: CardGameState, playerId: string): number {
  return readNumber(state, livesKey(playerId), startingLives);
}

function isOut(state: CardGameState, playerId: string): boolean {
  return livesOf(state, playerId) < 0;
}

function activePlayers(state: CardGameState): string[] {
  return state.table.turnOrder.filter((playerId) => !isOut(state, playerId));
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

/** Setzt den Zug auf den nächsten Spieler, der noch dabei ist. */
function nextTurn(state: CardGameState): CardGameState {
  const order = state.table.turnOrder;

  if (order.length === 0) {
    return state;
  }

  for (let step = 1; step <= order.length; step += 1) {
    const index = (state.table.activeIndex + step) % order.length;
    const candidate = order[index] as string;

    if (!isOut(state, candidate)) {
      return { ...state, table: { ...state.table, activeIndex: index } };
    }
  }

  return state;
}

function tableCardIds(state: CardGameState): string[] {
  return state.table.zones[tableZoneId] ?? [];
}

/**
 * Neue Runde am selben Tisch: frisch mischen, an die verbliebenen Spieler
 * austeilen, drei Karten offen. Ausgeschiedene bleiben mit leerer Hand sitzen,
 * damit der Tisch die komplette Runde weiter zeigt.
 */
function startNewDeal(state: CardGameState, context: CardRulesetContext): CardGameState {
  const seats = state.table.turnOrder;
  const players = activePlayers(state);
  const table = createCardTable({
    deck: context.deck,
    playerIds: players,
    handSize: 3,
    openStartCard: false,
    zoneIds: [tableZoneId]
  });
  const open = table.drawPile.slice(0, 3);
  const hands: Record<string, string[]> = { ...table.hands };

  for (const playerId of seats) {
    hands[playerId] = hands[playerId] ?? [];
  }

  const firstActive = Math.max(0, seats.findIndex((playerId) => players.includes(playerId)));

  return {
    ...state,
    table: {
      ...table,
      hands,
      turnOrder: seats,
      activeIndex: firstActive,
      drawPile: table.drawPile.slice(3),
      zones: { [tableZoneId]: open }
    },
    extra: { ...state.extra, [knockerKey]: null, [passKey]: 0 },
    drawnThisTurn: 0,
    updatedAt: context.now
  };
}

/** Vergleicht alle Hände, verteilt Leben und startet die nächste Runde. */
function showdown(
  state: CardGameState,
  context: CardRulesetContext,
  firePlayerId: string | null
): CardGameState {
  const text = words(context);
  const players = activePlayers(state);
  const values = new Map(
    players.map((playerId) => [playerId, schwimmenHandValue(state, context, handOf(state.table, playerId))])
  );
  const losers = firePlayerId
    ? players.filter((playerId) => playerId !== firePlayerId)
    : (() => {
        const lowest = Math.min(...players.map((playerId) => values.get(playerId) ?? 0));
        return players.filter((playerId) => (values.get(playerId) ?? 0) === lowest);
      })();

  // Sind alle gleichauf, verliert niemand ein Leben - sonst könnte sich der
  // Tisch bei einem Gleichstand komplett selbst auslöschen.
  const allTied = !firePlayerId && losers.length === players.length && players.length > 1;

  let next = appendLog(
    clearError(state),
    null,
    firePlayerId
      ? `${playerName(context, firePlayerId)}: ${text.fire}`
      : `${text.showdown} ${players
          .map((playerId) => `${playerName(context, playerId)} ${values.get(playerId) ?? 0}`)
          .join(", ")}${allTied ? ` - ${text.tie}` : ""}`
  );

  for (const playerId of allTied ? [] : losers) {
    const lives = livesOf(next, playerId) - 1;
    next = writeExtra(next, { [livesKey(playerId)]: lives });
    next = appendLog(
      next,
      playerName(context, playerId),
      lives < 0 ? (text.outNow as string) : lives === 0 ? (text.swimming as string) : (text.lost as string)
    );
  }

  const remaining = activePlayers(next);

  if (remaining.length <= 1) {
    const winner = remaining[0] ?? null;

    return finishGame(
      next,
      winner,
      winner ? playerName(context, winner) : null,
      winner ? `${playerName(context, winner)} ${text.wins}` : (text.showdown as string)
    );
  }

  return startNewDeal(next, context);
}

function tableChoice(
  state: CardGameState,
  context: CardRulesetContext
): CardTableChoiceState {
  return {
    id: "table-card",
    label: words(context).chooseTableCard as string,
    options: tableCardIds(state).map((cardId) => {
      const card = state.table.cards[cardId];
      const face = card ? toCardFace(context.deck, card) : null;

      return {
        id: cardId,
        label: face ? `${face.rankLabel} ${face.suitSymbol}` : cardId,
        symbol: face?.suitSymbol,
        color: face?.color
      };
    })
  };
}

export const schwimmenRuleset: CardRuleset = {
  id: "schwimmen",
  label: { de: "Schwimmen (31)", en: "Thirty-one" },
  defaultDeckId: "skat-32",
  allowedDeckIds: ["skat-32", "french-52"],
  defaultHandSize: 3,
  openStartCard: false,
  turnBased: true,

  handSizeFor() {
    return 3;
  },

  setupRound(state, context) {
    const open = state.table.drawPile.slice(0, 3);
    const lives: Record<string, number> = {};

    for (const playerId of state.table.turnOrder) {
      lives[livesKey(playerId)] = startingLives;
    }

    return {
      ...state,
      table: {
        ...state.table,
        drawPile: state.table.drawPile.slice(3),
        zones: { ...state.table.zones, [tableZoneId]: open }
      },
      extra: { ...state.extra, ...lives, [knockerKey]: null, [passKey]: 0 }
    };
  },

  rules(context) {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: [
              "Collect the highest total in a single suit.",
              "Whoever holds the lowest hand at the showdown loses a life."
            ]
          },
          {
            title: "Card values",
            lines: [
              "Ace 11, king / queen / jack / ten 10, every other card its number.",
              "Only cards of the same suit add up — two suits never combine.",
              "Three cards of the same rank count 30.5.",
              "31 is the maximum and is called fire."
            ]
          },
          {
            title: "Your turn — pick one",
            lines: [
              "Swap one: give a hand card away and take one of the three open table cards.",
              "Swap all: exchange your whole hand for all three table cards.",
              "Push: do nothing and pass on.",
              "Knock: end the round for everyone else."
            ]
          },
          {
            title: "Pushing and knocking",
            lines: [
              "If everyone pushes in a row, the three table cards are replaced from the pile.",
              "After a knock every other player has exactly one more turn, then all hands are revealed.",
              "The player who knocked does not get another turn."
            ]
          },
          {
            title: "Lives",
            lines: [
              "Everyone starts with three lives.",
              "The lowest hand loses one. If several tie for lowest, they all lose one.",
              "If everybody ties, nobody loses a life.",
              "At zero lives you are swimming — the next loss puts you out.",
              "Reaching 31 ends the round at once and every other player loses a life."
            ]
          },
          {
            title: "End of the round",
            lines: [
              "After each showdown the remaining players are dealt fresh cards.",
              "The last player left wins the round and scores one point."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: [
              "Sammle möglichst viele Punkte in einer einzigen Farbe.",
              "Wer beim Aufdecken die niedrigste Hand hat, verliert ein Leben."
            ]
          },
          {
            title: "Kartenwerte",
            lines: [
              "Ass 11, König / Dame / Bube / Zehn 10, alle anderen Karten ihren Zahlenwert.",
              "Nur Karten derselben Farbe zählen zusammen — zwei Farben werden nie addiert.",
              "Drei Karten desselben Werts zählen 30,5.",
              "31 ist das Maximum und heißt Feuer."
            ]
          },
          {
            title: "Dein Zug — eins von vier",
            lines: [
              "Einzeln tauschen: Du gibst eine Handkarte ab und nimmst dafür eine der drei offenen Tischkarten.",
              "Alle drei tauschen: Deine komplette Hand gegen alle drei Tischkarten.",
              "Schieben: nichts tun und weitergeben.",
              "Klopfen: die Runde für alle anderen einläuten."
            ]
          },
          {
            title: "Schieben und Klopfen",
            lines: [
              "Schieben alle reihum, werden die drei Tischkarten durch drei neue vom Stapel ersetzt.",
              "Nach dem Klopfen hat jeder andere noch genau einen Zug, dann wird aufgedeckt.",
              "Wer geklopft hat, kommt nicht noch einmal dran."
            ]
          },
          {
            title: "Leben",
            lines: [
              "Jeder startet mit drei Leben.",
              "Die niedrigste Hand verliert eins. Sind mehrere gleich niedrig, verlieren alle davon eins.",
              "Sind alle gleichauf, verliert niemand.",
              "Bei null Leben schwimmst du — beim nächsten Verlust bist du raus.",
              "Wer 31 erreicht, beendet die Runde sofort; alle anderen verlieren ein Leben."
            ]
          },
          {
            title: "Rundenende",
            lines: [
              "Nach jedem Aufdecken bekommen die verbliebenen Spieler neue Karten.",
              "Wer als Letzter übrig bleibt, gewinnt die Runde und bekommt einen Punkt."
            ]
          }
        ];
  },

  introMessage(context) {
    return words(context).intro as string;
  },

  canPlayCard(state, context, playerId, cardId) {
    const text = words(context);

    if (!handOf(state.table, playerId).includes(cardId)) {
      return { allowed: false, hint: text.notInHand as string };
    }

    if (!isActive(state, playerId)) {
      return { allowed: false, hint: text.notYourTurn as string };
    }

    return { allowed: true };
  },

  playCard(state, context, playerId, cardId, choiceId) {
    const text = words(context);
    const check = schwimmenRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    if (!choiceId || !tableCardIds(state).includes(choiceId)) {
      return withError(state, text.needTableCard as string);
    }

    const handCard = state.table.cards[cardId];
    const tableCard = state.table.cards[choiceId];

    if (!handCard || !tableCard) {
      return withError(state, text.needTableCard as string);
    }

    const handFace = toCardFace(context.deck, handCard);
    const tableFace = toCardFace(context.deck, tableCard);
    let table = moveCard(state.table, cardId, { kind: "zone", zoneId: tableZoneId }, "bottom");
    table = moveCard(table, choiceId, { kind: "hand", playerId }, "bottom");

    const swapped = appendLog(
      clearError({
        ...state,
        table,
        turnNumber: state.turnNumber + 1,
        extra: { ...state.extra, [passKey]: 0 },
        updatedAt: context.now
      }),
      playerName(context, playerId),
      `${text.swapped} ${handFace.rankLabel} ${handFace.suitSymbol} ${text.against} ${tableFace.rankLabel} ${tableFace.suitSymbol}`
    );

    return finishTurn(swapped, context, playerId);
  },

  drawCard(state, context, playerId) {
    return schwimmenRuleset.runAction(state, context, playerId, "push");
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    if (actionId === "swap-all") {
      const hand = [...handOf(state.table, playerId)];
      const open = [...tableCardIds(state)];
      let table = state.table;

      for (const cardId of hand) {
        table = moveCard(table, cardId, { kind: "zone", zoneId: tableZoneId }, "bottom");
      }

      for (const cardId of open) {
        table = moveCard(table, cardId, { kind: "hand", playerId }, "bottom");
      }

      const swapped = appendLog(
        clearError({
          ...state,
          table,
          turnNumber: state.turnNumber + 1,
          extra: { ...state.extra, [passKey]: 0 },
          updatedAt: context.now
        }),
        playerName(context, playerId),
        text.swappedAll as string
      );

      return finishTurn(swapped, context, playerId);
    }

    if (actionId === "knock") {
      if (readText(state, knockerKey)) {
        return withError(state, text.alreadyKnocked as string);
      }

      const knocked = appendLog(
        clearError(writeExtra(state, { [knockerKey]: playerId, [passKey]: 0 })),
        playerName(context, playerId),
        text.knocked as string
      );

      return finishTurn({ ...knocked, turnNumber: knocked.turnNumber + 1 }, context, playerId);
    }

    if (actionId !== "push") {
      return state;
    }

    const passCount = readNumber(state, passKey) + 1;
    let next = appendLog(
      clearError(writeExtra({ ...state, turnNumber: state.turnNumber + 1 }, { [passKey]: passCount })),
      playerName(context, playerId),
      text.pushed as string
    );

    if (passCount >= activePlayers(state).length) {
      if (next.table.drawPile.length < 3) {
        return showdown(next, context, null);
      }

      const fresh = next.table.drawPile.slice(0, 3);
      next = appendLog(
        writeExtra(
          {
            ...next,
            table: {
              ...next.table,
              drawPile: next.table.drawPile.slice(3),
              discardPile: [...tableCardIds(next), ...next.table.discardPile],
              zones: { ...next.table.zones, [tableZoneId]: fresh }
            }
          },
          { [passKey]: 0 }
        ),
        null,
        text.newTableCards as string
      );
    }

    return finishTurn(next, context, playerId);
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const text = words(context);
    const enabled = state.phase === "playing" && !state.gameOver && isActive(state, playerId);
    const knocker = readText(state, knockerKey);

    return [
      { id: "swap-all", label: text.swapAll as string, kind: "primary", enabled },
      { id: "push", label: text.push as string, kind: "secondary", enabled },
      {
        id: "knock",
        label: text.knock as string,
        kind: "danger",
        enabled: enabled && !knocker
      }
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    const text = words(context);
    const enabled = state.phase === "playing" && !state.gameOver;
    const knocker = readText(state, knockerKey);

    return [
      { id: "push", label: text.push as string, kind: "primary", enabled },
      { id: "knock", label: text.knock as string, kind: "secondary", enabled: enabled && !knocker }
    ];
  },

  runHostAction(state, context, actionId) {
    const active = state.table.turnOrder[state.table.activeIndex];
    return active ? schwimmenRuleset.runAction(state, context, active, actionId) : state;
  },

  choiceForCard(state, context) {
    return tableChoice(state, context);
  },

  tableStacks(state, context): CardTableStackState[] {
    const cards = tableCardIds(state)
      .map((cardId) => state.table.cards[cardId])
      .filter((card): card is CardInstance => Boolean(card))
      .map((card) => toCardFace(context.deck, card));

    return [
      {
        id: tableZoneId,
        label: context.language === "en" ? "Table cards" : "Tischkarten",
        kind: "zone",
        count: cards.length,
        cards,
        faceDown: false
      }
    ];
  },

  condition(state, context) {
    const knocker = readText(state, knockerKey);

    if (!knocker) {
      return undefined;
    }

    return {
      label: `${playerName(context, knocker)} ${words(context).knocked}`,
      symbol: "!",
      color: "red"
    };
  },

  privateNote(state, context, playerId) {
    const text = words(context);

    if (isOut(state, playerId)) {
      return text.outNow as string;
    }

    const value = schwimmenHandValue(state, context, handOf(state.table, playerId));
    const lives = livesOf(state, playerId);

    return `${text.points}: ${value} · ${lives === 0 ? text.swimming : `${lives} ${text.lives}`}`;
  },

  seatStatus(state, context, playerId) {
    const text = words(context);

    if (isOut(state, playerId)) {
      return text.outNow as string;
    }

    if (readText(state, knockerKey) === playerId) {
      return text.knockedTag as string;
    }

    const lives = livesOf(state, playerId);

    return lives === 0 ? (text.swimming as string) : `${lives} ${text.lives}`;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Schwimmen" }]
      : [];
  },

  /**
   * KI-Zug.
   *
   * Schwimmen ist rechenbar: Der Bot probiert jeden Einzeltausch und den
   * Komplettausch durch und nimmt den, der seinen Handwert am stärksten hebt.
   * Bringt kein Tausch etwas, klopft er ab 27 Punkten - darunter schiebt er
   * lieber und wartet auf bessere Tischkarten.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId) || isOut(state, playerId)) {
      return { kind: "wait" };
    }

    const hand = handOf(state.table, playerId);
    const open = tableCardIds(state);
    const current = schwimmenHandValue(state, context, hand);
    let bestValue = current;
    let bestIntent: CardBotIntent | null = null;

    for (const cardId of hand) {
      for (const tableCardId of open) {
        const swapped = [...hand.filter((entry) => entry !== cardId), tableCardId];
        const value = schwimmenHandValue(state, context, swapped);

        if (value > bestValue) {
          bestValue = value;
          bestIntent = { kind: "play", cardId, choiceId: tableCardId };
        }
      }
    }

    const allValue = schwimmenHandValue(state, context, open);

    if (allValue > bestValue) {
      bestValue = allValue;
      bestIntent = { kind: "action", actionId: "swap-all" };
    }

    if (bestIntent) {
      return bestIntent;
    }

    const knocker = readText(state, knockerKey);

    if (!knocker && current >= knockThreshold) {
      return { kind: "action", actionId: "knock" };
    }

    return { kind: "action", actionId: "push" };
  }
};

/** Ab diesem Handwert klopft ein Bot, statt weiter zu schieben. */
const knockThreshold = 27;

/**
 * Schließt einen Zug ab: prüft Feuer, beendet nach dem Klopfen die Runde und
 * gibt sonst an den nächsten Spieler weiter.
 */
function finishTurn(
  state: CardGameState,
  context: CardRulesetContext,
  playerId: string
): CardGameState {
  if (schwimmenHandValue(state, context, handOf(state.table, playerId)) >= fireValue) {
    return showdown(state, context, playerId);
  }

  const knocker = readText(state, knockerKey);
  const advanced = nextTurn(state);

  if (knocker && advanced.table.turnOrder[advanced.table.activeIndex] === knocker) {
    return showdown(advanced, context, null);
  }

  return { ...advanced, drawnThisTurn: 0 };
}
