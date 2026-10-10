import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import {
  advanceTurn,
  drawCards,
  handOf,
  playCardToDiscard,
  recycleDiscardPile,
  reverseDirection,
  toCardFace,
  topDiscardCard
} from "../cards/cardTable.js";
import type { CardInstance, DeckDefinition } from "../cards/cardTypes.js";
import type { CardTableActionState, CardTableChoiceState } from "../protocol.js";
import { bestOf, smallestOpponentHand, suitCounts } from "../bots/tactics.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  withError,
  type CardGameState,
  type CardPlayCheck,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Mau-Mau.
 *
 * Referenz-Regelwerk auf dem Kartentisch: Sieben zieht zwei (stapelbar), Acht
 * setzt aus, Neun dreht die Richtung, der Bube (bzw. der Wild-Rang des Decks)
 * wünscht sich eine Farbe. Die Lobby schaltet die Hausregeln unabhängig um;
 * die Sonderränge stehen als gemeinsame Konstanten für Regeln und KI hier.
 */

export const mauMauRules = {
  drawTwoRankIds: ["7"],
  skipRankIds: ["8"],
  reverseRankIds: ["9"],
  drawTwoAmount: 2
} as const;

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    draw: "Ziehen",
    pass: "Weiter",
    recycle: "Ablage mischen",
    end: "Runde beenden",
    notYourTurn: "Du bist nicht am Zug.",
    mustDraw: "Zieh erst eine Karte.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    mustSeven: "Lege eine Sieben oder ziehe die Strafkarten.",
    noMatch: "Farbe oder Wert passen nicht.",
    needWish: "Wähle eine Wunschfarbe.",
    played: "legt",
    wished: "wünscht sich",
    wishShort: "Wunsch",
    drew: "zieht eine Karte",
    drewMany: "zieht",
    cards: "Karten",
    skipped: "muss aussetzen",
    reversed: "dreht die Richtung",
    passed: "setzt aus",
    recycled: "Der Ablagestapel wurde neu gemischt.",
    ended: "Der Host hat die Runde beendet.",
    mau: "Mau!",
    wins: "gewinnt die Runde.",
    exhausted: "Es sind keine Karten mehr im Stapel.",
    onlyDrawn: "Nach dem Ziehen darfst du nur eine gerade gezogene Karte legen.",
    blocked: "Niemand kann mehr ziehen oder legen. Die Runde endet ohne Sieger."
  },
  en: {
    draw: "Draw",
    pass: "Pass",
    recycle: "Reshuffle pile",
    end: "End round",
    notYourTurn: "It is not your turn.",
    mustDraw: "Draw a card first.",
    notInHand: "That card is not in your hand.",
    mustSeven: "Play a seven or take the penalty cards.",
    noMatch: "Suit and rank do not match.",
    needWish: "Choose a wish suit.",
    played: "plays",
    wished: "wishes for",
    wishShort: "Wish",
    drew: "draws a card",
    drewMany: "draws",
    cards: "cards",
    skipped: "is skipped",
    reversed: "reverses the direction",
    passed: "passes",
    recycled: "The discard pile was reshuffled.",
    ended: "The host ended the round.",
    mau: "Mau!",
    wins: "wins the round.",
    exhausted: "No cards left in the pile.",
    onlyDrawn: "After drawing, you may only play a card you just drew.",
    blocked: "Nobody can draw or play. The round ends without a winner."
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}
function optionOn(context: CardRulesetContext, option: "StackSevens" | "SkipEights" | "ReverseNines" | "JackOnJack" | "PlayDrawn"): boolean {
  return context.settings[`cardTableMau${option}`] !== "off";
}
function wildRankIds(deck: DeckDefinition): string[] {
  return deck.wildRankIds ?? ["jack"];
}

function isWild(deck: DeckDefinition, card: CardInstance): boolean {
  return wildRankIds(deck).includes(card.rankId) || card.tags.includes("joker");
}

