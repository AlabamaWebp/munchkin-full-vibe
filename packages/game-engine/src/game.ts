import type { CardSet } from "./cards.js";
import { createDevelopmentCardSet } from "./development-cards.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import type { GameId } from "./identifiers.js";

export interface CreateGameOptions {
  readonly id: GameId;
  readonly cardSet?: CardSet;
}

function assertValidCardSet(cardSet: CardSet): void {
  const definitionIds = new Set(
    cardSet.definitions.map((definition) => definition.id),
  );
  const allCards = [...cardSet.doorDeck, ...cardSet.treasureDeck];
  const instanceIds = new Set(allCards.map((card) => card.instanceId));

  if (definitionIds.size !== cardSet.definitions.length) {
    throw new TypeError("Card definition ids must be unique.");
  }

  if (instanceIds.size !== allCards.length) {
    throw new TypeError("Card instance ids must be unique.");
  }

  for (const card of allCards) {
    if (!definitionIds.has(card.definitionId)) {
      throw new TypeError(
        `Card ${card.instanceId} references an unknown definition.`,
      );
    }
  }
}

export function createGame(options: CreateGameOptions): GameState {
  const cardSet = options.cardSet ?? createDevelopmentCardSet();
  assertValidCardSet(cardSet);

  return {
    schemaVersion: 4,
    id: options.id,
    status: GameStatus.LOBBY,
    phase: GamePhase.LOBBY,
    players: [],
    activePlayerId: null,
    cardDefinitions: [...cardSet.definitions],
    doorDeck: [...cardSet.doorDeck],
    treasureDeck: [...cardSet.treasureDeck],
    doorDiscard: [],
    treasureDiscard: [],
    combat: null,
    lastRunAwayResult: null,
    pendingDecision: null,
    eventLog: [],
    turnNumber: 0,
    winnerId: null,
  };
}
