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
  calculateMonsterTreasures,
  canChangeEquipment,
  equipmentConflict,
  equipmentRestriction,
} from "./equipment.js";
import {
  GamePhase,
  GameStatus,
  type GameState,
  type CombatMonsterState,
  type PendingEffectCompletion,
  type PlayerState,
} from "./game-state.js";
import {
  parseEncounterId,
  type CardInstanceId,
  type EncounterId,
  type PlayerId,
} from "./identifiers.js";
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
  | "REACTION_WINDOW_ACTIVE"
  | "REACTION_ALREADY_CONFIRMED"
  | "STALE_COMBAT_STATE"
  | "STALE_COMBAT_REACTION"
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

function revalidatePlayerEquipment(
  state: GameState,
  playerId: PlayerId,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) return { state, events: [] };
  const incompatible = player.equipment.filter(
    (card) =>
      equipmentRestriction(player, findDefinition(state, card)) !== null,
  );
  if (incompatible.length === 0) return { state, events: [] };

  const incompatibleIds = new Set(incompatible.map((card) => card.instanceId));
  return {
    state: updatePlayer(state, playerId, (current) => ({
      ...current,
      equipment: current.equipment.filter(
        (card) => !incompatibleIds.has(card.instanceId),
      ),
      hand: [...current.hand, ...incompatible],
    })),
    events: incompatible.map((card) => ({
      type: "ITEM_UNEQUIPPED" as const,
      visibility: "PUBLIC" as const,
      playerId,
      cardId: card.instanceId,
      definitionId: card.definitionId,
    })),
  };
}

function createCombatMonster(
  state: GameState,
  monster: CardInstance,
  encounterId: EncounterId,
  sourceCard: CardInstance = monster,
): CombatMonsterState {
  const definition = findDefinition(state, monster);
  if (
    definition.type !== CardType.MONSTER ||
    definition.monster === undefined
  ) {
    throw new TypeError(`Card ${monster.instanceId} is not a Monster.`);
  }
  return {
    encounterId,
    monster,
    sourceCard,
    clonedFromEncounterId: null,
    baseStrength: definition.monster.level,
    baseLevelRewards: definition.monster.levelRewards,
    baseTreasureRewards: definition.monster.treasureRewards,
    badStuff: definition.monster.badStuff,
    strengthModifier: 0,
    treasureModifier: 0,
    playedCards: [],
  };
}

function nextEncounterId(sequence: number): EncounterId {
  return parseEncounterId(`encounter-${sequence}`);
}