function effectiveSuitId(state: CardGameState): string | null {
  return state.wishSuitId ?? topDiscardCard(state.table)?.suitId ?? null;
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function hasPlayableCard(state: CardGameState, context: CardRulesetContext, playerId: string): boolean {
  return handOf(state.table, playerId).some(
    (cardId) => mauMauRuleset.canPlayCard(state, context, playerId, cardId).allowed
  );
}

function suitChoice(deck: DeckDefinition, label: string): CardTableChoiceState {
  return {
    id: "wish-suit",
    label,
    options: deck.suits.map((suit) => ({
      id: suit.id,
      label: suit.label,
      symbol: suit.symbol,
      color: suit.color
    }))
  };
}

export const mauMauRuleset: CardRuleset = {
  id: "mau-mau",
  label: { de: "Mau-Mau", en: "Mau Mau" },
  defaultDeckId: "french-52",
  defaultHandSize: 5,
  /** Zu zweit spielbar. */
  minSeats: 2,
  openStartCard: true,
  turnBased: true,

  rules(context) {
    const en = context.language === "en";
    const playPenaltyDrawn = context.settings.cardTableMauPlayPenaltyDrawn === "on";

    return en
      ? [
          {
            title: "Goal",
            lines: ["Be the first to play every card in your hand."]
          },
          {
            title: "Playing a card",
            lines: [
              "Your card has to match the top card of the pile in suit or in rank.",
              optionOn(context, "JackOnJack") ? "A jack may always be played, except during a seven penalty." : "A jack may be played on any non-wild card, except during a seven penalty. No jack or joker on another jack or joker.",
              "With a joker deck, jokers work like jacks."
            ]
          },
          {
            title: "Special cards",
            lines: [
              optionOn(context, "StackSevens") ? "7 — the next player draws two. Sevens stack and pass on the whole penalty." : "7 — the next player must draw two. Sevens cannot be stacked.",
              optionOn(context, "SkipEights") ? "8 — the next player is skipped." : "8 — an ordinary card, without a special effect.",
              optionOn(context, "ReverseNines") ? "9 — reverses the direction. With two players it works like a skip." : "9 — an ordinary card, without a special effect.",
              "Jack — name a suit for the next card.",
              "The opening card has no special effect. An opening joker accepts any card."
            ]
          },
          {
            title: "If you cannot or will not play",
            lines: [
              "Draw exactly one card.",
              optionOn(context, "PlayDrawn") ? "If the drawn card fits, play it immediately or keep it and pass. Only the drawn card may be played." : "Keep the drawn card; your turn ends immediately.",
              "Does it not fit? The turn passes on.",
              optionOn(context, "StackSevens") ? "Facing sevens, play a seven or draw all penalty cards." : "Facing a seven, draw the penalty cards.",
              playPenaltyDrawn ? "After drawing a penalty (+2, +4, etc.), you may play one matching card from those just drawn, or keep them and pass. Old hand cards cannot be played. If none fits, your turn ends." : "After drawing penalty cards, your turn always ends, even if one fits."
            ]
          },
          {
            title: "End of the round",
            lines: [
              "The first player with an empty hand wins the round and scores one point.",
              "An empty draw pile is refilled from the discard pile, keeping the top card.",
              "If there are still not enough cards, draw as many as possible; the selected drawing rules apply. If nobody can draw or play, the round ends without a winner."
            ]
          },
          {
            title: "On your phone",
            lines: [
              "Tap a card to pick it up, tap again to play it — or use Play.",
              "If greying out is enabled in setup, unplayable cards are dimmed; their reason appears next to the buttons.",
              "Draw takes a card, Pass hands over once you have drawn."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: ["Lege als Erster alle Karten deiner Hand ab."]
          },
          {
            title: "Anlegen",
            lines: [
              "Deine Karte muss die Farbe oder den Wert der obersten Ablagekarte treffen.",
              optionOn(context, "JackOnJack") ? "Ein Bube passt auf jede Karte, außer während einer Sieben-Strafe." : "Ein Bube passt auf jede normale Karte, außer während einer Sieben-Strafe. Kein Bube oder Joker auf einen anderen Buben oder Joker.",
              "Im Blatt mit Jokern wirken die Joker wie Buben."
            ]
          },
          {
            title: "Sonderkarten",
            lines: [
              optionOn(context, "StackSevens") ? "7 — der Nächste zieht zwei. Siebenen stapeln sich und geben die ganze Strafe weiter." : "7 — der Nächste zieht zwei. Siebenen dürfen nicht gestapelt werden.",
              optionOn(context, "SkipEights") ? "8 — der Nächste setzt aus." : "8 — eine normale Karte ohne Sonderwirkung.",
              optionOn(context, "ReverseNines") ? "9 — die Spielrichtung dreht sich. Zu zweit wirkt sie wie Aussetzen." : "9 — eine normale Karte ohne Sonderwirkung.",
              "Bube — du wünschst dir die Farbe der nächsten Karte.",
              "Die Startkarte hat keine Sonderwirkung. Auf einen Start-Joker passt jede Karte."
            ]
          },
          {
            title: "Wenn nichts passt",
            lines: [
              "Zieh genau eine Karte.",
              optionOn(context, "PlayDrawn") ? "Passt die gezogene Karte, darfst du nur sie sofort legen — oder behalten und abgeben." : "Du behältst die gezogene Karte; dein Zug endet sofort.",
              "Passt sie nicht, ist der Nächste dran.",
              optionOn(context, "StackSevens") ? "Liegt ein Sieben-Angriff an, lege eine Sieben oder ziehe alle Strafkarten." : "Liegt eine Sieben-Strafe an, ziehe die Strafkarten.",
              playPenaltyDrawn ? "Nach Strafziehen (+2, +4 usw.) darfst du eine passende Karte aus den gerade gezogenen Karten legen oder alle behalten und abgeben. Alte Handkarten sind gesperrt. Passt keine, endet dein Zug." : "Nach dem Ziehen von Strafkarten endet dein Zug immer, auch wenn eine davon passt."
            ]
          },
          {
            title: "Rundenende",
            lines: [
              "Wer zuerst keine Karte mehr hat, gewinnt die Runde und bekommt einen Punkt.",
              "Ist der Nachziehstapel leer, wird die Ablage bis auf die oberste Karte neu gemischt.",
              "Fehlen weiterhin Karten, ziehst du so viele wie möglich; danach gelten die gewählten Ziehregeln. Kann niemand mehr ziehen oder legen, endet die Runde ohne Sieger."
            ]
          },
          {
            title: "Am Handy",
            lines: [
              "Karte antippen wählt sie aus, zweites Tippen legt sie — oder du nimmst „Legen“.",
              "Ist Ausgrauen in den Einstellungen aktiviert, werden unspielbare Karten abgedunkelt; der Grund steht neben den Buttons.",
              "„Ziehen“ nimmt eine Karte, „Weiter“ gibt ab, nachdem du gezogen hast."
            ]
          }
        ];
  },

  introMessage(context) {
    return context.language === "en"
      ? "Mau Mau: match suit or rank. The selected house rules are shown in the rules."
      : "Mau-Mau: Farbe oder Wert bedienen. Die gewählten Hausregeln stehen in den Spielregeln.";
  },

  canPlayCard(state, context, playerId, cardId): CardPlayCheck {
    const text = words(context);

    if (!handOf(state.table, playerId).includes(cardId)) {
      return { allowed: false, hint: text.notInHand as string };
    }

    if (!isActive(state, playerId)) {
      return { allowed: false, hint: text.notYourTurn as string };
    }

    const card = state.table.cards[cardId];
    const top = topDiscardCard(state.table);

    if (!card || !top) {
      return { allowed: false };
    }

    if (state.drawnThisTurn > 0) {
      // extra is restricted to primitives; keep the server-owned list as JSON.
      const drawnCardIds: string[] = typeof state.extra.mauDrawnCardIds === "string"
        ? JSON.parse(state.extra.mauDrawnCardIds) as string[]
        : typeof state.extra.mauDrawnCardId === "string" ? [state.extra.mauDrawnCardId] : [];
      if (!drawnCardIds.includes(cardId)) {
        return { allowed: false, hint: text.onlyDrawn as string };
      }
    }

    if (state.pendingDraw > 0) {
      return optionOn(context, "StackSevens") && mauMauRules.drawTwoRankIds.includes(card.rankId as never)
        ? { allowed: true }
        : { allowed: false, hint: optionOn(context, "StackSevens") ? text.mustSeven as string : context.language === "en" ? "Draw the penalty cards." : "Ziehe die Strafkarten." };
    }

    if (isWild(context.deck, card)) {
      if (!optionOn(context, "JackOnJack") && isWild(context.deck, top)) {
        return { allowed: false, hint: context.language === "en" ? "No jack or joker on another jack or joker." : "Kein Bube oder Joker auf einen Buben oder Joker." };
      }
      return { allowed: true };
    }

    if (state.wishSuitId === null && top.suitId === null && isWild(context.deck, top)) {
      return { allowed: true };
    }

    if (card.suitId !== null && card.suitId === effectiveSuitId(state)) {
      return { allowed: true };
    }

    if (state.wishSuitId === null && card.rankId === top.rankId) {
      return { allowed: true };
    }

    return { allowed: false, hint: text.noMatch as string };
  },

  playCard(state, context, playerId, cardId, choiceId) {
    const text = words(context);
    const check = mauMauRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.noMatch as string));
    }

    const card = state.table.cards[cardId];

    if (!card) {
      return withError(state, text.notInHand as string);
    }

    const wild = isWild(context.deck, card);
    const wishSuitId = wild
      ? context.deck.suits.find((suit) => suit.id === choiceId)?.id ?? null
      : null;

    if (wild && !wishSuitId) {
      return withError(state, text.needWish as string);
    }

    const face = toCardFace(context.deck, card);
    const name = playerName(context, playerId);
    let table = playCardToDiscard(state.table, playerId, cardId);
    let pendingDraw = state.pendingDraw;
    let logText = `${text.played} ${face.rankLabel} ${face.suitSymbol}`;

    if (mauMauRules.drawTwoRankIds.includes(card.rankId as never)) {
      pendingDraw += mauMauRules.drawTwoAmount;
      logText = `${logText} (+${pendingDraw})`;
      table = advanceTurn(table);
    } else if (optionOn(context, "SkipEights") && mauMauRules.skipRankIds.includes(card.rankId as never)) {
      logText = `${logText} - ${text.skipped}`;
      table = advanceTurn(table, 2);
    } else if (optionOn(context, "ReverseNines") && mauMauRules.reverseRankIds.includes(card.rankId as never)) {
      // Zu zweit gäbe ein Richtungswechsel nichts her - dort wirkt er wie Aussetzen.
      const twoPlayers = table.turnOrder.length <= 2;
      logText = `${logText} - ${twoPlayers ? text.skipped : text.reversed}`;
      table = advanceTurn(reverseDirection(table), twoPlayers ? 2 : 1);
    } else {
      table = advanceTurn(table);
    }

    if (wishSuitId) {
      const suit = context.deck.suits.find((entry) => entry.id === wishSuitId);
      logText = `${logText} - ${text.wished} ${suit?.label ?? wishSuitId} ${suit?.symbol ?? ""}`.trim();
    }

    const next = appendLog(
      clearError({
        ...state,
        table,
        pendingDraw,
        drawnThisTurn: 0,
        extra: { ...state.extra, mauDrawnCardId: null, mauDrawnCardIds: null },
        wishSuitId,
        turnNumber: state.turnNumber + 1,
        updatedAt: context.now
      }),
      name,
      logText
    );

    if (handOf(table, playerId).length === 0) {
      return finishGame(next, playerId, name, `${name} ${text.wins}`);
    }

    return next;
  },

  drawCard(state, context, playerId) {
    const text = words(context);

    if (!isActive(state, playerId)) {
      return withError(state, text.notYourTurn as string);
    }

    if (state.pendingDraw > 0) {
      const penalty = state.pendingDraw;
      const result = drawCards(state.table, playerId, penalty);
      const drawn = clearError({
        ...state,
        table: result.state,
        pendingDraw: 0,
        drawnThisTurn: result.drawnCardIds.length,
        extra: { ...state.extra, mauDrawnCardId: null, mauDrawnCardIds: JSON.stringify(result.drawnCardIds) },
        updatedAt: context.now
      });
      const canPlayDrawn = context.settings.cardTableMauPlayPenaltyDrawn === "on"
        && result.drawnCardIds.length > 0 && hasPlayableCard(drawn, context, playerId);

      return appendLog(
        canPlayDrawn ? drawn : {
          ...drawn,
          table: advanceTurn(drawn.table),
          drawnThisTurn: 0,
          extra: { ...drawn.extra, mauDrawnCardIds: null },
          turnNumber: state.turnNumber + 1
        },
        playerName(context, playerId),
        `${text.drewMany} ${result.drawnCardIds.length} ${text.cards}`
      );
    }

    if (state.drawnThisTurn === 0) {
      const result = drawCards(state.table, playerId, 1);

      if (result.exhausted) {
        const anyoneCanPlay = state.table.turnOrder.some((id, activeIndex) =>
          hasPlayableCard({ ...state, table: { ...state.table, activeIndex } }, context, id)
        );
        if (!anyoneCanPlay) {
          return finishGame(state, null, null, text.blocked as string);
        }
        return appendLog(clearError({
          ...state, table: advanceTurn(state.table), drawnThisTurn: 0,
          turnNumber: state.turnNumber + 1, updatedAt: context.now
        }), playerName(context, playerId), `${text.exhausted} ${text.passed}`);
      }

      const drawn = clearError({
        ...state,
        table: result.state,
        drawnThisTurn: 1,
        extra: { ...state.extra, mauDrawnCardId: null, mauDrawnCardIds: JSON.stringify(result.drawnCardIds) },
        updatedAt: context.now
      });

      if (optionOn(context, "PlayDrawn") && hasPlayableCard(drawn, context, playerId)) {
        return appendLog(drawn, playerName(context, playerId), text.drew as string);
      }

      return appendLog(
        {
          ...drawn,
          table: advanceTurn(drawn.table),
          drawnThisTurn: 0,
          turnNumber: drawn.turnNumber + 1
        },
        playerName(context, playerId),
        `${text.drew} - ${text.passed}`
      );
    }

    return mauMauRuleset.runAction(state, context, playerId, "pass");
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (actionId !== "pass" || !isActive(state, playerId)) {
      return state;
    }

    if (state.pendingDraw > 0) {
      return withError(state, text.mustSeven as string);
    }

    if (state.drawnThisTurn === 0) {
      return withError(state, text.mustDraw as string);
    }

    return appendLog(
      clearError({
        ...state,
        table: advanceTurn(state.table),
        drawnThisTurn: 0,
        extra: { ...state.extra, mauDrawnCardId: null, mauDrawnCardIds: null },
        turnNumber: state.turnNumber + 1,
        updatedAt: context.now
      }),
      playerName(context, playerId),
      text.passed as string
    );
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const text = words(context);
    const active = isActive(state, playerId) && state.phase === "playing" && !state.gameOver;

    return [
      {
        id: "draw",
        label:
          state.pendingDraw > 0 ? `${text.draw} +${state.pendingDraw}` : (text.draw as string),
        kind: state.pendingDraw > 0 ? "danger" : "primary",
        enabled: active
      },
      {
        id: "pass",
        label: text.pass as string,
        kind: "secondary",
        enabled: active && state.drawnThisTurn > 0
      }
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    const text = words(context);
    const enabled = state.phase === "playing" && !state.gameOver;

    return [
      {
        id: "draw",
        label:
          state.pendingDraw > 0 ? `${text.draw} +${state.pendingDraw}` : (text.draw as string),
        kind: "primary",
        enabled
      },
      { id: "recycle", label: text.recycle as string, kind: "secondary", enabled },
      { id: "end", label: text.end as string, kind: "danger", enabled }
    ];
  },

  runHostAction(state, context, actionId) {
    const text = words(context);
    const active = state.table.turnOrder[state.table.activeIndex];

    if (actionId === "draw" && active) {
      return mauMauRuleset.drawCard(state, context, active);
    }

    if (actionId === "recycle") {
      return appendLog(
        { ...state, table: recycleDiscardPile(state.table), updatedAt: context.now },
        null,
        text.recycled as string
      );
    }

    if (actionId === "end") {
      return finishGame(state, null, null, text.ended as string);
    }

    return state;
  },

  choiceForCard(state, context, cardId) {
    const card = state.table.cards[cardId];

    if (!card || !isWild(context.deck, card)) {
      return undefined;
    }

    return suitChoice(context.deck, words(context).needWish as string);
  },

  condition(state, context) {
    const text = words(context);

    if (state.wishSuitId) {
      const suit = context.deck.suits.find((entry) => entry.id === state.wishSuitId);

      return {
        label: `${text.wishShort}: ${suit?.label ?? state.wishSuitId}`,
        symbol: suit?.symbol,
        color: suit?.color
      };
    }

    if (state.pendingDraw > 0) {
      return { label: `+${state.pendingDraw}`, symbol: "!", color: "red" };
    }

    return undefined;
  },

  seatStatus(state, context, playerId) {
    return handOf(state.table, playerId).length === 1 ? (words(context).mau as string) : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Mau-Mau" }]
      : [];
  },

  /**
   * KI-Zug.
   *
   * Grundhaltung: Sonderkarten sind Munition, keine Ballast. Der Bot spart sie
   * auf, solange die Runde ruhig läuft, und feuert sie, sobald jemand kurz vor
   * dem Sieg steht. Der Bube ist die teuerste Karte - er passt immer und wird
   * deshalb zuletzt gelegt.
   */
  botMove(state, context, playerId) {
    if (!isActive(state, playerId)) {
      return { kind: "wait" };
    }

    const hand = handOf(state.table, playerId);
    const playable = hand.filter(
      (cardId) => mauMauRuleset.canPlayCard(state, context, playerId, cardId).allowed
    );

    if (playable.length === 0) {
      return state.drawnThisTurn === 0 ? { kind: "draw" } : { kind: "action", actionId: "pass" };
    }

    // Gestapelte Siebenen: weiterreichen, solange eine da ist.
    if (state.pendingDraw > 0) {
      const seven = playable[0];

      return seven ? { kind: "play", cardId: seven } : { kind: "draw" };
    }

    const pressure = smallestOpponentHand(state, playerId) <= 2;
    const counts = suitCounts(state, playerId);

    const cardId = bestOf(playable, (entry) => {
      const card = state.table.cards[entry];

      if (!card) {
        return -100;
      }

      const wild = isWild(context.deck, card);
      const attack =
        mauMauRules.drawTwoRankIds.includes(card.rankId as never) ||
        (optionOn(context, "SkipEights") && mauMauRules.skipRankIds.includes(card.rankId as never));

      // Wunschkarten halten, solange es andere Wege gibt.
      if (wild) {
        return hand.length <= 2 ? 40 : -20;
      }

      if (attack) {
        return pressure ? 60 : 5;
      }

      // Sonst aus der längsten Farbe legen - das hält die Hand anschlussfähig.
      return 15 + (counts.get(card.suitId ?? "") ?? 0);
    });

    if (!cardId) {
      return { kind: "draw" };
    }

    const card = state.table.cards[cardId];

    if (!card || !isWild(context.deck, card)) {
      return { kind: "play", cardId };
    }

    // Gewünscht wird die Farbe, die nach dem Legen am stärksten auf der Hand ist.
    const remaining = new Map(counts);
    const ownSuit = card.suitId;

    if (ownSuit) {
      remaining.set(ownSuit, (remaining.get(ownSuit) ?? 1) - 1);
    }

    const wish = bestOf(context.deck.suits, (suit) => remaining.get(suit.id) ?? 0);

    return { kind: "play", cardId, choiceId: wish?.id };
  }
};
