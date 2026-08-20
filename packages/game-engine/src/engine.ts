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
  calculateCombatSidePower,
  calculateMonsterPower,
  canChangeEquipment,
  equipmentConflict,
  equipmentRestriction,
} from "./equipment.js";
import {
  GamePhase,
  GameStatus,
  type GameState,
  type PendingEffectCompletion,
  type PlayerState,
} from "./game-state.js";
import type { PlayerId } from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
export const STARTING_HAND_SIZE_PER_DECK = 4;
export const RUN_AWAY_DIE_SIDES = 6;
export const RUN_AWAY_SUCCESS_MINIMUM = 5;
export const HAND_LIMIT = 5;
export const SELL_LEVEL_VALUE = 1000;
export const WINNING_LEVEL = 10;

export interface CommandContext {
  readonly random: RandomSource;
}

export type CommandErrorCode =
  | "ACTOR_NOT_FOUND"
  | "CARD_NOT_IN_HAND"
  | "CARD_NOT_EQUIPPED"
  | "CARD_NOT_EQUIPMENT"
  | "CARD_NOT_PLAYABLE"
  | "COMMAND_NOT_AVAILABLE"
  | "COMBAT_NOT_WON"
  | "DECK_EMPTY"
  | "DUPLICATE_PLAYER_ID"
  | "GAME_ALREADY_STARTED"
  | "INSUFFICIENT_CARDS"
  | "INVALID_PHASE"
  | "INVALID_TARGET"
  | "INVALID_HELPER"
  | "HELP_ALREADY_ACCEPTED"
  | "HELP_NOT_REQUESTED"
  | "INVALID_PLAYER_NAME"
  | "EQUIPMENT_SLOT_OCCUPIED"
  | "NOT_ENOUGH_FREE_HANDS"
  | "CLASS_REQUIRED"
  | "RACE_REQUIRED"
  | "INVALID_RECIPIENT"
  | "INVALID_CARD_SELECTION"
  | "INSUFFICIENT_SALE_VALUE"
  | "HAND_LIMIT_EXCEEDED"
  | "PENDING_DECISION"
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
            {
              type: "CARDS_DISCARDED_SUMMARY",
              visibility: "PUBLIC",
              playerId,
              count: discarded.length,
              zone: effect.zone,
            },
          ],
  };
}

function applyEffects(
  state: GameState,
  playerId: PlayerId,
  effects: readonly CardEffect[],
  random: RandomSource,
  sourceCard: CardInstance,
  completion: PendingEffectCompletion,
): EffectResult {
  let nextState = state;
  const events: GameEvent[] = [];

  for (const [index, effect] of effects.entries()) {
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
      case "LOSE_LEVEL": {
        const previousLevel = nextState.players.find(
          (player) => player.id === playerId,
        )?.level;
        nextState = updatePlayer(nextState, playerId, (player) => ({
          ...player,
          level: Math.max(1, player.level - effect.amount),
        }));
        const newLevel = nextState.players.find(
          (player) => player.id === playerId,
        )?.level;
        if (
          previousLevel !== undefined &&
          newLevel !== undefined &&
          previousLevel !== newLevel
        ) {
          events.push({
            type: "LEVEL_LOST",
            visibility: "PUBLIC",
            playerId,
            amount: previousLevel - newLevel,
            newLevel,
          });
        }
        break;
      }
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
      case "DISCARD_CHOSEN_CARDS": {
        const player = nextState.players.find(
          (candidate) => candidate.id === playerId,
        );
        const available =
          effect.zone === "HAND"
            ? player?.hand.length
            : player?.equipment.length;
        const count = Math.min(effect.count, available ?? 0);
        if (count === 0) break;
        nextState = {
          ...nextState,
          pendingDecision: {
            type: "DISCARD_CARDS",
            playerId,
            zone: effect.zone,
            count,
            sourceCardId: sourceCard.instanceId,
            sourceDefinitionId: sourceCard.definitionId,
            remainingEffects: effects.slice(index + 1),
            completion,
          },
        };
        events.push({
          type: "CARD_DISCARD_REQUIRED",
          visibility: "PUBLIC",
          playerId,
          count,
          zone: effect.zone,
          sourceCardId: sourceCard.instanceId,
          sourceDefinitionId: sourceCard.definitionId,
        });
        return { state: nextState, events };
      }
      case "DISCARD_ROLE": {
        const player = nextState.players.find(
          (candidate) => candidate.id === playerId,
        );
        const card =
          effect.role === "CLASS" ? player?.classCard : player?.raceCard;
        if (card !== null && card !== undefined) {
          nextState = updatePlayer(nextState, playerId, (current) => ({
            ...current,
            ...(effect.role === "CLASS"
              ? { classCard: null }
              : { raceCard: null }),
          }));
          nextState = addToDiscard(nextState, [card]);
        }
        break;
      }
      case "DEATH": {
        const player = nextState.players.find(
          (candidate) => candidate.id === playerId,
        );
        if (player !== undefined) {
          const possessions = [
            ...player.hand,
            ...player.equipment,
            ...(player.classCard === null ? [] : [player.classCard]),
            ...(player.raceCard === null ? [] : [player.raceCard]),
          ];
          nextState = updatePlayer(nextState, playerId, (current) => ({
            ...current,
            hand: [],
            equipment: [],
            classCard: null,
            raceCard: null,
            temporaryCombatBonus: 0,
            isDead: true,
          }));
          nextState = addToDiscard(nextState, possessions);
          events.push({ type: "PLAYER_DIED", visibility: "PUBLIC", playerId });
        }
        break;
      }
    }
  }

  return { state: nextState, events };
}

