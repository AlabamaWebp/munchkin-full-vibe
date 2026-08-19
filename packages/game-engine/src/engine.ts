import {
  CardType,
  DeckType,
  type CardDefinition,
  type CardEffect,
  type CardInstance,
} from "./cards.js";
import type { GameCommand } from "./commands.js";
import type { GameEvent } from "./events.js";
import {
  GamePhase,
  GameStatus,
  type GameState,
  type PlayerState,
} from "./game-state.js";
import type { PlayerId } from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
export const STARTING_HAND_SIZE_PER_DECK = 4;

export interface CommandContext {
  readonly random: RandomSource;
}

export type CommandErrorCode =
  | "ACTOR_NOT_FOUND"
  | "CARD_NOT_IN_HAND"
  | "COMMAND_NOT_AVAILABLE"
  | "DECK_EMPTY"
  | "DUPLICATE_PLAYER_ID"
  | "GAME_ALREADY_STARTED"
  | "INSUFFICIENT_CARDS"
  | "INVALID_PHASE"
  | "INVALID_PLAYER_NAME"
  | "NOT_ACTIVE_PLAYER"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYER_LIMIT_REACHED";

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}

export type CommandResult =
  | {
      readonly success: true;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  | {
      readonly success: false;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      readonly error: CommandError;
    };

function fail(
  state: GameState,
  code: CommandErrorCode,
  message: string,
): CommandResult {
  return { success: false, state, events: [], error: { code, message } };
}

function succeed(
  state: GameState,
  events: readonly GameEvent[],
): CommandResult {
  return { success: true, state, events };
}

function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = random.nextInt(index + 1);
    const current = shuffled[index];
    const other = shuffled[otherIndex];

    if (current === undefined || other === undefined) {
      throw new RangeError("Shuffle index was outside the deck.");
    }

    shuffled[index] = other;
    shuffled[otherIndex] = current;
  }

  return shuffled;
}

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  update: (player: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? update(player) : player,
    ),
  };
}

function findDefinition(state: GameState, card: CardInstance): CardDefinition {
  const definition = state.cardDefinitions.find(
    (candidate) => candidate.id === card.definitionId,
  );

  if (definition === undefined) {
    throw new TypeError(
      `Card ${card.instanceId} references missing definition ${card.definitionId}.`,
    );
  }

  return definition;
}

function addToDiscard(
  state: GameState,
  cards: readonly CardInstance[],
): GameState {
  const doorCards: CardInstance[] = [];
  const treasureCards: CardInstance[] = [];

  for (const card of cards) {
    const definition = findDefinition(state, card);
    (definition.deck === DeckType.DOOR ? doorCards : treasureCards).push(card);
  }

  return {
    ...state,
    doorDiscard: [...state.doorDiscard, ...doorCards],
    treasureDiscard: [...state.treasureDiscard, ...treasureCards],
  };
}

interface EffectResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

function drawEffectCards(
  state: GameState,
  playerId: PlayerId,
  deck: DeckType,
  count: number,
): EffectResult {
  const sourceDeck =
    deck === DeckType.DOOR ? state.doorDeck : state.treasureDeck;
  const drawn = sourceDeck.slice(0, count);
  let nextState = updatePlayer(state, playerId, (player) => ({
    ...player,
    hand: [...player.hand, ...drawn],
  }));

  nextState =
    deck === DeckType.DOOR
      ? { ...nextState, doorDeck: sourceDeck.slice(drawn.length) }
      : { ...nextState, treasureDeck: sourceDeck.slice(drawn.length) };

  return {
    state: nextState,
    events: drawn.map((card) => ({
      type: "CARD_DRAWN",
      visibility: "PRIVATE",
      recipientPlayerId: playerId,
      playerId,
      cardId: card.instanceId,
      definitionId: card.definitionId,
      deck,
    })),
  };
}

