import type {
  CardTableActionInput,
  CardTableDrawInput,
  CardTablePlayInput
} from "../protocol.js";

export function createCardTablePlayInput(
  playerId: string,
  cardId: string,
  choiceId?: string
): CardTablePlayInput {
  return {
    type: "card-table:play",
    playerId,
    cardId,
    choiceId,
    sentAt: Date.now()
  };
}

export function createCardTableDrawInput(playerId: string): CardTableDrawInput {
  return {
    type: "card-table:draw",
    playerId,
    sentAt: Date.now()
  };
}

export function createCardTableActionInput(
  playerId: string,
  actionId: string
): CardTableActionInput {
  return {
    type: "card-table:action",
    playerId,
    actionId,
    sentAt: Date.now()
  };
}