function completeEffectResolution(
  state: GameState,
  completion: PendingEffectCompletion,
): EffectResult {
  if (completion.type === "CURSE") {
    let nextState = addToDiscard(state, [completion.card]);
    if (completion.phaseAfterResolution !== null) {
      nextState = { ...nextState, phase: GamePhase.POST_DOOR };
    }
    return {
      state: nextState,
      events: [
        {
          type: "CURSE_RESOLVED",
          visibility: "PUBLIC",
          playerId: completion.targetPlayerId,
          cardId: completion.card.instanceId,
          definitionId: completion.card.definitionId,
        },
      ],
    };
  }

  let nextState = updatePlayer(state, completion.playerId, (player) => ({
    ...player,
    temporaryCombatBonus: 0,
  }));
  nextState = addToDiscard(nextState, [completion.monster]);
  nextState = {
    ...nextState,
    phase: GamePhase.END_TURN,
    combat: null,
    lastRunAwayResult: {
      playerId: completion.playerId,
      monsterCardId: completion.monster.instanceId,
      monsterDefinitionId: completion.monster.definitionId,
      roll: completion.roll,
      escaped: false,
      badStuffApplied: completion.badStuffApplied,
    },
  };
  return {
    state: nextState,
    events: completion.badStuffApplied
      ? [
          {
            type: "BAD_STUFF_APPLIED",
            visibility: "PUBLIC",
            playerId: completion.playerId,
            monsterCardId: completion.monster.instanceId,
            monsterDefinitionId: completion.monster.definitionId,
          },
        ]
      : [],
  };
}

function applyEffectsAndComplete(
  state: GameState,
  playerId: PlayerId,
  effects: readonly CardEffect[],
  random: RandomSource,
  sourceCard: CardInstance,
  completion: PendingEffectCompletion,
): EffectResult {
  const applied = applyEffects(
    state,
    playerId,
    effects,
    random,
    sourceCard,
    completion,
  );
  if (applied.state.pendingDecision !== null) return applied;
  const completed = completeEffectResolution(applied.state, completion);
  return {
    state: completed.state,
    events: [...applied.events, ...completed.events],
  };
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
    classCard: null,
    raceCard: null,
    isDead: false,
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
    lastRunAwayResult: null,
  };

  if (definition.type === CardType.MONSTER) {
    nextState = {
      ...nextState,
      combat: {
        playerId: actorId,
        monster: card,
        monsterBonus: 0,
        requestedHelperId: null,
        helperId: null,
        history: [
          {
            type: "COMBAT_STARTED",
            playerId: actorId,
            monsterDefinitionId: card.definitionId,
          },
        ],
      },
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
    const effectResult = applyEffectsAndComplete(
      nextState,
      actorId,
      definition.effects,
      random,
      card,
      {
        type: "CURSE",
        card,
        targetPlayerId: actorId,
        phaseAfterResolution: "POST_DOOR",
      },
    );
    return succeed(effectResult.state, [doorEvent, ...effectResult.events]);
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

  const actor = state.players.find((player) => player.id === actorId);
  if (actor !== undefined && actor.hand.length > HAND_LIMIT) {
    return fail(
      state,
      "HAND_LIMIT_EXCEEDED",
      `The player must give away or discard ${actor.hand.length - HAND_LIMIT} excess card(s).`,
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
  let nextState: GameState = {
    ...state,
    phase: GamePhase.TURN_START,
    activePlayerId: nextPlayer.id,
    combat: null,
    lastRunAwayResult: null,
    turnNumber: nextTurnNumber,
    players: state.players.map((player) => ({
      ...player,
      temporaryCombatBonus: 0,
    })),
  };
  const revivalEvents: GameEvent[] = [];

  if (nextPlayer.isDead) {
    const doorCards = nextState.doorDeck.slice(0, STARTING_HAND_SIZE_PER_DECK);
    const treasureCards = nextState.treasureDeck.slice(
      0,
      STARTING_HAND_SIZE_PER_DECK,
    );
    nextState = updatePlayer(nextState, nextPlayer.id, (player) => ({
      ...player,
      isDead: false,
      hand: [...doorCards, ...treasureCards],
    }));
    nextState = {
      ...nextState,
      doorDeck: nextState.doorDeck.slice(doorCards.length),
      treasureDeck: nextState.treasureDeck.slice(treasureCards.length),
    };
    revivalEvents.push(
      ...[...doorCards, ...treasureCards].map<GameEvent>((card) => ({
        type: "CARD_DRAWN",
        visibility: "PRIVATE",
        recipientPlayerId: nextPlayer.id,
        playerId: nextPlayer.id,
        cardId: card.instanceId,
        definitionId: card.definitionId,
        deck: doorCards.includes(card) ? DeckType.DOOR : DeckType.TREASURE,
      })),
    );
  }

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
    ...revivalEvents,
    ...(nextPlayer.isDead
      ? [
          {
            type: "PLAYER_REVIVED" as const,
            visibility: "PUBLIC" as const,
            playerId: nextPlayer.id,
          },
        ]
      : []),
  ]);
}

function equipItem(
  state: GameState,
  actorId: PlayerId,
  cardId: Extract<GameCommand, { readonly type: "EQUIP_ITEM" }>["cardId"],
): CommandResult {
  if (!canChangeEquipment(state, actorId)) {
    return fail(
      state,
      "INVALID_PHASE",
      "Equipment can only be changed during your turn outside combat.",
    );
  }
  const player = state.players.find((candidate) => candidate.id === actorId);
  const card = player?.hand.find(
    (candidate) => candidate.instanceId === cardId,
  );
  if (player === undefined || card === undefined) {
    return fail(
      state,
      "CARD_NOT_IN_HAND",
      `Card ${cardId} is not in the actor's hand.`,
    );
  }
  const definition = findDefinition(state, card);
  if (
    definition.type !== CardType.EQUIPMENT ||
    definition.equipment === undefined
  ) {
    return fail(
      state,
      "CARD_NOT_EQUIPMENT",
      `Card ${cardId} is not equipment.`,
    );
  }
  const conflict = equipmentConflict(state, player, definition);
  const restriction = equipmentRestriction(player, definition);
  if (restriction !== null) {
    return fail(
      state,
      restriction,
      restriction === "CLASS_REQUIRED"
        ? "The required class is not active."
        : "The required race is not active.",
    );
  }
  if (conflict === "SLOT_OCCUPIED") {
    return fail(
      state,
      "EQUIPMENT_SLOT_OCCUPIED",
      `The ${definition.equipment.slot} slot is occupied.`,
    );
  }
  if (conflict === "NOT_ENOUGH_FREE_HANDS") {
    return fail(
      state,
      "NOT_ENOUGH_FREE_HANDS",
      "The player does not have enough free hands.",
    );
  }

  const nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    hand: current.hand.filter((candidate) => candidate.instanceId !== cardId),
    equipment: [...current.equipment, card],
  }));
  return succeed(nextState, [
    {
      type: "ITEM_EQUIPPED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId,
      definitionId: card.definitionId,
    },
  ]);
}

