import { CardSetId, GameMode, type CardSet } from "./cards.js";
import { createDevelopmentCardSet } from "./development-cards.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import type { GameId } from "./identifiers.js";

export interface CreateGameOptions {
  readonly id: GameId;
  readonly cardSet?: CardSet;
  readonly config?: {
    readonly mode: GameMode;
    readonly enabledSetIds: readonly CardSetId[];
  };
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
  const unfilteredCardSet = options.cardSet ?? createDevelopmentCardSet();
  const config = options.config ?? {
    mode: GameMode.BALANCED,
    enabledSetIds: [CardSetId.CORE],
  };
  if (
    config.enabledSetIds.filter((id) => id === CardSetId.CORE).length !== 1 ||
    new Set(config.enabledSetIds).size !== config.enabledSetIds.length
  ) {
    throw new TypeError(
      "Game config must contain CORE exactly once and no duplicate sets.",
    );
  }
  const knownSetIds = new Set<CardSetId>(Object.values(CardSetId));
  if (config.enabledSetIds.some((id) => !knownSetIds.has(id))) {
    throw new TypeError("Game config includes an unknown card set.");
  }
  const enabledSetIds = new Set(config.enabledSetIds);
  const definitions = unfilteredCardSet.definitions.filter((definition) =>
    enabledSetIds.has(definition.setId),
  );
  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const cardSet: CardSet = {
    definitions,
    doorDeck: unfilteredCardSet.doorDeck.filter((card) =>
      definitionIds.has(card.definitionId),
    ),
    treasureDeck: unfilteredCardSet.treasureDeck.filter((card) =>
      definitionIds.has(card.definitionId),
    ),
  };
  assertValidCardSet(cardSet);

  return {
    schemaVersion: 5,
    config: Object.freeze({
      mode: config.mode,
      enabledSetIds: Object.freeze([...config.enabledSetIds]),
    }),
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
    nextCombatSequence: 1,
    lastRunAwayResult: null,
    pendingDecision: null,
    curseResponse: null,
    nextCurseResponseSequence: 1,
    nextPendingDecisionSequence: 1,
    eventLog: [],
    turnNumber: 0,
    winnerId: null,
  };
}