function combatPhysicalCards(state: GameState): readonly CardInstance[] {
  if (state.combat === null) return [];
  const unique = new Map<CardInstanceId, CardInstance>();
  for (const monster of state.combat.monsters) {
    unique.set(monster.sourceCard.instanceId, monster.sourceCard);
    for (const played of monster.playedCards) {
      unique.set(played.card.instanceId, played.card);
    }
  }
  return [...unique.values()];
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

class InsufficientCardsError extends Error {
  constructor(
    readonly deck: DeckType,
    readonly count: number,
  ) {
    super(`The ${deck} deck and discard cannot provide ${count} card(s).`);
  }
}

interface DeckDrawResult {
  readonly state: GameState;
  readonly cards: readonly CardInstance[];
  readonly events: readonly GameEvent[];
}

function drawCards(
  state: GameState,
  deck: DeckType,
  count: number,
  random: RandomSource,
): DeckDrawResult {
  const sourceDeck =
    deck === DeckType.DOOR ? state.doorDeck : state.treasureDeck;
  const sourceDiscard =
    deck === DeckType.DOOR ? state.doorDiscard : state.treasureDiscard;

  if (sourceDeck.length + sourceDiscard.length < count) {
    throw new InsufficientCardsError(deck, count);
  }

  const fromDeck = sourceDeck.slice(0, count);
  const remainingCount = count - fromDeck.length;
  const recycled = remainingCount > 0 ? shuffle(sourceDiscard, random) : [];
  const cards = [...fromDeck, ...recycled.slice(0, remainingCount)];
  const remainingDeck =
    remainingCount > 0
      ? recycled.slice(remainingCount)
      : sourceDeck.slice(fromDeck.length);
  const events: GameEvent[] =
    remainingCount > 0
      ? [
          {
            type: "DECK_RESHUFFLED",
            visibility: "PUBLIC",
            deck,
          },
        ]
      : [];

  return {
    state:
      deck === DeckType.DOOR
        ? {
            ...state,
            doorDeck: remainingDeck,
            doorDiscard: remainingCount > 0 ? [] : sourceDiscard,
          }
        : {
            ...state,
            treasureDeck: remainingDeck,
            treasureDiscard: remainingCount > 0 ? [] : sourceDiscard,
          },
    cards,
    events,
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
  random: RandomSource,
): EffectResult {
  const draw = drawCards(state, deck, count, random);
  const nextState = updatePlayer(draw.state, playerId, (player) => ({
    ...player,
    hand: [...player.hand, ...draw.cards],
  }));

  return {
    state: nextState,
    events: [
      ...draw.events,
      ...draw.cards.map<GameEvent>((card) => ({
        type: "CARD_DRAWN",
        visibility: "PRIVATE",
        recipientPlayerId: playerId,
        playerId,
        cardId: card.instanceId,
        definitionId: card.definitionId,
        deck,
      })),
    ],
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
          random,
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
          const revalidated = revalidatePlayerEquipment(nextState, playerId);
          nextState = revalidated.state;
          events.push(...revalidated.events);
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

  const monster = state.combat?.monsters.find(
    (candidate) => candidate.encounterId === completion.encounterId,
  );
  if (monster === undefined) {
    throw new TypeError(
      `Run-away encounter ${completion.encounterId} is missing.`,
    );
  }
  return {
    state,
    events:
      monster.badStuff.length > 0
        ? [
            {
              type: "BAD_STUFF_APPLIED",
              visibility: "PUBLIC",
              playerId: completion.playerId,
              encounterId: monster.encounterId,
              monsterCardId: monster.monster.instanceId,
              monsterDefinitionId: monster.monster.definitionId,
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

  if (state.doorDeck.length + state.doorDiscard.length === 0) {
    return fail(state, "DECK_EMPTY", "The Door deck is empty.");
  }

  const draw = drawCards(state, DeckType.DOOR, 1, random);
  const card = draw.cards[0];
  if (card === undefined) {
    throw new RangeError("Drawing one Door card returned no card.");
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
    ...draw.state,
    phase: GamePhase.DOOR_RESOLUTION,
    lastRunAwayResult: null,
  };

  if (definition.type === CardType.MONSTER) {
    const encounterId = nextEncounterId(1);
    nextState = {
      ...nextState,
      combat: {
        playerId: actorId,
        revision: 1,
        monsters: [createCombatMonster(nextState, card, encounterId)],
        nextEncounterSequence: 2,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        requestedHelperId: null,
        helperId: null,
        runAway: null,
        history: [
          {
            type: "COMBAT_STARTED",
            playerId: actorId,
            encounterId,
            monsterDefinitionId: card.definitionId,
          },
        ],
      },
    };

    return succeed(nextState, [
      ...draw.events,
      doorEvent,
      {
        type: "COMBAT_STARTED",
        visibility: "PUBLIC",
        playerId: actorId,
        encounterId,
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
    return succeed(effectResult.state, [
      ...draw.events,
      doorEvent,
      ...effectResult.events,
    ]);
  }

  nextState = updatePlayer(nextState, actorId, (player) => ({
    ...player,
    hand: [...player.hand, card],
  }));
  nextState = { ...nextState, phase: GamePhase.POST_DOOR };

  return succeed(nextState, [
    ...draw.events,
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

function lootRoom(
  state: GameState,
  actorId: PlayerId,
  random: RandomSource,
): CommandResult {
  if (state.phase !== GamePhase.POST_DOOR || state.combat !== null) {
    return fail(
      state,
      "INVALID_PHASE",
      "LOOT_ROOM is only available after resolving a Door without combat.",
    );
  }

  if (state.doorDeck.length + state.doorDiscard.length === 0) {
    return fail(state, "DECK_EMPTY", "The Door deck is empty.");
  }

  const draw = drawCards(state, DeckType.DOOR, 1, random);
  const card = draw.cards[0];
  if (card === undefined) {
    throw new RangeError("Drawing one Door card returned no card.");
  }

  let nextState = updatePlayer(draw.state, actorId, (player) => ({
    ...player,
    hand: [...player.hand, card],
  }));
  nextState = {
    ...nextState,
    phase: GamePhase.END_TURN,
  };

  return succeed(nextState, [
    ...draw.events,
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

export function canLookForTrouble(
  state: GameState,
  playerId: PlayerId,
  cardId: import("./identifiers.js").CardInstanceId,
): boolean {
  if (
    state.status !== GameStatus.IN_PROGRESS ||
    state.phase !== GamePhase.POST_DOOR ||
    state.activePlayerId !== playerId ||
    state.combat !== null ||
    state.pendingDecision !== null
  ) {
    return false;
  }
  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.hand.find(
    (candidate) => candidate.instanceId === cardId,
  );
  return (
    card !== undefined && findDefinition(state, card).type === CardType.MONSTER
  );
}

function lookForTrouble(
  state: GameState,
  actorId: PlayerId,
  cardId: Extract<GameCommand, { readonly type: "LOOK_FOR_TROUBLE" }>["cardId"],
): CommandResult {
  if (state.phase !== GamePhase.POST_DOOR || state.combat !== null) {
    return fail(
      state,
      "INVALID_PHASE",
      "LOOK_FOR_TROUBLE is only available after resolving a Door without combat.",
    );
  }
  const actor = state.players.find((player) => player.id === actorId);
  const monster = actor?.hand.find((card) => card.instanceId === cardId);
  if (actor === undefined || monster === undefined) {
    return fail(
      state,
      "CARD_NOT_IN_HAND",
      `Card ${cardId} is not in the actor's hand.`,
    );
  }
  const definition = findDefinition(state, monster);
  if (
    definition.type !== CardType.MONSTER ||
    definition.monster === undefined
  ) {
    return fail(
      state,
      "CARD_NOT_PLAYABLE",
      "LOOK_FOR_TROUBLE requires a Monster card from the actor's hand.",
    );
  }

  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    hand: player.hand.filter((card) => card.instanceId !== cardId),
  }));
  const encounterId = nextEncounterId(1);
  nextState = {
    ...nextState,
    phase: GamePhase.DOOR_RESOLUTION,
    combat: {
      playerId: actorId,
      revision: 1,
      monsters: [createCombatMonster(nextState, monster, encounterId)],
      nextEncounterSequence: 2,
      nextReactionWindowSequence: 1,
      reactionWindow: null,
      requestedHelperId: null,
      helperId: null,
      runAway: null,
      history: [
        {
          type: "COMBAT_STARTED",
          playerId: actorId,
          encounterId,
          monsterDefinitionId: monster.definitionId,
        },
      ],
    },
  };

  return succeed(nextState, [
    {
      type: "LOOKED_FOR_TROUBLE",
      visibility: "PUBLIC",
      playerId: actorId,
      monsterCardId: monster.instanceId,
      monsterDefinitionId: monster.definitionId,
    },
    {
      type: "COMBAT_STARTED",
      visibility: "PUBLIC",
      playerId: actorId,
      encounterId,
      monsterCardId: monster.instanceId,
      monsterDefinitionId: monster.definitionId,
    },
  ]);
}

function endTurn(
  state: GameState,
  actorId: PlayerId,
  random: RandomSource,
): CommandResult {
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

  if (
    nextPlayer.isDead &&
    (state.doorDeck.length + state.doorDiscard.length <
      STARTING_HAND_SIZE_PER_DECK ||
      state.treasureDeck.length + state.treasureDiscard.length <
        STARTING_HAND_SIZE_PER_DECK)
  ) {
    return fail(
      state,
      "INSUFFICIENT_CARDS",
      "Both decks must provide four cards for the next player's revival.",
    );
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
    const doorDraw = drawCards(
      nextState,
      DeckType.DOOR,
      STARTING_HAND_SIZE_PER_DECK,
      random,
    );
    const treasureDraw = drawCards(
      doorDraw.state,
      DeckType.TREASURE,
      STARTING_HAND_SIZE_PER_DECK,
      random,
    );
    nextState = updatePlayer(treasureDraw.state, nextPlayer.id, (player) => ({
      ...player,
      isDead: false,
      hand: [...doorDraw.cards, ...treasureDraw.cards],
    }));
    revivalEvents.push(
      ...doorDraw.events,
      ...doorDraw.cards.map<GameEvent>((card) => ({
        type: "CARD_DRAWN",
        visibility: "PRIVATE",
        recipientPlayerId: nextPlayer.id,
        playerId: nextPlayer.id,
        cardId: card.instanceId,
        definitionId: card.definitionId,
        deck: DeckType.DOOR,
      })),
      ...treasureDraw.events,
      ...treasureDraw.cards.map<GameEvent>((card) => ({
        type: "CARD_DRAWN",
        visibility: "PRIVATE",
        recipientPlayerId: nextPlayer.id,
        playerId: nextPlayer.id,
        cardId: card.instanceId,
        definitionId: card.definitionId,
        deck: DeckType.TREASURE,
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
  const revalidated = revalidatePlayerEquipment(nextState, actorId);
  nextState = revalidated.state;
  return succeed(nextState, [
    {
      type: "ROLE_PLAYED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId,
      definitionId: card.definitionId,
      role: definition.type,
    },
    ...revalidated.events,
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
  const value = items.reduce((sum, card) => {
    const definition = findDefinition(state, card);
    return sum + (definition.goldValue ?? definition.equipment?.value ?? 0);
  }, 0);
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
    {
      type: "CHARITY_CARDS_REVEALED",
      visibility: "PRIVATE",
      recipientPlayerId: actorId,
      playerId: actorId,
      recipientId,
      cardIds: selected.map((card) => card.instanceId),
    },
    ...(recipientId === null
      ? []
      : [
          {
            type: "CHARITY_CARDS_REVEALED" as const,
            visibility: "PRIVATE" as const,
            recipientPlayerId: recipientId,
            playerId: actorId,
            recipientId,
            cardIds: selected.map((card) => card.instanceId),
          },
        ]),
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

function updateCombatAfterIntervention(state: GameState): {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
} {
  if (state.combat === null) {
    throw new TypeError("A combat intervention requires an active combat.");
  }
  const previousWindow = state.combat.reactionWindow;
  const revision = state.combat.revision + 1;
  let combat = { ...state.combat, revision };
  if (previousWindow === null) {
    return { state: { ...state, combat }, events: [] };
  }
  if (calculateCombatSidePower(state) <= calculateMonsterPower(state)) {
    combat = { ...combat, reactionWindow: null };
    return {
      state: { ...state, combat },
      events: [
        {
          type: "COMBAT_VICTORY_CANCELLED",
          visibility: "PUBLIC",
          playerId: previousWindow.claimantId,
        },
      ],
    };
  }
  const reactionWindowId = combat.nextReactionWindowSequence;
  combat = {
    ...combat,
    nextReactionWindowSequence: reactionWindowId + 1,
    reactionWindow: {
      windowId: reactionWindowId,
      declaredAtRevision: revision,
      claimantId: previousWindow.claimantId,
      confirmedPlayerIds: [previousWindow.claimantId],
    },
  };
  return {
    state: { ...state, combat },
    events: [
      {
        type: "COMBAT_REACTIONS_RESET",
        visibility: "PUBLIC",
        playerId: previousWindow.claimantId,
        reactionWindowId,
      },
    ],
  };
}

function playCard(
  state: GameState,
  actorId: PlayerId,
  command: Extract<GameCommand, { readonly type: "PLAY_CARD" }>,
  random: RandomSource,
): CommandResult {
  const reactionWindow = state.combat?.reactionWindow ?? null;
  if (reactionWindow !== null) {
    if (command.reactionWindowId !== reactionWindow.windowId) {
      return fail(
        state,
        "STALE_COMBAT_REACTION",
        "The combat reaction targets a stale victory window.",
      );
    }
    if (reactionWindow.confirmedPlayerIds.includes(actorId)) {
      return fail(
        state,
        "REACTION_ALREADY_CONFIRMED",
        "A player who passed cannot intervene until combat changes.",
      );
    }
  } else if (command.reactionWindowId !== undefined) {
    return fail(
      state,
      "STALE_COMBAT_REACTION",
      "The referenced victory reaction window is no longer active.",
    );
  }
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
  if (reactionWindow !== null) {
    const isReactionCard =
      definition.type === CardType.COMBAT_CURSE ||
      definition.type === CardType.TEMPORARY_BONUS ||
      definition.type === CardType.MONSTER_MODIFIER ||
      definition.type === CardType.ADD_MONSTER ||
      definition.type === CardType.CLONE_MONSTER;
    if (!isReactionCard) {
      return fail(
        state,
        "REACTION_WINDOW_ACTIVE",
        "Only typed combat reactions are allowed while victory is pending.",
      );
    }
  }
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
  const isPlayerSideBonusCard =
    definition.type === CardType.TEMPORARY_BONUS &&
    definition.effects.length > 0 &&
    definition.effects.every((effect) => effect.type === "COMBAT_BONUS");
  const isMonsterSideBonusCard =
    definition.type === CardType.TEMPORARY_BONUS &&
    definition.effects.length > 0 &&
    definition.effects.every(
      (effect) => effect.type === "MONSTER_COMBAT_BONUS",
    );
  const isPlayerBonus =
    isPlayerSideBonusCard &&
    command.target?.type === "COMBAT" &&
    command.target.side === "PLAYERS";
  const isCombatCurse =
    definition.type === CardType.COMBAT_CURSE &&
    definition.effects.length > 0 &&
    definition.effects.every((effect) => effect.type === "COMBAT_BONUS");
  const isMonsterModifier =
    definition.type === CardType.MONSTER_MODIFIER &&
    definition.effects.length > 0 &&
    definition.effects.every(
      (effect) =>
        effect.type === "MONSTER_COMBAT_BONUS" ||
        effect.type === "MODIFY_MONSTER",
    );
  const addsMonster =
    definition.type === CardType.ADD_MONSTER &&
    definition.effects.length > 0 &&
    definition.effects.every(
      (effect) => effect.type === "ADD_MONSTER_TO_COMBAT",
    );
  const clonesMonster =
    definition.type === CardType.CLONE_MONSTER &&
    definition.effects.length > 0 &&
    definition.effects.every(
      (effect) => effect.type === "CLONE_COMBAT_MONSTER",
    );
  const targetsMonster =
    (isMonsterSideBonusCard || isMonsterModifier || clonesMonster) &&
    command.target?.type === "COMBAT" &&
    command.target.side === "MONSTER";
  const targetsCombatPlayer =
    isCombatCurse &&
    command.target?.type === "PLAYER" &&
    (command.target.playerId === state.combat.playerId ||
      command.target.playerId === state.combat.helperId);

  if (
    (isPlayerSideBonusCard ||
      isMonsterSideBonusCard ||
      isMonsterModifier ||
      addsMonster ||
      clonesMonster ||
      isCombatCurse) &&
    command.target === null
  ) {
    return fail(state, "INVALID_TARGET", "The combat card needs a target.");
  }

  if (
    !isPlayerBonus &&
    !targetsMonster &&
    !addsMonster &&
    !targetsCombatPlayer
  ) {
    return fail(
      state,
      "CARD_NOT_PLAYABLE",
      "The card cannot be played on the selected combat side.",
    );
  }

  if (isCombatCurse && reactionWindow === null) {
    return fail(
      state,
      "REACTION_WINDOW_ACTIVE",
      "A combat Curse can only be played during a victory reaction window.",
    );
  }

  if (addsMonster && command.target?.type !== "HAND_MONSTER") {
    return fail(
      state,
      "INVALID_TARGET",
      "An add-Monster card must target a Monster in the same hand.",
    );
  }

  const combatTarget = command.target;
  const targetedEncounter =
    combatTarget?.type === "COMBAT" && combatTarget.side === "MONSTER"
      ? state.combat.monsters.find(
          (monster) => monster.encounterId === combatTarget.encounterId,
        )
      : undefined;
  if (targetsMonster && targetedEncounter === undefined) {
    return fail(
      state,
      "INVALID_TARGET",
      "The selected Monster encounter is not in this combat.",
    );
  }

  const handMonsterTarget = command.target;
  const selectedHandMonster =
    handMonsterTarget?.type === "HAND_MONSTER"
      ? actor.hand.find(
          (candidate) => candidate.instanceId === handMonsterTarget.cardId,
        )
      : undefined;
  if (addsMonster) {
    if (
      selectedHandMonster === undefined ||
      selectedHandMonster.instanceId === card.instanceId ||
      findDefinition(state, selectedHandMonster).type !== CardType.MONSTER
    ) {
      return fail(
        state,
        "INVALID_TARGET",
        "The selected card must be another Monster in the actor's hand.",
      );
    }
  }

  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    hand: player.hand.filter(
      (candidate) =>
        candidate.instanceId !== command.cardId &&
        candidate.instanceId !== selectedHandMonster?.instanceId,
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
    nextState = addToDiscard(nextState, [card]);
  } else if (targetsCombatPlayer && command.target?.type === "PLAYER") {
    const bonus = definition.effects.reduce(
      (total, effect) =>
        effect.type === "COMBAT_BONUS" ? total + effect.amount : total,
      0,
    );
    nextState = updatePlayer(nextState, command.target.playerId, (player) => ({
      ...player,
      temporaryCombatBonus: player.temporaryCombatBonus + bonus,
    }));
    nextState = addToDiscard(nextState, [card]);
  } else if (addsMonster && selectedHandMonster !== undefined) {
    const encounterId = nextEncounterId(state.combat.nextEncounterSequence);
    const added = {
      ...createCombatMonster(nextState, selectedHandMonster, encounterId),
      playedCards: [
        {
          card,
          playerId: actorId,
          strengthModifier: 0,
          treasureModifier: 0,
          purpose: "ADD_MONSTER" as const,
        },
      ],
    };
    nextState = {
      ...nextState,
      combat: {
        ...state.combat,
        monsters: [...state.combat.monsters, added],
        nextEncounterSequence: state.combat.nextEncounterSequence + 1,
        history: [
          ...state.combat.history,
          {
            type: "MONSTER_ADDED",
            playerId: actorId,
            encounterId,
            monsterDefinitionId: selectedHandMonster.definitionId,
            cardId: card.instanceId,
            definitionId: card.definitionId,
          },
        ],
      },
    };
  } else if (clonesMonster && targetedEncounter !== undefined) {
    const encounterId = nextEncounterId(state.combat.nextEncounterSequence);
    const clone: CombatMonsterState = {
      ...targetedEncounter,
      encounterId,
      sourceCard: card,
      clonedFromEncounterId: targetedEncounter.encounterId,
      playedCards: [
        ...targetedEncounter.playedCards,
        {
          card,
          playerId: actorId,
          strengthModifier: 0,
          treasureModifier: 0,
          purpose: "CLONE_MONSTER",
        },
      ],
    };
    nextState = {
      ...nextState,
      combat: {
        ...state.combat,
        monsters: [...state.combat.monsters, clone],
        nextEncounterSequence: state.combat.nextEncounterSequence + 1,
        history: [
          ...state.combat.history,
          {
            type: "MONSTER_CLONED",
            playerId: actorId,
            encounterId,
            sourceEncounterId: targetedEncounter.encounterId,
            monsterDefinitionId: targetedEncounter.monster.definitionId,
            cardId: card.instanceId,
            definitionId: card.definitionId,
          },
        ],
      },
    };
  } else if (targetedEncounter !== undefined) {
    const modifiers = definition.effects.reduce(
      (total, effect) => {
        if (effect.type === "COMBAT_BONUS") {
          return { ...total, strength: total.strength + effect.amount };
        }
        if (effect.type === "MONSTER_COMBAT_BONUS") {
          return { ...total, strength: total.strength + effect.amount };
        }
        if (effect.type === "MODIFY_MONSTER") {
          return {
            strength: total.strength + effect.strength,
            treasures: total.treasures + effect.treasures,
          };
        }
        return total;
      },
      { strength: 0, treasures: 0 },
    );
    nextState = {
      ...nextState,
      combat: {
        ...state.combat,
        monsters: state.combat.monsters.map((monster) =>
          monster.encounterId === targetedEncounter.encounterId
            ? {
                ...monster,
                strengthModifier: monster.strengthModifier + modifiers.strength,
                treasureModifier:
                  monster.treasureModifier + modifiers.treasures,
                playedCards: [
                  ...monster.playedCards,
                  {
                    card,
                    playerId: actorId,
                    strengthModifier: modifiers.strength,
                    treasureModifier: modifiers.treasures,
                    purpose: "MODIFIER",
                  },
                ],
              }
            : monster,
        ),
        history: [
          ...state.combat.history,
          {
            type: "CARD_PLAYED",
            playerId: actorId,
            cardId: card.instanceId,
            definitionId: card.definitionId,
            side: "MONSTER",
            encounterId: targetedEncounter.encounterId,
          },
        ],
      },
    };
  }

  if (nextState.combat === null) {
    throw new TypeError("Combat disappeared while playing a combat card.");
  }
  const completedCombat = nextState.combat;
  if (isPlayerBonus) {
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
            side: "PLAYERS",
          },
        ],
      },
    };
  } else if (targetsCombatPlayer && command.target?.type === "PLAYER") {
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
            side: "PLAYERS",
            targetPlayerId: command.target.playerId,
          },
        ],
      },
    };
  }

  const intervention = updateCombatAfterIntervention(nextState);
  nextState = intervention.state;

  const events: GameEvent[] = [
    {
      type: "CARD_PLAYED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId: card.instanceId,
      target: command.target,
    },
  ];
  if (addsMonster && selectedHandMonster !== undefined) {
    const added = completedCombat.monsters.at(-1)!;
    events.push({
      type: "MONSTER_ADDED",
      visibility: "PUBLIC",
      playerId: actorId,
      encounterId: added.encounterId,
      monsterCardId: selectedHandMonster.instanceId,
      monsterDefinitionId: selectedHandMonster.definitionId,
      cardId: card.instanceId,
    });
  }
  if (clonesMonster && targetedEncounter !== undefined) {
    const clone = completedCombat.monsters.at(-1)!;
    events.push({
      type: "MONSTER_CLONED",
      visibility: "PUBLIC",
      playerId: actorId,
      encounterId: clone.encounterId,
      sourceEncounterId: targetedEncounter.encounterId,
      monsterCardId: targetedEncounter.monster.instanceId,
      monsterDefinitionId: targetedEncounter.monster.definitionId,
      cardId: card.instanceId,
    });
  }
  events.push({
    type: "COMBAT_UPDATED",
    visibility: "PUBLIC",
    playerId: state.combat.playerId,
    playerPower: calculateCombatSidePower(nextState),
    monsterPower: calculateMonsterPower(nextState),
  });
  events.push(...intervention.events);
  return succeed(nextState, events);
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
    revision: state.combat.revision + 1,
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
    revision: state.combat.revision + 1,
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

function clearCombatParticipantBonuses(state: GameState): GameState {
  if (state.combat === null) return state;
  const participantIds = new Set<PlayerId>([
    state.combat.playerId,
    ...(state.combat.helperId === null ? [] : [state.combat.helperId]),
  ]);
  return {
    ...state,
    players: state.players.map((player) =>
      participantIds.has(player.id)
        ? { ...player, temporaryCombatBonus: 0 }
        : player,
    ),
  };
}

function resolveCombatRewards(
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
      "Combat rewards require the actor's active combat.",
    );
  }
  const playerPower = calculateCombatSidePower(state);
  const monsterPower = calculateMonsterPower(state);
  if (playerPower <= monsterPower) {
    return fail(
      state,
      "COMBAT_NOT_WON",
      `Player power ${playerPower} must exceed monster power ${monsterPower}.`,
    );
  }
  const levelRewards = state.combat.monsters.reduce(
    (total, monster) => total + monster.baseLevelRewards,
    0,
  );
  const treasureRewards = state.combat.monsters.reduce(
    (total, monster) => total + calculateMonsterTreasures(monster),
    0,
  );
  if (
    state.treasureDeck.length + state.treasureDiscard.length <
    treasureRewards
  ) {
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
    treasureRewards,
    random,
  );
  let nextState = updatePlayer(reward.state, actorId, (player) => ({
    ...player,
    level: player.level + levelRewards,
  }));
  nextState = clearCombatParticipantBonuses(nextState);
  nextState = addToDiscard(nextState, combatPhysicalCards(state));
  nextState = { ...nextState, phase: GamePhase.END_TURN, combat: null };
  const winner = nextState.players.find((player) => player.id === actorId);
  if (winner === undefined) {
    throw new TypeError(`Combat player ${actorId} is missing.`);
  }

  return succeed(nextState, [
    ...state.combat.monsters.map<GameEvent>((monster) => ({
      type: "COMBAT_WON",
      visibility: "PUBLIC",
      playerId: actorId,
      encounterId: monster.encounterId,
      monsterCardId: monster.monster.instanceId,
      monsterDefinitionId: monster.monster.definitionId,
    })),
    {
      type: "LEVEL_GAINED",
      visibility: "PUBLIC",
      playerId: actorId,
      amount: levelRewards,
      newLevel: winner.level,
    },
    {
      type: "TREASURE_GAINED",
      visibility: "PUBLIC",
      playerId: actorId,
      count: treasureRewards,
    },
    ...reward.events,
  ]);
}

function declareCombatVictory(
  state: GameState,
  actorId: PlayerId,
  combatRevision: number,
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
      "Only the active combat player may declare victory.",
    );
  }
  if (state.combat.revision !== combatRevision) {
    return fail(
      state,
      "STALE_COMBAT_STATE",
      "Combat changed before the victory declaration reached the server.",
    );
  }
  if (state.combat.reactionWindow !== null) {
    return fail(
      state,
      "REACTION_WINDOW_ACTIVE",
      "A victory reaction window is already active.",
    );
  }
  const playerPower = calculateCombatSidePower(state);
  const monsterPower = calculateMonsterPower(state);
  if (playerPower <= monsterPower) {
    return fail(
      state,
      "COMBAT_NOT_WON",
      `Player power ${playerPower} must exceed monster power ${monsterPower}.`,
    );
  }
  const reactionWindowId = state.combat.nextReactionWindowSequence;
  const nextState: GameState = {
    ...state,
    combat: {
      ...state.combat,
      nextReactionWindowSequence: reactionWindowId + 1,
      reactionWindow: {
        windowId: reactionWindowId,
        declaredAtRevision: state.combat.revision,
        claimantId: actorId,
        confirmedPlayerIds: [actorId],
      },
    },
  };
  const declared: GameEvent = {
    type: "COMBAT_VICTORY_DECLARED",
    visibility: "PUBLIC",
    playerId: actorId,
    reactionWindowId,
  };
  if (state.players.length === 1) {
    const resolved = resolveCombatRewards(nextState, actorId, random);
    return resolved.success
      ? succeed(resolved.state, [declared, ...resolved.events])
      : fail(state, resolved.error.code, resolved.error.message);
  }
  return succeed(nextState, [declared]);
}

function passCombatReaction(
  state: GameState,
  actorId: PlayerId,
  reactionWindowId: number,
  random: RandomSource,
): CommandResult {
  const combat = state.combat;
  const window = combat?.reactionWindow ?? null;
  if (
    combat === null ||
    window === null ||
    window.windowId !== reactionWindowId
  ) {
    return fail(
      state,
      "STALE_COMBAT_REACTION",
      "The referenced victory reaction window is no longer active.",
    );
  }
  if (window.confirmedPlayerIds.includes(actorId)) {
    return fail(
      state,
      "REACTION_ALREADY_CONFIRMED",
      "This player has already passed in the current reaction window.",
    );
  }
  const confirmedPlayerIds = [...window.confirmedPlayerIds, actorId];
  const nextState: GameState = {
    ...state,
    combat: {
      ...combat,
      reactionWindow: { ...window, confirmedPlayerIds },
    },
  };
  const passed: GameEvent = {
    type: "COMBAT_REACTION_PASSED",
    visibility: "PUBLIC",
    playerId: actorId,
    reactionWindowId,
  };
  if (confirmedPlayerIds.length < state.players.length) {
    return succeed(nextState, [passed]);
  }
  if (calculateCombatSidePower(nextState) <= calculateMonsterPower(nextState)) {
    return succeed(
      {
        ...nextState,
        combat: { ...nextState.combat!, reactionWindow: null },
      },
      [
        passed,
        {
          type: "COMBAT_VICTORY_CANCELLED",
          visibility: "PUBLIC",
          playerId: window.claimantId,
        },
      ],
    );
  }
  const resolved = resolveCombatRewards(nextState, window.claimantId, random);
  return resolved.success
    ? succeed(resolved.state, [passed, ...resolved.events])
    : fail(state, resolved.error.code, resolved.error.message);
}

function continueRunAway(
  state: GameState,
  actorId: PlayerId,
  random: RandomSource,
): EffectResult {
  let nextState = state;
  const events: GameEvent[] = [];

  while (nextState.combat?.runAway !== null) {
    const combat = nextState.combat;
    if (combat === null) break;
    const sequence = combat.runAway;
    if (sequence === null) break;
    const monster = combat.monsters[sequence.nextMonsterIndex];
    if (monster === undefined) {
      const attempts = sequence.attempts;
      let completed = clearCombatParticipantBonuses(nextState);
      completed = addToDiscard(completed, combatPhysicalCards(nextState));
      nextState = {
        ...completed,
        phase: GamePhase.END_TURN,
        combat: null,
        lastRunAwayResult: { playerId: actorId, attempts },
      };
      break;
    }

    const roll = random.nextInt(RUN_AWAY_DIE_SIDES) + 1;
    const escaped = roll >= RUN_AWAY_SUCCESS_MINIMUM;
    const badStuffApplied = !escaped && monster.badStuff.length > 0;
    const attempt = {
      encounterId: monster.encounterId,
      monsterCardId: monster.monster.instanceId,
      monsterDefinitionId: monster.monster.definitionId,
      roll,
      escaped,
      badStuffApplied,
    };
    nextState = {
      ...nextState,
      combat: {
        ...combat,
        runAway: {
          nextMonsterIndex: sequence.nextMonsterIndex + 1,
          attempts: [...sequence.attempts, attempt],
        },
      },
    };
    events.push({
      type: "RUN_AWAY_ATTEMPTED",
      visibility: "PUBLIC",
      playerId: actorId,
      encounterId: monster.encounterId,
      monsterCardId: monster.monster.instanceId,
      monsterDefinitionId: monster.monster.definitionId,
      roll,
      escaped,
    });

    if (!escaped) {
      const completion: PendingEffectCompletion = {
        type: "RUN_AWAY",
        playerId: actorId,
        encounterId: monster.encounterId,
      };
      const applied = applyEffects(
        nextState,
        actorId,
        monster.badStuff,
        random,
        monster.monster,
        completion,
      );
      nextState = applied.state;
      events.push(...applied.events);
      if (nextState.pendingDecision !== null) break;
      const completed = completeEffectResolution(nextState, completion);
      nextState = completed.state;
      events.push(...completed.events);
    }
  }

  return { state: nextState, events };
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

  const started: GameState = {
    ...state,
    combat: {
      ...state.combat,
      runAway: { nextMonsterIndex: 0, attempts: [] },
    },
  };
  const result = continueRunAway(started, actorId, random);
  return succeed(result.state, result.events);
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
  if (
    decision.completion.type === "RUN_AWAY" &&
    remaining.state.pendingDecision === null
  ) {
    const continued = continueRunAway(remaining.state, actorId, random);
    return succeed(continued.state, [
      ...events,
      ...remaining.events,
      ...continued.events,
    ]);
  }
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

  if (command.type === "PASS_COMBAT_REACTION") {
    return passCombatReaction(
      state,
      command.actorId,
      command.reactionWindowId,
      context.random,
    );
  }

  if (
    state.combat?.reactionWindow !== null &&
    state.combat?.reactionWindow !== undefined &&
    command.type !== "PLAY_CARD"
  ) {
    return fail(
      state,
      "REACTION_WINDOW_ACTIVE",
      "Only a pass or a typed combat reaction is allowed while victory is pending.",
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
    case "LOOK_FOR_TROUBLE":
      return lookForTrouble(state, command.actorId, command.cardId);
    case "LOOT_ROOM":
      return lootRoom(state, command.actorId, context.random);
    case "END_TURN":
      return endTurn(state, command.actorId, context.random);
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
    case "DECLARE_COMBAT_VICTORY":
      return declareCombatVictory(
        state,
        command.actorId,
        command.combatRevision,
        context.random,
      );
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
  try {
    if (command.type === "ADD_PLAYER") {
      result = addPlayer(state, command);
    } else {
      result = executePlayerCommand(state, command, context);
    }
  } catch (error) {
    if (error instanceof InsufficientCardsError) {
      return fail(state, "INSUFFICIENT_CARDS", error.message);
    }
    throw error;
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