function playRole(
  state: GameState,
  actorId: PlayerId,
  cardId: Extract<GameCommand, { readonly type: "PLAY_ROLE" }>["cardId"],
): CommandResult {
  if (!canChangeEquipment(state, actorId))
    return fail(
      state,
      "INVALID_PHASE",
      "Roles can only be changed during your turn outside combat.",
    );
  const player = state.players.find((candidate) => candidate.id === actorId);
  const card = player?.hand.find(
    (candidate) => candidate.instanceId === cardId,
  );
  if (player === undefined || card === undefined)
    return fail(
      state,
      "CARD_NOT_IN_HAND",
      `Card ${cardId} is not in the actor's hand.`,
    );
  const definition = findDefinition(state, card);
  if (definition.type !== CardType.CLASS && definition.type !== CardType.RACE)
    return fail(
      state,
      "CARD_NOT_PLAYABLE",
      "Only a Class or Race card can be used as a role.",
    );
  const previous =
    definition.type === CardType.CLASS ? player.classCard : player.raceCard;
  let nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    hand: current.hand.filter((candidate) => candidate.instanceId !== cardId),
    ...(definition.type === CardType.CLASS
      ? { classCard: card }
      : { raceCard: card }),
  }));
  if (previous !== null) nextState = addToDiscard(nextState, [previous]);
  const updated = nextState.players.find(
    (candidate) => candidate.id === actorId,
  )!;
  const invalidEquipment = updated.equipment.filter(
    (item) =>
      equipmentRestriction(updated, findDefinition(nextState, item)) !== null,
  );
  if (invalidEquipment.length > 0) {
    const invalidIds = new Set(invalidEquipment.map((item) => item.instanceId));
    nextState = updatePlayer(nextState, actorId, (current) => ({
      ...current,
      equipment: current.equipment.filter(
        (item) => !invalidIds.has(item.instanceId),
      ),
      hand: [...current.hand, ...invalidEquipment],
    }));
  }
  return succeed(nextState, [
    {
      type: "ROLE_PLAYED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId,
      definitionId: card.definitionId,
      role: definition.type,
    },
  ]);
}