function discardRandomCards(
  state: GameState,
  playerId: PlayerId,
  effect: Extract<CardEffect, { readonly type: "DISCARD_RANDOM_CARDS" }>,
  random: RandomSource,
): EffectResult {
  const player = state.players.find((candidate) => candidate.id === playerId);

  if (player === undefined) {
    throw new TypeError(
      `Player ${playerId} is missing during effect resolution.`,
    );
  }

  const source = [...(effect.zone === "HAND" ? player.hand : player.equipment)];
  const discarded: CardInstance[] = [];

  while (discarded.length < effect.count && source.length > 0) {
    const index = random.nextInt(source.length);
    const [card] = source.splice(index, 1);

    if (card !== undefined) {
      discarded.push(card);
    }
  }

  let nextState = updatePlayer(state, playerId, (current) =>
    effect.zone === "HAND"
      ? { ...current, hand: source }
      : { ...current, equipment: source },
  );
  nextState = addToDiscard(nextState, discarded);

  return {
    state: nextState,
    events:
      discarded.length === 0
        ? []
        : [
            {
              type: "CARDS_DISCARDED",
              visibility: "PRIVATE",
              recipientPlayerId: playerId,
              playerId,
              cardIds: discarded.map((card) => card.instanceId),
            },
          ],
  };
}

function applyEffects(
  state: GameState,
  playerId: PlayerId,
  effects: readonly CardEffect[],
  random: RandomSource,
): EffectResult {
  let nextState = state;
  const events: GameEvent[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "COMBAT_BONUS":
        nextState = updatePlayer(nextState, playerId, (player) => ({
          ...player,
          temporaryCombatBonus: player.temporaryCombatBonus + effect.amount,
        }));
        break;
      case "GAIN_LEVEL":
        nextState = updatePlayer(nextState, playerId, (player) => ({
          ...player,
          level: player.level + effect.amount,
        }));
        break;
      case "LOSE_LEVEL":
        nextState = updatePlayer(nextState, playerId, (player) => ({
          ...player,
          level: Math.max(1, player.level - effect.amount),
        }));
        break;
      case "DRAW_CARDS": {
        const result = drawEffectCards(
          nextState,
          playerId,
          effect.deck,
          effect.count,
        );
        nextState = result.state;
        events.push(...result.events);
        break;
      }
      case "DISCARD_RANDOM_CARDS": {
        const result = discardRandomCards(nextState, playerId, effect, random);
        nextState = result.state;
        events.push(...result.events);
        break;
      }
    }
  }

  return { state: nextState, events };
}

function addPlayer(
  state: GameState,
  command: Extract<GameCommand, { readonly type: "ADD_PLAYER" }>,
): CommandResult {
  if (state.status !== GameStatus.LOBBY) {
    return fail(
      state,
      "GAME_ALREADY_STARTED",
      "Players cannot be added after the game has started.",
    );
  }

  if (state.players.some((player) => player.id === command.actorId)) {
    return fail(
      state,
      "DUPLICATE_PLAYER_ID",
      `Player ${command.actorId} is already in the game.`,
    );
  }

  if (state.players.length >= MAX_PLAYERS) {
    return fail(
      state,
      "PLAYER_LIMIT_REACHED",
      `A game supports at most ${MAX_PLAYERS} players.`,
    );
  }

  const name = command.name.trim();
  if (name.length === 0) {
    return fail(state, "INVALID_PLAYER_NAME", "Player name must not be empty.");
  }

  const player: PlayerState = {
    id: command.actorId,
    name,
    level: 1,
    hand: [],
    equipment: [],
    temporaryCombatBonus: 0,
  };

  return succeed({ ...state, players: [...state.players, player] }, [
    {
      type: "PLAYER_ADDED",
      visibility: "PUBLIC",
      playerId: player.id,
      name: player.name,
    },
  ]);
}

