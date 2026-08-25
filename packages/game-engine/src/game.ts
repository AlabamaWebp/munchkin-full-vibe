import { CardSetId, GameMode, type CardSet } from "./cards.js";
import { createDevelopmentCardSet } from "./development-cards.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import type { GameId } from "./identifiers.js";

export const DEFAULT_MAX_HAND_SIZE = 5;
export const MIN_MAX_HAND_SIZE = 3;
export const MAX_MAX_HAND_SIZE = 10;

export interface CreateGameOptions {
  readonly id: GameId;
  readonly cardSet?: CardSet;
  readonly config?: {
    readonly mode: GameMode;
    readonly enabledSetIds: readonly CardSetId[];
    readonly maxHandSize?: number;
    readonly doubleMonsterAmbushEnabled?: boolean;
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
    maxHandSize: DEFAULT_MAX_HAND_SIZE,
    doubleMonsterAmbushEnabled: false,
  };
  if (
    config.enabledSetIds.filter((id) => id === CardSetId.CORE).length !== 1 ||
    new Set(config.enabledSetIds).size !== config.enabledSetIds.length
  ) {
    throw new TypeError(
      "Game config must contain CORE exactly once and no duplicate sets.",
    );
  }
  const maxHandSize = config.maxHandSize ?? DEFAULT_MAX_HAND_SIZE;
  if (
    !Number.isSafeInteger(maxHandSize) ||
    maxHandSize < MIN_MAX_HAND_SIZE ||
    maxHandSize > MAX_MAX_HAND_SIZE
  ) {
    throw new TypeError(
      `Maximum hand size must be an integer from ${MIN_MAX_HAND_SIZE} through ${MAX_MAX_HAND_SIZE}.`,
    );
  }
  const knownSetIds = new Set<CardSetId>(Object.values(CardSetId));
  if (config.enabledSetIds.some((id) => !knownSetIds.has(id))) {
    throw new TypeError("Game config includes an unknown card set.");
  }
  const enabledSetIds = new Set(config.enabledSetIds);
  const definitions = unfilteredCardSet.definitions.filter(
    (definition) =>
      enabledSetIds.has(definition.setId) &&
      (definition.requiredGameOption !== "DOUBLE_MONSTER_AMBUSH" ||
        config.doubleMonsterAmbushEnabled === true),
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
      maxHandSize,
      doubleMonsterAmbushEnabled: config.doubleMonsterAmbushEnabled ?? false,
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