function sellItems(
  state: GameState,
  actorId: PlayerId,
  cardIds: readonly import("./identifiers.js").CardInstanceId[],
): CommandResult {
  if (!canChangeEquipment(state, actorId))
    return fail(
      state,
      "INVALID_PHASE",
      "Items can only be sold during your turn outside combat.",
    );
  if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length)
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "Select one or more distinct items.",
    );
  const player = state.players.find((candidate) => candidate.id === actorId)!;
  const owned = [...player.hand, ...player.equipment];
  const cards = cardIds.map((id) =>
    owned.find((card) => card.instanceId === id),
  );
  if (cards.some((card) => card === undefined))
    return fail(
      state,
      "CARD_NOT_IN_HAND",
      "Every sold card must belong to the actor.",
    );
  const items = cards as CardInstance[];
  if (
    items.some(
      (card) => findDefinition(state, card).type !== CardType.EQUIPMENT,
    )
  )
    return fail(state, "CARD_NOT_EQUIPMENT", "Only equipment can be sold.");
  const value = items.reduce(
    (sum, card) => sum + (findDefinition(state, card).equipment?.value ?? 0),
    0,
  );
  if (value < SELL_LEVEL_VALUE)
    return fail(
      state,
      "INSUFFICIENT_SALE_VALUE",
      `Sold items must be worth at least ${SELL_LEVEL_VALUE}.`,
    );
  const soldIds = new Set(cardIds);
  let nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    level: current.level + Math.floor(value / SELL_LEVEL_VALUE),
    hand: current.hand.filter((card) => !soldIds.has(card.instanceId)),
    equipment: current.equipment.filter(
      (card) => !soldIds.has(card.instanceId),
    ),
  }));
  nextState = addToDiscard(nextState, items);
  return succeed(nextState, [
    {
      type: "ITEMS_SOLD",
      visibility: "PUBLIC",
      playerId: actorId,
      cardIds,
      value,
      levelsGained: Math.floor(value / SELL_LEVEL_VALUE),
    },
  ]);
}

function tradeItem(
  state: GameState,
  actorId: PlayerId,
  cardId: import("./identifiers.js").CardInstanceId,
  recipientId: PlayerId,
): CommandResult {
  if (
    state.status !== GameStatus.IN_PROGRESS ||
    !canChangeEquipment(state, actorId)
  )
    return fail(
      state,
      "INVALID_PHASE",
      "Items can only be traded during your turn outside combat.",
    );
  if (
    actorId === recipientId ||
    !state.players.some((player) => player.id === recipientId)
  )
    return fail(
      state,
      "INVALID_RECIPIENT",
      "Trade recipient must be another player.",
    );
  const actor = state.players.find((player) => player.id === actorId)!;
  const card = [...actor.hand, ...actor.equipment].find(
    (item) => item.instanceId === cardId,
  );
  if (card === undefined)
    return fail(
      state,
      "CARD_NOT_IN_HAND",
      "The traded item is not owned by the actor.",
    );
  if (findDefinition(state, card).type !== CardType.EQUIPMENT)
    return fail(state, "CARD_NOT_EQUIPMENT", "Only equipment can be traded.");
  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    hand: player.hand.filter((item) => item.instanceId !== cardId),
    equipment: player.equipment.filter((item) => item.instanceId !== cardId),
  }));
  nextState = updatePlayer(nextState, recipientId, (player) => ({
    ...player,
    hand: [...player.hand, card],
  }));
  return succeed(nextState, [
    {
      type: "ITEM_TRADED",
      visibility: "PUBLIC",
      playerId: actorId,
      recipientId,
      cardId,
      definitionId: card.definitionId,
    },
  ]);
}

function giveCharity(
  state: GameState,
  actorId: PlayerId,
  cardIds: readonly import("./identifiers.js").CardInstanceId[],
  recipientId: PlayerId | null,
): CommandResult {
  if (
    state.activePlayerId !== actorId ||
    state.combat !== null ||
    (state.phase !== GamePhase.POST_DOOR && state.phase !== GamePhase.END_TURN)
  )
    return fail(
      state,
      "INVALID_PHASE",
      "Charity is only resolved at the end of your turn.",
    );
  const actor = state.players.find((player) => player.id === actorId)!;
  const excess = Math.max(0, actor.hand.length - HAND_LIMIT);
  if (
    cardIds.length !== excess ||
    new Set(cardIds).size !== cardIds.length ||
    cardIds.some((id) => !actor.hand.some((card) => card.instanceId === id))
  )
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      `Charity must contain exactly ${excess} excess card(s).`,
    );
  const minimumLevel = Math.min(...state.players.map((player) => player.level));
  const actorIsPoorest = actor.level === minimumLevel;
  if (
    actorIsPoorest
      ? recipientId !== null
      : recipientId === null ||
        recipientId === actorId ||
        !state.players.some(
          (player) =>
            player.id === recipientId && player.level === minimumLevel,
        )
  )
    return fail(
      state,
      "INVALID_RECIPIENT",
      actorIsPoorest
        ? "A lowest-level player discards charity."
        : "Charity must go to a lowest-level player.",
    );
  const selected = actor.hand.filter((card) =>
    cardIds.includes(card.instanceId),
  );
  const selectedIds = new Set(cardIds);
  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    hand: player.hand.filter((card) => !selectedIds.has(card.instanceId)),
  }));
  if (recipientId === null) nextState = addToDiscard(nextState, selected);
  else
    nextState = updatePlayer(nextState, recipientId, (player) => ({
      ...player,
      hand: [...player.hand, ...selected],
    }));
  return succeed(nextState, [
    {
      type: "CHARITY_RESOLVED",
      visibility: "PUBLIC",
      playerId: actorId,
      recipientId,
      count: selected.length,
    },
  ]);
}