function startGame(state: GameState, random: RandomSource): CommandResult {
  if (state.status !== GameStatus.LOBBY) {
    return fail(state, "GAME_ALREADY_STARTED", "The game has already started.");
  }

  if (state.players.length < MIN_PLAYERS) {
    return fail(
      state,
      "NOT_ENOUGH_PLAYERS",
      `At least ${MIN_PLAYERS} player is required to start.`,
    );
  }

  const cardsNeeded = state.players.length * STARTING_HAND_SIZE_PER_DECK;
  if (
    state.doorDeck.length < cardsNeeded ||
    state.treasureDeck.length < cardsNeeded
  ) {
    return fail(
      state,
      "INSUFFICIENT_CARDS",
      `Each deck needs at least ${cardsNeeded} cards for the initial deal.`,
    );
  }

  let doorDeck = shuffle(state.doorDeck, random);
  let treasureDeck = shuffle(state.treasureDeck, random);
  const dealEvents: GameEvent[] = [];
  const players = state.players.map<PlayerState>((player) => {
    const doorCards = doorDeck.slice(0, STARTING_HAND_SIZE_PER_DECK);
    const treasureCards = treasureDeck.slice(0, STARTING_HAND_SIZE_PER_DECK);
    doorDeck = doorDeck.slice(STARTING_HAND_SIZE_PER_DECK);
    treasureDeck = treasureDeck.slice(STARTING_HAND_SIZE_PER_DECK);
    dealEvents.push({
      type: "CARDS_DEALT",
      visibility: "PRIVATE",
      recipientPlayerId: player.id,
      playerId: player.id,
      doorCardIds: doorCards.map((card) => card.instanceId),
      treasureCardIds: treasureCards.map((card) => card.instanceId),
    });

    return { ...player, hand: [...doorCards, ...treasureCards] };
  });
  const activePlayer = players[random.nextInt(players.length)];

  if (activePlayer === undefined) {
    throw new RangeError("Starting player selection returned no player.");
  }

  return succeed(
    {
      ...state,
      status: GameStatus.IN_PROGRESS,
      phase: GamePhase.TURN_START,
      players,
      activePlayerId: activePlayer.id,
      doorDeck,
      treasureDeck,
      turnNumber: 1,
    },
    [
      {
        type: "GAME_STARTED",
        visibility: "PUBLIC",
        activePlayerId: activePlayer.id,
      },
      ...dealEvents,
      {
        type: "TURN_STARTED",
        visibility: "PUBLIC",
        playerId: activePlayer.id,
        turnNumber: 1,
      },
    ],
  );
}

function kickDoor(
  state: GameState,
  actorId: PlayerId,
  random: RandomSource,
): CommandResult {
  if (state.phase !== GamePhase.TURN_START) {
    return fail(
      state,
      "INVALID_PHASE",
      `KICK_DOOR requires ${GamePhase.TURN_START}; current phase is ${state.phase}.`,
    );
  }

  const card = state.doorDeck[0];
  if (card === undefined) {
    return fail(state, "DECK_EMPTY", "The Door deck is empty.");
  }

  const definition = findDefinition(state, card);
  const doorEvent: GameEvent = {
    type: "DOOR_KICKED",
    visibility: "PUBLIC",
    playerId: actorId,
    cardId: card.instanceId,
    definitionId: card.definitionId,
  };
  let nextState: GameState = {
    ...state,
    phase: GamePhase.DOOR_RESOLUTION,
    doorDeck: state.doorDeck.slice(1),
  };

  if (definition.type === CardType.MONSTER) {
    nextState = {
      ...nextState,
      combat: { playerId: actorId, monster: card },
    };

    return succeed(nextState, [
      doorEvent,
      {
        type: "COMBAT_STARTED",
        visibility: "PUBLIC",
        playerId: actorId,
        monsterCardId: card.instanceId,
        monsterDefinitionId: card.definitionId,
      },
    ]);
  }

  if (definition.type === CardType.CURSE) {
    const effectResult = applyEffects(
      nextState,
      actorId,
      definition.effects,
      random,
    );
    nextState = addToDiscard(effectResult.state, [card]);
    nextState = { ...nextState, phase: GamePhase.POST_DOOR };

    return succeed(nextState, [
      doorEvent,
      ...effectResult.events,
      {
        type: "CURSE_RESOLVED",
        visibility: "PUBLIC",
        playerId: actorId,
        cardId: card.instanceId,
        definitionId: card.definitionId,
      },
    ]);
  }

  nextState = updatePlayer(nextState, actorId, (player) => ({
    ...player,
    hand: [...player.hand, card],
  }));
  nextState = { ...nextState, phase: GamePhase.POST_DOOR };

  return succeed(nextState, [
    doorEvent,
    {
      type: "CARD_ADDED_TO_HAND",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId: card.instanceId,
      definitionId: card.definitionId,
    },
  ]);
}

