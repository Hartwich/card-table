import type { ScoreEntry, SupportedLanguage } from "@open-party-lab/game-core";
import { advanceTurn, handOf, moveCard, toCardFace } from "../cards/cardTable.js";
import type { CardInstance, CardRankDefinition } from "../cards/cardTypes.js";
import type {
  CardTableActionState,
  CardTableRuleSectionState,
  CardTableStackState
} from "../protocol.js";
import { bestOf, stableChance } from "../bots/tactics.js";
import {
  appendLog,
  clearError,
  finishGame,
  playerName,
  readNumber,
  readText,
  withError,
  writeExtra,
  type CardGameState,
  type CardRuleset,
  type CardRulesetContext
} from "./types.js";

/**
 * Lügen.
 *
 * Der Stapel in der Mitte liegt verdeckt. Wer am Zug ist, legt genau eine Karte
 * darauf und sagt dabei den Wert an, der gerade dran ist - ob die Karte wirklich
 * passt, weiß nur er selbst. Alle anderen dürfen anzweifeln: Wer sich irrt,
 * nimmt den kompletten Stapel auf die Hand.
 *
 * Zeigt auf dem Fundament, dass auch Spieler handeln können, die nicht am Zug
 * sind, und dass eine Tischzone verdeckt bleiben darf.
 */

const pileZoneId = "stapel";
const claimKey = "claimIndex";
const lastPlayerKey = "lastPlayerId";
const lastCardKey = "lastCardId";

const copy: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    intro: "Lügen: Leg verdeckt ab und sag den geforderten Wert an - oder bluff.",
    doubt: "Zweifeln",
    notYourTurn: "Du bist nicht am Zug.",
    notInHand: "Diese Karte liegt nicht auf deiner Hand.",
    nothingToDoubt: "Es liegt nichts zum Anzweifeln.",
    ownCard: "Deine eigene Karte kannst du nicht anzweifeln.",
    claims: "sagt",
    andPlays: "an und legt verdeckt ab",
    doubts: "zweifelt an",
    lied: "hat gelogen",
    told: "hat die Wahrheit gesagt",
    takesPile: "nimmt den Stapel",
    wins: "ist alle Karten los.",
    claimLabel: "Angesagt",
    yourTurn: "Du bist dran",
    canDoubt: "Du darfst anzweifeln",
    pile: "Stapel",
    lastCardWas: "Die Karte war"
  },
  en: {
    intro: "Cheat: play a card face down and claim the required rank - or bluff.",
    doubt: "Call bluff",
    notYourTurn: "It is not your turn.",
    notInHand: "That card is not in your hand.",
    nothingToDoubt: "There is nothing to call.",
    ownCard: "You cannot call your own card.",
    claims: "claims",
    andPlays: "and plays face down",
    doubts: "calls the bluff on",
    lied: "was lying",
    told: "told the truth",
    takesPile: "takes the pile",
    wins: "played their last card.",
    claimLabel: "Claimed",
    yourTurn: "Your turn",
    canDoubt: "You may call the bluff",
    pile: "Pile",
    lastCardWas: "The card was"
  }
};

function words(context: CardRulesetContext): Record<string, string> {
  return copy[context.language] ?? copy.de;
}

/** Die Werte, die reihum angesagt werden. */
function claimRanks(context: CardRulesetContext): CardRankDefinition[] {
  return context.deck.ranks.filter((rank) => rank.id !== "joker");
}

function claimRank(state: CardGameState, context: CardRulesetContext): CardRankDefinition | null {
  const ranks = claimRanks(context);
  return ranks.length === 0 ? null : ranks[readNumber(state, claimKey) % ranks.length] ?? null;
}

function isActive(state: CardGameState, playerId: string): boolean {
  return state.table.turnOrder[state.table.activeIndex] === playerId;
}

function pileCardIds(state: CardGameState): string[] {
  return state.table.zones[pileZoneId] ?? [];
}

function canDoubt(state: CardGameState, playerId: string): boolean {
  return (
    pileCardIds(state).length > 0 &&
    Boolean(readText(state, lastCardKey)) &&
    readText(state, lastPlayerKey) !== playerId
  );
}