function giveRandomCharity(
  state: GameState,
  actorId: PlayerId,
  random: RandomSource,
): CommandResult {
  const actor = state.players.find((player) => player.id === actorId);
  if (actor === undefined) {
    return fail(state, "ACTOR_NOT_FOUND", "The charity player is missing.");
  }
  const excess = Math.max(0, actor.hand.length - HAND_LIMIT);
  const pool = [...actor.hand];
  const selected: CardInstance[] = [];
  while (selected.length < excess && pool.length > 0) {
    const index = random.nextInt(pool.length);
    const [card] = pool.splice(index, 1);
    if (card !== undefined) selected.push(card);
  }
  const minimumLevel = Math.min(...state.players.map((player) => player.level));
  const recipient =
    actor.level === minimumLevel
      ? null
      : (state.players.find(
          (player) => player.id !== actorId && player.level === minimumLevel,
        )?.id ?? null);
  return giveCharity(
    state,
    actorId,
    selected.map((card) => card.instanceId),
    recipient,
  );
}

function unequipItem(
  state: GameState,
  actorId: PlayerId,
  cardId: Extract<GameCommand, { readonly type: "UNEQUIP_ITEM" }>["cardId"],
): CommandResult {
  if (!canChangeEquipment(state, actorId)) {
    return fail(
      state,
      "INVALID_PHASE",
      "Equipment can only be changed during your turn outside combat.",
    );
  }
  const player = state.players.find((candidate) => candidate.id === actorId);
  const card = player?.equipment.find(
    (candidate) => candidate.instanceId === cardId,
  );
  if (player === undefined || card === undefined) {
    return fail(
      state,
      "CARD_NOT_EQUIPPED",
      `Card ${cardId} is not equipped by the actor.`,
    );
  }
  const nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    hand: [...current.hand, card],
    equipment: current.equipment.filter(
      (candidate) => candidate.instanceId !== cardId,
    ),
  }));
  return succeed(nextState, [
    {
      type: "ITEM_UNEQUIPPED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId,
      definitionId: card.definitionId,
    },
  ]);
}

function playCard(
  state: GameState,
  actorId: PlayerId,
  command: Extract<GameCommand, { readonly type: "PLAY_CARD" }>,
  random: RandomSource,
): CommandResult {
  const actor = state.players.find((player) => player.id === actorId);
  const card = actor?.hand.find(
    (candidate) => candidate.instanceId === command.cardId,
  );
  if (actor === undefined || card === undefined) {
    return fail(
      state,
      "CARD_NOT_IN_HAND",
      `Card ${command.cardId} is not in the actor's hand.`,
    );
  }
  const definition = findDefinition(state, card);
  if (definition.type === CardType.CURSE) {
    if (
      state.status !== GameStatus.IN_PROGRESS ||
      command.target?.type !== "PLAYER"
    )
      return fail(
        state,
        "INVALID_TARGET",
        "A Curse must target a player in the active game.",
      );
    const targetId = command.target.playerId;
    if (!state.players.some((player) => player.id === targetId))
      return fail(
        state,
        "INVALID_TARGET",
        "The Curse target is not in this game.",
      );
    const nextState = updatePlayer(state, actorId, (player) => ({
      ...player,
      hand: player.hand.filter(
        (candidate) => candidate.instanceId !== card.instanceId,
      ),
    }));
    const applied = applyEffectsAndComplete(
      nextState,
      targetId,
      definition.effects,
      random,
      card,
      {
        type: "CURSE",
        card,
        targetPlayerId: targetId,
        phaseAfterResolution: null,
      },
    );
    return succeed(applied.state, [
      {
        type: "CARD_PLAYED",
        visibility: "PUBLIC",
        playerId: actorId,
        cardId: card.instanceId,
        target: command.target,
      },
      ...applied.events,
    ]);
  }
  if (state.combat === null || state.phase !== GamePhase.DOOR_RESOLUTION) {
    return fail(
      state,
      "INVALID_PHASE",
      "Combat cards can only be played during an active combat.",
    );
  }
  if (command.target?.type !== "COMBAT") {
    return fail(state, "INVALID_TARGET", "The card must target the combat.");
  }
  const isTemporaryBonus =
    definition.type === CardType.TEMPORARY_BONUS &&
    definition.effects.length > 0 &&
    definition.effects.every((effect) => effect.type === "COMBAT_BONUS");
  const isPlayerBonus = isTemporaryBonus && command.target.side === "PLAYERS";
  const isMonsterTemporaryBonus =
    isTemporaryBonus && command.target.side === "MONSTER";
  const isMonsterModifier =
    definition.type === CardType.MONSTER_MODIFIER &&
    command.target.side === "MONSTER" &&
    definition.effects.length > 0 &&
    definition.effects.every(
      (effect) => effect.type === "MONSTER_COMBAT_BONUS",
    );
  if (!isPlayerBonus && !isMonsterTemporaryBonus && !isMonsterModifier) {
    return fail(
      state,
      "CARD_NOT_PLAYABLE",
      "The card cannot be played on the selected combat side.",
    );
  }

  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    hand: player.hand.filter(
      (candidate) => candidate.instanceId !== command.cardId,
    ),
  }));
  if (isPlayerBonus) {
    const bonus = definition.effects.reduce(
      (total, effect) =>
        effect.type === "COMBAT_BONUS" ? total + effect.amount : total,
      0,
    );
    nextState = updatePlayer(nextState, state.combat.playerId, (player) => ({
      ...player,
      temporaryCombatBonus: player.temporaryCombatBonus + bonus,
    }));
  } else {
    const bonus = definition.effects.reduce(
      (total, effect) =>
        effect.type === "COMBAT_BONUS" || effect.type === "MONSTER_COMBAT_BONUS"
          ? total + effect.amount
          : total,
      0,
    );
    nextState = {
      ...nextState,
      combat: {
        ...state.combat,
        monsterBonus: state.combat.monsterBonus + bonus,
      },
    };
  }
  if (nextState.combat === null) {
    throw new TypeError("Combat disappeared while playing a combat card.");
  }
  nextState = {
    ...nextState,
    combat: {
      ...nextState.combat,
      history: [
        ...nextState.combat.history,
        {
          type: "CARD_PLAYED",
          playerId: actorId,
          cardId: card.instanceId,
          definitionId: card.definitionId,
          side: command.target.side,
        },
      ],
    },
  };
  nextState = addToDiscard(nextState, [card]);

  return succeed(nextState, [
    {
      type: "CARD_PLAYED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId: card.instanceId,
      target: command.target,
    },
    {
      type: "COMBAT_UPDATED",
      visibility: "PUBLIC",
      playerId: state.combat.playerId,
      playerPower: calculateCombatSidePower(nextState),
      monsterPower: calculateMonsterPower(nextState),
    },
  ]);
}