function lootRoom(state: GameState, actorId: PlayerId): CommandResult {
  if (state.phase !== GamePhase.POST_DOOR || state.combat !== null) {
    return fail(
      state,
      "INVALID_PHASE",
      "LOOT_ROOM is only available after resolving a Door without combat.",
    );
  }

  const card = state.doorDeck[0];
  if (card === undefined) {
    return fail(state, "DECK_EMPTY", "The Door deck is empty.");
  }

  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    hand: [...player.hand, card],
  }));
  nextState = {
    ...nextState,
    phase: GamePhase.END_TURN,
    doorDeck: state.doorDeck.slice(1),
  };

  return succeed(nextState, [
    { type: "ROOM_LOOTED", visibility: "PUBLIC", playerId: actorId },
    {
      type: "CARD_DRAWN",
      visibility: "PRIVATE",
      recipientPlayerId: actorId,
      playerId: actorId,
      cardId: card.instanceId,
      definitionId: card.definitionId,
      deck: DeckType.DOOR,
    },
  ]);
}

function endTurn(state: GameState, actorId: PlayerId): CommandResult {
  if (
    state.phase !== GamePhase.POST_DOOR &&
    state.phase !== GamePhase.END_TURN
  ) {
    return fail(
      state,
      "INVALID_PHASE",
      "END_TURN is only available after Door resolution or room looting.",
    );
  }

  const currentIndex = state.players.findIndex(
    (player) => player.id === actorId,
  );
  const nextPlayer = state.players[(currentIndex + 1) % state.players.length];

  if (nextPlayer === undefined) {
    throw new RangeError("Turn order contains no next player.");
  }

  const nextTurnNumber = state.turnNumber + 1;
  const nextState: GameState = {
    ...state,
    phase: GamePhase.TURN_START,
    activePlayerId: nextPlayer.id,
    combat: null,
    turnNumber: nextTurnNumber,
    players: state.players.map((player) => ({
      ...player,
      temporaryCombatBonus: 0,
    })),
  };

  return succeed(nextState, [
    {
      type: "TURN_ENDED",
      visibility: "PUBLIC",
      playerId: actorId,
      turnNumber: state.turnNumber,
    },
    {
      type: "TURN_STARTED",
      visibility: "PUBLIC",
      playerId: nextPlayer.id,
      turnNumber: nextTurnNumber,
    },
  ]);
}

function executePlayerCommand(
  state: GameState,
  command: Exclude<GameCommand, { readonly type: "ADD_PLAYER" }>,
  context: CommandContext,
): CommandResult {
  if (!state.players.some((player) => player.id === command.actorId)) {
    return fail(
      state,
      "ACTOR_NOT_FOUND",
      `Player ${command.actorId} is not in this game.`,
    );
  }

  if (command.type === "START_GAME") {
    return startGame(state, context.random);
  }

  if (state.activePlayerId !== command.actorId) {
    return fail(
      state,
      "NOT_ACTIVE_PLAYER",
      `It is not player ${command.actorId}'s turn.`,
    );
  }

  switch (command.type) {
    case "KICK_DOOR":
      return kickDoor(state, command.actorId, context.random);
    case "LOOT_ROOM":
      return lootRoom(state, command.actorId);
    case "END_TURN":
      return endTurn(state, command.actorId);
    case "PLAY_CARD": {
      const actor = state.players.find(
        (player) => player.id === command.actorId,
      );
      if (!actor?.hand.some((card) => card.instanceId === command.cardId)) {
        return fail(
          state,
          "CARD_NOT_IN_HAND",
          `Card ${command.cardId} is not in the actor's hand.`,
        );
      }

      return fail(
        state,
        "COMMAND_NOT_AVAILABLE",
        "Playing cards is reserved for a later milestone.",
      );
    }
  }
}

export function executeCommand(
  state: GameState,
  command: GameCommand,
  context: CommandContext,
): CommandResult {
  if (command.type === "ADD_PLAYER") {
    return addPlayer(state, command);
  }

  return executePlayerCommand(state, command, context);
}