/** Gibt den kompletten Stapel an einen Spieler und startet die Ansage neu. */
function handPileTo(
  state: CardGameState,
  context: CardRulesetContext,
  playerId: string
): CardGameState {
  let table = state.table;

  for (const cardId of pileCardIds(state)) {
    table = moveCard(table, cardId, { kind: "hand", playerId }, "bottom");
  }

  const index = Math.max(0, table.turnOrder.indexOf(playerId));

  return writeExtra(
    {
      ...state,
      table: { ...table, activeIndex: index },
      turnNumber: state.turnNumber + 1,
      updatedAt: context.now
    },
    { [claimKey]: 0, [lastPlayerKey]: null, [lastCardKey]: null }
  );
}

export const luegenRuleset: CardRuleset = {
  id: "luegen",
  label: { de: "Lügen", en: "Cheat" },
  defaultDeckId: "french-52",
  allowedDeckIds: ["french-52", "skat-32", "party-40"],
  defaultHandSize: 6,
  openStartCard: false,
  turnBased: false,

  setupRound(state) {
    return {
      ...state,
      table: { ...state.table, zones: { ...state.table.zones, [pileZoneId]: [] } },
      extra: { ...state.extra, [claimKey]: 0, [lastPlayerKey]: null, [lastCardKey]: null }
    };
  },

  rules(context): CardTableRuleSectionState[] {
    const en = context.language === "en";

    return en
      ? [
          {
            title: "Goal",
            lines: ["Be the first to get rid of every card in your hand."]
          },
          {
            title: "Your turn",
            lines: [
              "The table announces which rank is due — aces, then twos, then threes, and so on.",
              "Play exactly one card face down onto the pile and claim that rank.",
              "Nobody sees the card. You may play the real rank or bluff with anything."
            ]
          },
          {
            title: "Calling a bluff",
            lines: [
              "Every other player may call the last card as long as it lies on top.",
              "The card is turned over: was it a lie, the player who put it there takes the whole pile.",
              "Was it honest, the caller takes the pile instead.",
              "Whoever picks up the pile starts the next round, and the announcement begins again."
            ]
          },
          {
            title: "The last card",
            lines: [
              "A card that empties your hand is always turned over.",
              "Honest? You win the round. A bluff? You take the pile and play continues."
            ]
          },
          {
            title: "On your phone",
            lines: [
              "Cards can be tapped even when it is not your turn — only Call bluff is active then.",
              "The claimed rank is shown on the table and above your hand."
            ]
          }
        ]
      : [
          {
            title: "Ziel",
            lines: ["Werde als Erster alle Karten von der Hand los."]
          },
          {
            title: "Dein Zug",
            lines: [
              "Der Tisch sagt an, welcher Wert dran ist — erst Ass, dann Zwei, dann Drei, und so weiter.",
              "Leg genau eine Karte verdeckt auf den Stapel und sag diesen Wert an.",
              "Niemand sieht die Karte. Du darfst den echten Wert legen oder mit irgendetwas bluffen."
            ]
          },
          {
            title: "Anzweifeln",
            lines: [
              "Jeder andere darf die zuletzt gelegte Karte anzweifeln, solange sie obenauf liegt.",
              "Die Karte wird umgedreht: War es gelogen, nimmt der Leger den ganzen Stapel auf.",
              "War es ehrlich, nimmt der Zweifler den Stapel.",
              "Wer den Stapel nimmt, beginnt die nächste Runde, und die Ansage fängt von vorn an."
            ]
          },
          {
            title: "Die letzte Karte",
            lines: [
              "Eine Karte, die deine Hand leert, wird immer aufgedeckt.",
              "War sie ehrlich, gewinnst du die Runde. War sie gelogen, nimmst du den Stapel und es geht weiter."
            ]
          },
          {
            title: "Am Handy",
            lines: [
              "Die Karten lassen sich auch antippen, wenn du nicht am Zug bist — aktiv ist dann nur „Zweifeln“.",
              "Der geforderte Wert steht auf dem Tisch und über deiner Hand."
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

    // Bluffen ist erlaubt: Am Zug darf jede Karte auf den Stapel.
    return isActive(state, playerId)
      ? { allowed: true }
      : { allowed: false, hint: text.notYourTurn as string };
  },

  playCard(state, context, playerId, cardId) {
    const text = words(context);
    const check = luegenRuleset.canPlayCard(state, context, playerId, cardId);

    if (!check.allowed) {
      return withError(state, check.hint ?? (text.notYourTurn as string));
    }

    const claimed = claimRank(state, context);
    const card = state.table.cards[cardId] as CardInstance;
    const table = moveCard(state.table, cardId, { kind: "zone", zoneId: pileZoneId }, "top");
    const played = appendLog(
      clearError(
        writeExtra({ ...state, table, updatedAt: context.now }, {
          [lastPlayerKey]: playerId,
          [lastCardKey]: cardId
        })
      ),
      playerName(context, playerId),
      `${text.claims} ${claimed?.label ?? "?"} ${text.andPlays}`
    );

    // Die letzte Karte wird immer aufgedeckt - auf der lässt sich nicht bluffen.
    if (handOf(table, playerId).length === 0) {
      const honest = claimed && card.rankId === claimed.id;
      const face = toCardFace(context.deck, card);

      if (honest) {
        return finishGame(
          played,
          playerId,
          playerName(context, playerId),
          `${playerName(context, playerId)} ${text.wins}`
        );
      }

      const caught = appendLog(
        played,
        playerName(context, playerId),
        `${text.lied} — ${text.lastCardWas} ${face.rankLabel} ${face.suitSymbol}`
      );

      return handPileTo(caught, context, playerId);
    }

    return writeExtra(
      {
        ...played,
        table: advanceTurn(played.table),
        turnNumber: played.turnNumber + 1
      },
      { [claimKey]: readNumber(state, claimKey) + 1 }
    );
  },

  drawCard(state, context, playerId) {
    return luegenRuleset.runAction(state, context, playerId, "doubt");
  },

  runAction(state, context, playerId, actionId) {
    const text = words(context);

    if (actionId !== "doubt") {
      return state;
    }

    const lastCardId = readText(state, lastCardKey);
    const lastPlayerId = readText(state, lastPlayerKey);

    if (!lastCardId || !lastPlayerId) {
      return withError(state, text.nothingToDoubt as string);
    }

    if (lastPlayerId === playerId) {
      return withError(state, text.ownCard as string);
    }

    // Die Ansage der zuletzt gelegten Karte lag einen Schritt zurück.
    const ranks = claimRanks(context);
    const claimedIndex = (readNumber(state, claimKey) - 1 + ranks.length) % Math.max(1, ranks.length);
    const claimed = ranks[claimedIndex] ?? null;
    const card = state.table.cards[lastCardId];
    const face = card ? toCardFace(context.deck, card) : null;
    const lied = Boolean(claimed && card && card.rankId !== claimed.id);
    const loser = lied ? lastPlayerId : playerId;

    const revealed = appendLog(
      appendLog(
        clearError(state),
        playerName(context, playerId),
        `${text.doubts} ${playerName(context, lastPlayerId)}`
      ),
      null,
      `${text.lastCardWas} ${face ? `${face.rankLabel} ${face.suitSymbol}` : "?"} — ${playerName(context, lastPlayerId)} ${lied ? text.lied : text.told}`
    );

    return appendLog(
      handPileTo(revealed, context, loser),
      playerName(context, loser),
      text.takesPile as string
    );
  },

  controllerActions(state, context, playerId): CardTableActionState[] {
    const text = words(context);
    const playing = state.phase === "playing" && !state.gameOver;

    return [
      {
        id: "doubt",
        label: text.doubt as string,
        kind: "danger",
        enabled: playing && canDoubt(state, playerId)
      }
    ];
  },

  hostActions(state, context): CardTableActionState[] {
    return [
      {
        id: "end",
        label: context.language === "en" ? "End round" : "Runde beenden",
        kind: "danger",
        enabled: state.phase === "playing" && !state.gameOver
      }
    ];
  },

  runHostAction(state, context, actionId) {
    return actionId === "end"
      ? finishGame(state, null, null, context.language === "en" ? "The host ended the round." : "Der Host hat die Runde beendet.")
      : state;
  },

  choiceForCard() {
    return undefined;
  },

  tableStacks(state, context): CardTableStackState[] {
    return [
      {
        id: pileZoneId,
        label: words(context).pile as string,
        kind: "zone",
        count: pileCardIds(state).length,
        cards: [],
        faceDown: true
      }
    ];
  },

  condition(state, context) {
    const claimed = claimRank(state, context);

    if (!claimed) {
      return undefined;
    }

    return { label: `${words(context).claimLabel}: ${claimed.label}`, color: "neutral" };
  },

  privateNote(state, context, playerId) {
    const text = words(context);

    if (isActive(state, playerId)) {
      const claimed = claimRank(state, context);
      return `${text.yourTurn}: ${claimed?.label ?? "?"}`;
    }

    return canDoubt(state, playerId) ? (text.canDoubt as string) : undefined;
  },

  seatStatus(state, context, playerId) {
    return readText(state, lastPlayerKey) === playerId ? (words(context).claims as string) : undefined;
  },

  isFinished(state) {
    return state.gameOver;
  },

  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [{ playerId: state.winnerPlayerId, delta: 1, reason: "Lügen" }]
      : [];
  },

  // Zweifeln darf jeder, nicht nur wer am Zug ist - also werden auch KI-Sitze
  // gefragt, die gerade nur zuschauen.
  botActsOutOfTurn: true,

  /**
   * KI-Zug.
   *
   * Am Zug spielt der Bot ehrlich, solange er die geforderte Karte hat, und
   * blufft sonst mit der Karte, die erst in vielen Runden wieder gefragt ist.
   *
   * Beim Zweifeln zählt er mit: Hält er selbst schon die meisten Karten des
   * angesagten Werts, kann die Ansage kaum stimmen. Ansonsten zweifelt er nur
   * gelegentlich - und lieber bei kleinem Stapel, weil ein Irrtum ihn den
   * ganzen Stapel kostet. Die Entscheidung fällt einmal pro Ansage und bleibt
   * dann stehen, damit der Tisch nicht bei jedem Tick neu würfelt.
   */
  botMove(state, context, playerId) {
    const ranks = claimRanks(context);
    const hand = handOf(state.table, playerId);

    if (isActive(state, playerId)) {
      const claimed = claimRank(state, context);
      const honest = hand.find((cardId) => state.table.cards[cardId]?.rankId === claimed?.id);

      if (honest) {
        return { kind: "play", cardId: honest };
      }

      const claimIndex = readNumber(state, claimKey) % Math.max(1, ranks.length);
      // Geblufft wird mit der Karte, die am längsten nicht gefragt sein wird.
      const bluff = bestOf(hand, (cardId) => {
        const rankId = state.table.cards[cardId]?.rankId;
        const index = ranks.findIndex((rank) => rank.id === rankId);

        return index < 0 ? 0 : (index - claimIndex + ranks.length) % ranks.length;
      });

      return bluff ? { kind: "play", cardId: bluff } : { kind: "wait" };
    }

    if (!canDoubt(state, playerId)) {
      return { kind: "wait" };
    }

    const claimedIndex = (readNumber(state, claimKey) - 1 + ranks.length) % Math.max(1, ranks.length);
    const claimedRank = ranks[claimedIndex] ?? null;
    const own = hand.filter((cardId) => state.table.cards[cardId]?.rankId === claimedRank?.id).length;
    const seed = `${readText(state, lastCardKey) ?? ""}|${playerId}|${claimedIndex}`;
    const pile = pileCardIds(state).length;

    if (own >= 3) {
      return { kind: "action", actionId: "doubt" };
    }

    const chance = own === 2 ? 0.45 : pile <= 3 ? 0.14 : 0.05;

    return stableChance(seed, chance) ? { kind: "action", actionId: "doubt" } : { kind: "wait" };
  }
};