function requestHelp(
  state: GameState,
  actorId: PlayerId,
  helperId: PlayerId,
): CommandResult {
  if (
    state.combat === null ||
    state.phase !== GamePhase.DOOR_RESOLUTION ||
    state.combat.playerId !== actorId
  ) {
    return fail(
      state,
      "INVALID_PHASE",
      "Help can only be requested by the combat player.",
    );
  }
  if (state.combat.helperId !== null) {
    return fail(
      state,
      "HELP_ALREADY_ACCEPTED",
      "A helper has already joined this combat.",
    );
  }
  if (
    helperId === actorId ||
    !state.players.some((player) => player.id === helperId)
  ) {
    return fail(
      state,
      "INVALID_HELPER",
      "The requested helper is not eligible.",
    );
  }
  const combat = {
    ...state.combat,
    requestedHelperId: helperId,
    history: [
      ...state.combat.history,
      { type: "HELP_REQUESTED" as const, playerId: actorId, helperId },
    ],
  };
  return succeed({ ...state, combat }, [
    {
      type: "HELP_REQUESTED",
      visibility: "PUBLIC",
      playerId: actorId,
      helperId,
    },
  ]);
}

function acceptHelp(state: GameState, actorId: PlayerId): CommandResult {
  if (
    state.combat === null ||
    state.phase !== GamePhase.DOOR_RESOLUTION ||
    state.combat.requestedHelperId !== actorId
  ) {
    return fail(
      state,
      "HELP_NOT_REQUESTED",
      "This player has no active help request.",
    );
  }
  if (state.combat.helperId !== null) {
    return fail(
      state,
      "HELP_ALREADY_ACCEPTED",
      "A helper has already joined this combat.",
    );
  }
  const combat = {
    ...state.combat,
    requestedHelperId: null,
    helperId: actorId,
    history: [
      ...state.combat.history,
      {
        type: "HELP_ACCEPTED" as const,
        playerId: state.combat.playerId,
        helperId: actorId,
      },
    ],
  };
  const nextState = { ...state, combat };
  return succeed(nextState, [
    {
      type: "HELP_ACCEPTED",
      visibility: "PUBLIC",
      playerId: state.combat.playerId,
      helperId: actorId,
    },
    {
      type: "COMBAT_UPDATED",
      visibility: "PUBLIC",
      playerId: state.combat.playerId,
      playerPower: calculateCombatSidePower(nextState),
      monsterPower: calculateMonsterPower(nextState),
    },
  ]);
}

function resolveCombat(state: GameState, actorId: PlayerId): CommandResult {
  if (
    state.combat === null ||
    state.phase !== GamePhase.DOOR_RESOLUTION ||
    state.combat.playerId !== actorId
  ) {
    return fail(
      state,
      "INVALID_PHASE",
      "RESOLVE_COMBAT requires the actor's active combat.",
    );
  }
  const monster = state.combat.monster;
  const definition = findDefinition(state, monster);
  if (definition.monster === undefined) {
    throw new TypeError(
      `Combat card ${monster.instanceId} has no monster data.`,
    );
  }
  const monsterStats = definition.monster;
  const playerPower = calculateCombatSidePower(state);
  const monsterPower = calculateMonsterPower(state);
  if (playerPower <= monsterPower) {
    return fail(
      state,
      "COMBAT_NOT_WON",
      `Player power ${playerPower} must exceed monster power ${monsterPower}.`,
    );
  }
  if (state.treasureDeck.length < monsterStats.treasureRewards) {
    return fail(
      state,
      "INSUFFICIENT_CARDS",
      "The Treasure deck cannot provide the full combat reward.",
    );
  }

  const reward = drawEffectCards(
    state,
    actorId,
    DeckType.TREASURE,
    monsterStats.treasureRewards,
  );
  let nextState = updatePlayer(reward.state, actorId, (player) => ({
    ...player,
    level: player.level + monsterStats.levelRewards,
    temporaryCombatBonus: 0,
  }));
  nextState = addToDiscard(nextState, [monster]);
  nextState = { ...nextState, phase: GamePhase.END_TURN, combat: null };
  const winner = nextState.players.find((player) => player.id === actorId);
  if (winner === undefined) {
    throw new TypeError(`Combat player ${actorId} is missing.`);
  }

  return succeed(nextState, [
    {
      type: "COMBAT_WON",
      visibility: "PUBLIC",
      playerId: actorId,
      monsterCardId: monster.instanceId,
      monsterDefinitionId: monster.definitionId,
    },
    {
      type: "LEVEL_GAINED",
      visibility: "PUBLIC",
      playerId: actorId,
      amount: monsterStats.levelRewards,
      newLevel: winner.level,
    },
    {
      type: "TREASURE_GAINED",
      visibility: "PUBLIC",
      playerId: actorId,
      count: monsterStats.treasureRewards,
    },
    ...reward.events,
  ]);
}

function runAway(
  state: GameState,
  actorId: PlayerId,
  random: RandomSource,
): CommandResult {
  if (
    state.combat === null ||
    state.phase !== GamePhase.DOOR_RESOLUTION ||
    state.combat.playerId !== actorId
  ) {
    return fail(
      state,
      "INVALID_PHASE",
      "RUN_AWAY requires the actor's active combat.",
    );
  }
  if (calculateCombatSidePower(state) > calculateMonsterPower(state)) {
    return fail(
      state,
      "COMMAND_NOT_AVAILABLE",
      "A winning combat must be resolved instead of abandoned.",
    );
  }

  const combat = state.combat;
  const definition = findDefinition(state, combat.monster);
  if (definition.monster === undefined) {
    throw new TypeError(
      `Combat card ${combat.monster.instanceId} has no monster data.`,
    );
  }

  const roll = random.nextInt(RUN_AWAY_DIE_SIDES) + 1;
  const escaped = roll >= RUN_AWAY_SUCCESS_MINIMUM;
  const attempted: GameEvent = {
    type: "RUN_AWAY_ATTEMPTED",
    visibility: "PUBLIC",
    playerId: actorId,
    monsterCardId: combat.monster.instanceId,
    monsterDefinitionId: combat.monster.definitionId,
    roll,
    escaped,
  };

  if (!escaped) {
    const result = applyEffectsAndComplete(
      state,
      actorId,
      definition.monster.badStuff,
      random,
      combat.monster,
      {
        type: "RUN_AWAY",
        playerId: actorId,
        monster: combat.monster,
        roll,
        badStuffApplied: definition.monster.badStuff.length > 0,
      },
    );
    return succeed(result.state, [attempted, ...result.events]);
  }

  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    temporaryCombatBonus: 0,
  }));
  nextState = addToDiscard(nextState, [combat.monster]);
  nextState = {
    ...nextState,
    phase: GamePhase.END_TURN,
    combat: null,
    lastRunAwayResult: {
      playerId: actorId,
      monsterCardId: combat.monster.instanceId,
      monsterDefinitionId: combat.monster.definitionId,
      roll,
      escaped: true,
      badStuffApplied: false,
    },
  };
  return succeed(nextState, [attempted]);
}

function resolveCardDiscard(
  state: GameState,
  actorId: PlayerId,
  cardIds: readonly import("./identifiers.js").CardInstanceId[],
  random: RandomSource,
): CommandResult {
  const decision = state.pendingDecision;
  if (decision === null || decision.playerId !== actorId) {
    return fail(
      state,
      "PENDING_DECISION",
      "There is no card-discard decision for this player.",
    );
  }
  const player = state.players.find((candidate) => candidate.id === actorId)!;
  const source = decision.zone === "HAND" ? player.hand : player.equipment;
  if (
    cardIds.length !== decision.count ||
    new Set(cardIds).size !== cardIds.length ||
    cardIds.some((id) => !source.some((card) => card.instanceId === id))
  ) {
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      `Select exactly ${decision.count} available card(s).`,
    );
  }
  const selected = source.filter((card) => cardIds.includes(card.instanceId));
  const selectedIds = new Set(cardIds);
  let nextState = updatePlayer(state, actorId, (current) =>
    decision.zone === "HAND"
      ? {
          ...current,
          hand: current.hand.filter(
            (card) => !selectedIds.has(card.instanceId),
          ),
        }
      : {
          ...current,
          equipment: current.equipment.filter(
            (card) => !selectedIds.has(card.instanceId),
          ),
        },
  );
  nextState = addToDiscard(nextState, selected);
  nextState = { ...nextState, pendingDecision: null };
  const events: GameEvent[] = [
    {
      type: "CARDS_DISCARDED",
      visibility: "PRIVATE",
      recipientPlayerId: actorId,
      playerId: actorId,
      cardIds,
    },
    {
      type: "CARDS_DISCARDED_SUMMARY",
      visibility: "PUBLIC",
      playerId: actorId,
      count: cardIds.length,
      zone: decision.zone,
    },
  ];
  const remaining = applyEffectsAndComplete(
    nextState,
    actorId,
    decision.remainingEffects,
    random,
    {
      instanceId: decision.sourceCardId,
      definitionId: decision.sourceDefinitionId,
    },
    decision.completion,
  );
  return succeed(remaining.state, [...events, ...remaining.events]);
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

  if (state.status === GameStatus.FINISHED) {
    return fail(
      state,
      "COMMAND_NOT_AVAILABLE",
      "No gameplay commands are available after the game has finished.",
    );
  }

  if (command.type === "RESOLVE_CARD_DISCARD") {
    return resolveCardDiscard(
      state,
      command.actorId,
      command.cardIds,
      context.random,
    );
  }

  if (state.pendingDecision !== null) {
    return fail(
      state,
      "PENDING_DECISION",
      "The pending card decision must be resolved first.",
    );
  }

  if (command.type === "PLAY_CARD") {
    return playCard(state, command.actorId, command, context.random);
  }

  if (command.type === "TRADE_ITEM") {
    return tradeItem(
      state,
      command.actorId,
      command.cardId,
      command.recipientId,
    );
  }

  if (command.type === "ACCEPT_HELP") {
    return acceptHelp(state, command.actorId);
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
    case "EQUIP_ITEM":
      return equipItem(state, command.actorId, command.cardId);
    case "UNEQUIP_ITEM":
      return unequipItem(state, command.actorId, command.cardId);
    case "PLAY_ROLE":
      return playRole(state, command.actorId, command.cardId);
    case "SELL_ITEMS":
      return sellItems(state, command.actorId, command.cardIds);
    case "GIVE_CHARITY":
      return giveCharity(
        state,
        command.actorId,
        command.cardIds,
        command.recipientId,
      );
    case "GIVE_RANDOM_CHARITY":
      return giveRandomCharity(state, command.actorId, context.random);
    case "REQUEST_HELP":
      return requestHelp(state, command.actorId, command.helperId);
    case "RESOLVE_COMBAT":
      return resolveCombat(state, command.actorId);
    case "RUN_AWAY":
      return runAway(state, command.actorId, context.random);
  }
}

export function executeCommand(
  state: GameState,
  command: GameCommand,
  context: CommandContext,
): CommandResult {
  let result: CommandResult;
  if (command.type === "ADD_PLAYER") {
    result = addPlayer(state, command);
  } else {
    result = executePlayerCommand(state, command, context);
  }

  if (result.success && result.state.status === GameStatus.IN_PROGRESS) {
    const winner = result.state.players.find((player) => {
      const previousLevel =
        state.players.find((previous) => previous.id === player.id)?.level ?? 0;
      return previousLevel < WINNING_LEVEL && player.level >= WINNING_LEVEL;
    });
    if (winner !== undefined) {
      result = succeed(
        {
          ...result.state,
          status: GameStatus.FINISHED,
          phase: GamePhase.FINISHED,
          activePlayerId: winner.id,
          combat: null,
          lastRunAwayResult: null,
          pendingDecision: null,
          winnerId: winner.id,
        },
        [
          ...result.events,
          {
            type: "GAME_FINISHED",
            visibility: "PUBLIC",
            winnerId: winner.id,
            winningLevel: WINNING_LEVEL,
          },
        ],
      );
    }
  }

  if (!result.success || result.events.length === 0) return result;

  let turnNumber =
    state.status === GameStatus.LOBBY &&
    result.state.status !== GameStatus.LOBBY
      ? result.state.turnNumber
      : state.turnNumber;
  const firstSequence = state.eventLog.length + 1;
  const entries = result.events.map((event, index) => {
    if (event.type === "TURN_STARTED") turnNumber = event.turnNumber;
    const phase =
      event.type === "TURN_STARTED" ? GamePhase.TURN_START : result.state.phase;
    return { sequence: firstSequence + index, turnNumber, phase, event };
  });

  return {
    ...result,
    state: {
      ...result.state,
      eventLog: [...state.eventLog, ...entries],
    },
  };
}
