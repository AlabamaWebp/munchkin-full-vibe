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
  calculateMonsterCurrentStrength,
  calculateMonsterPower,
  calculateMonsterTreasures,
  canChangeEquipment,
  equipmentConflict,
  equipmentRestriction,
  permanentCombatPower,
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
  parseCombatId,
  parseCurseResponseId,
  parseEncounterId,
  parseHelpOfferId,
  parsePendingDecisionId,
  type CardInstanceId,
  type EncounterId,
  type PlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";
import {
  BALANCED_TREASURE_WEIGHTS,
  InsufficientCardsError,
  doorWeightsForLevel,
  drawCards as drawFromDeck,
  effectiveTierForStrength,
  shuffle,
  type TierWeights,
} from "./deck.js";
import { roleCapacity } from "./roles.js";
import {
  evaluateConditions,
  resolveConditionalModifier,
} from "./conditions.js";

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
export const STARTING_HAND_SIZE_PER_DECK = 4;
export const RUN_AWAY_DIE_SIDES = 6;
export const RUN_AWAY_SUCCESS_MINIMUM = 5;
export const HAND_LIMIT = 5;
export const SELL_LEVEL_VALUE = 1000;
export const WINNING_LEVEL = 10;
export const COMBAT_REACTION_TIMEOUT_MS = 20_000;
export const PENDING_DECISION_TIMEOUT_MS = 60_000;
export const HELP_OFFER_TIMEOUT_MS = 30_000;
export const CURSE_RESPONSE_TIMEOUT_MS = 20_000;

export interface Clock {
  now(): number;
}

export interface CommandContext {
  readonly random: RandomSource;
  readonly clock?: Clock;
}

function contextNow(context: CommandContext): number {
  return context.clock?.now() ?? 0;
}

export type CommandErrorCode =
  | "ACTOR_NOT_FOUND"
  | "CARD_NOT_IN_HAND"
  | "CARD_NOT_EQUIPPED"
  | "CARD_NOT_EQUIPMENT"
  | "CARD_NOT_SELLABLE"
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
  | "SALE_LEVEL_LIMIT"
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

function hasAutomaticCurseProtection(
  state: GameState,
  playerId: PlayerId,
  curse: CardDefinition,
): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) return false;
  const sources = [
    ...player.equipment,
    ...player.classCards,
    ...player.raceCards,
    ...(player.hirelingCard === null ? [] : [player.hirelingCard]),
    ...(player.mountCard === null ? [] : [player.mountCard]),
  ];
  return sources.some((card) => {
    const definition = findDefinition(state, card);
    const modifier =
      definition.equipment?.modifier ??
      definition.role?.modifier ??
      definition.companion?.modifier;
    return (
      modifier?.type === "AUTOMATIC_PROTECTION" &&
      modifier.protection === "CANCEL" &&
      evaluateConditions(modifier.conditions, {
        state,
        player,
        card: definition,
        curse,
      })
    );
  });
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
  const detached = player.equipmentAttachments.filter((attachment) =>
    incompatibleIds.has(attachment.attachedToCardId),
  );
  const detachedIds = new Set(
    detached.map((attachment) => attachment.card.instanceId),
  );
  return {
    state: updatePlayer(state, playerId, (current) => ({
      ...current,
      equipment: current.equipment.filter(
        (card) => !incompatibleIds.has(card.instanceId),
      ),
      equipmentAttachments: current.equipmentAttachments.filter(
        (attachment) => !detachedIds.has(attachment.card.instanceId),
      ),
      hand: [
        ...current.hand,
        ...incompatible,
        ...detached.map((attachment) => attachment.card),
      ],
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
    baseStrength: definition.monster.strength,
    baseLevelRewards: definition.monster.levelRewards,
    baseTreasureRewards: definition.monster.treasureRewards,
    tier: definition.tier,
    tags: (definition.tags ?? []).filter(
      (tag): tag is import("./cards.js").MonsterTag =>
        ["BEAST", "CONSTRUCT", "ARCANE", "UNDEAD"].includes(tag),
    ),
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

function drawCards(
  state: GameState,
  deck: DeckType,
  count: number,
  random: RandomSource,
  weights?: TierWeights,
) {
  const active = state.players.find(
    (player) => player.id === state.activePlayerId,
  );
  const selectedWeights =
    weights ??
    (deck === DeckType.DOOR
      ? doorWeightsForLevel(active?.level ?? 1)
      : BALANCED_TREASURE_WEIGHTS[
          (active?.level ?? 1) <= 3 ? 1 : (active?.level ?? 1) <= 6 ? 2 : 3
        ]);
  return drawFromDeck(state, deck, count, random, selectedWeights);
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
  protectedCardId?: CardInstanceId,
): EffectResult {
  const player = state.players.find((candidate) => candidate.id === playerId);

  if (player === undefined) {
    throw new TypeError(
      `Player ${playerId} is missing during effect resolution.`,
    );
  }

  const source = [
    ...(effect.zone === "HAND" ? player.hand : player.equipment),
  ].filter((card) => card.instanceId !== protectedCardId);
  const discarded: CardInstance[] = [];

  while (discarded.length < effect.count && source.length > 0) {
    const index = random.nextInt(source.length);
    const [card] = source.splice(index, 1);

    if (card !== undefined) {
      discarded.push(card);
    }
  }

  const discardedIds = new Set(discarded.map((card) => card.instanceId));
  const discardedAttachments =
    effect.zone === "EQUIPMENT"
      ? player.equipmentAttachments.filter((attachment) =>
          discardedIds.has(attachment.attachedToCardId),
        )
      : [];
  const discardedAttachmentIds = new Set(
    discardedAttachments.map((attachment) => attachment.card.instanceId),
  );
  const allDiscarded = [
    ...discarded,
    ...discardedAttachments.map((attachment) => attachment.card),
  ];
  let nextState = updatePlayer(state, playerId, (current) =>
    effect.zone === "HAND"
      ? { ...current, hand: source }
      : {
          ...current,
          equipment: current.equipment.filter(
            (card) => !discardedIds.has(card.instanceId),
          ),
          equipmentAttachments: current.equipmentAttachments.filter(
            (attachment) =>
              !discardedAttachmentIds.has(attachment.card.instanceId),
          ),
        },
  );
  nextState = addToDiscard(nextState, allDiscarded);

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
              cardIds: allDiscarded.map((card) => card.instanceId),
            },
            {
              type: "CARDS_DISCARDED_SUMMARY",
              visibility: "PUBLIC",
              playerId,
              count: allDiscarded.length,
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
  nowEpochMs = 0,
  protectedCardId?: CardInstanceId,
): EffectResult {
  let nextState = state;
  const events: GameEvent[] = [];

  for (const [index, effect] of effects.entries()) {
    switch (effect.type) {
      case "COMBAT_BONUS":
        nextState = updatePlayer(nextState, playerId, (player) => ({
          ...player,
          activeEffects: [
            ...(player.activeEffects ?? []),
            {
              type: "COMBAT_POWER",
              sourceDefinitionId: sourceCard.definitionId,
              amount: effect.amount,
              expires: "END_OF_COMBAT",
            },
          ],
        }));
        break;
      case "GAIN_LEVEL":
        {
          const before = nextState.players.find(
            (player) => player.id === playerId,
          )!.level;
          const maximum =
            effect.victoryEligible === true ? WINNING_LEVEL : WINNING_LEVEL - 1;
          const after = Math.min(maximum, before + effect.amount);
          nextState = updatePlayer(nextState, playerId, (player) => ({
            ...player,
            level: after,
          }));
          if (after > before)
            events.push({
              type: "LEVEL_GAINED",
              visibility: "PUBLIC",
              playerId,
              amount: after - before,
              newLevel: after,
            });
        }
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
        const result = discardRandomCards(
          nextState,
          playerId,
          effect,
          random,
          protectedCardId,
        );
        nextState = result.state;
        events.push(...result.events);
        break;
      }
      case "DISCARD_CHOSEN_CARDS": {
        const player = nextState.players.find(
          (candidate) => candidate.id === playerId,
        );
        const candidates =
          effect.zone === "HAND"
            ? (player?.hand ?? [])
            : (player?.equipment ?? []).filter(
                (card) => card.instanceId !== protectedCardId,
              );
        const available = candidates.length;
        const count = Math.min(effect.count, available ?? 0);
        if (count === 0) break;
        nextState = {
          ...nextState,
          pendingDecision: {
            decisionId: parsePendingDecisionId(
              `decision-${nextState.nextPendingDecisionSequence}`,
            ),
            createdAtEpochMs: nowEpochMs,
            expiresAtEpochMs: nowEpochMs + PENDING_DECISION_TIMEOUT_MS,
            type: "DISCARD_CARDS",
            playerId,
            zone: effect.zone,
            count,
            sourceCardId: sourceCard.instanceId,
            sourceDefinitionId: sourceCard.definitionId,
            remainingEffects: effects.slice(index + 1),
            completion,
            ...(protectedCardId === undefined ? {} : { protectedCardId }),
          },
          nextPendingDecisionSequence:
            nextState.nextPendingDecisionSequence + 1,
        };
        const pendingDecision = nextState.pendingDecision;
        if (pendingDecision?.type !== "DISCARD_CARDS")
          throw new TypeError("Discard decision creation failed.");
        events.push({
          type: "CARD_DISCARD_REQUIRED",
          visibility: "PUBLIC",
          playerId,
          count,
          zone: effect.zone,
          sourceCardId: sourceCard.instanceId,
          sourceDefinitionId: sourceCard.definitionId,
          decisionId: pendingDecision.decisionId,
          expiresAtEpochMs: pendingDecision.expiresAtEpochMs,
        });
        return { state: nextState, events };
      }
      case "DISCARD_ROLE": {
        const player = nextState.players.find(
          (candidate) => candidate.id === playerId,
        );
        const cards =
          effect.role === "CLASS" ? player?.classCards : player?.raceCards;
        if (cards !== undefined && cards.length > 0) {
          nextState = updatePlayer(nextState, playerId, (current) => ({
            ...current,
            ...(effect.role === "CLASS"
              ? { classCards: [] }
              : { raceCards: [] }),
          }));
          nextState = addToDiscard(nextState, cards);
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
            ...player.classCards,
            ...player.raceCards,
            ...player.rolePermissionCards,
            ...player.equipmentAttachments.map((attachment) => attachment.card),
            ...(player.hirelingCard === null ? [] : [player.hirelingCard]),
            ...(player.mountCard === null ? [] : [player.mountCard]),
          ];
          nextState = updatePlayer(nextState, playerId, (current) => ({
            ...current,
            hand: [],
            equipment: [],
            equipmentAttachments: [],
            classCards: [],
            raceCards: [],
            rolePermissionCards: [],
            hirelingCard: null,
            mountCard: null,
            activeEffects: [],
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
  nowEpochMs = 0,
  protectedCardId?: CardInstanceId,
): EffectResult {
  const applied = applyEffects(
    state,
    playerId,
    effects,
    random,
    sourceCard,
    completion,
    nowEpochMs,
    protectedCardId,
  );
  if (applied.state.pendingDecision !== null) return applied;
  const completed = completeEffectResolution(applied.state, completion);
  return {
    state: completed.state,
    events: [...applied.events, ...completed.events],
  };
}

function curseProtectionCards(
  state: GameState,
  targetPlayerId: PlayerId,
  curse: CardDefinition,
): {
  readonly cancelCardIds: readonly CardInstanceId[];
  readonly itemGuardCardIds: readonly CardInstanceId[];
  readonly protectableItemIds: readonly CardInstanceId[];
} {
  const target = state.players.find((player) => player.id === targetPlayerId);
  if (target === undefined)
    return { cancelCardIds: [], itemGuardCardIds: [], protectableItemIds: [] };
  const protectableItemIds = curse.effects.some(
    (effect) =>
      (effect.type === "DISCARD_RANDOM_CARDS" ||
        effect.type === "DISCARD_CHOSEN_CARDS") &&
      effect.zone === "EQUIPMENT",
  )
    ? target.equipment.map((card) => card.instanceId)
    : [];
  const usable = target.hand.flatMap((card) => {
    const definition = findDefinition(state, card);
    const protection = definition.curseProtection;
    if (
      protection === undefined ||
      !evaluateConditions(protection.conditions ?? [], {
        state,
        player: target,
        card: definition,
        curse,
      }) ||
      (protection.mode === "PROTECT_ONE_ITEM" &&
        protectableItemIds.length === 0)
    )
      return [];
    return [{ card, mode: protection.mode }];
  });
  return {
    cancelCardIds: usable
      .filter((entry) => entry.mode === "CANCEL")
      .map((entry) => entry.card.instanceId),
    itemGuardCardIds: usable
      .filter((entry) => entry.mode === "PROTECT_ONE_ITEM")
      .map((entry) => entry.card.instanceId),
    protectableItemIds,
  };
}

function resolveOrOfferCurseResponse(
  state: GameState,
  sourcePlayerId: PlayerId | null,
  targetPlayerId: PlayerId,
  curseCard: CardInstance,
  phaseAfterResolution: "POST_DOOR" | null,
  random: RandomSource,
  nowEpochMs: number,
): EffectResult {
  const definition = findDefinition(state, curseCard);
  if (hasAutomaticCurseProtection(state, targetPlayerId, definition)) {
    return {
      state: {
        ...addToDiscard(state, [curseCard]),
        ...(phaseAfterResolution === null
          ? {}
          : { phase: GamePhase.POST_DOOR }),
      },
      events: [
        {
          type: "CURSE_RESOLVED",
          visibility: "PUBLIC",
          playerId: targetPlayerId,
          cardId: curseCard.instanceId,
          definitionId: curseCard.definitionId,
        },
      ],
    };
  }
  const choices = curseProtectionCards(state, targetPlayerId, definition);
  if (
    choices.cancelCardIds.length === 0 &&
    choices.itemGuardCardIds.length === 0
  ) {
    return applyEffectsAndComplete(
      state,
      targetPlayerId,
      definition.effects,
      random,
      curseCard,
      {
        type: "CURSE",
        card: curseCard,
        targetPlayerId,
        phaseAfterResolution,
      },
      nowEpochMs,
    );
  }
  const responseId = parseCurseResponseId(
    `curse-response-${state.nextCurseResponseSequence ?? 1}`,
  );
  const expiresAtEpochMs = nowEpochMs + CURSE_RESPONSE_TIMEOUT_MS;
  return {
    state: {
      ...state,
      curseResponse: {
        responseId,
        targetPlayerId,
        sourcePlayerId,
        curseCard,
        remainingEffects: definition.effects,
        phaseAfterResolution,
        ...choices,
        createdAtEpochMs: nowEpochMs,
        expiresAtEpochMs,
      },
      nextCurseResponseSequence: (state.nextCurseResponseSequence ?? 1) + 1,
    },
    events: [
      {
        type: "CURSE_RESPONSE_REQUIRED",
        visibility: "PUBLIC",
        responseId,
        playerId: targetPlayerId,
        curseCardId: curseCard.instanceId,
        curseDefinitionId: curseCard.definitionId,
        expiresAtEpochMs,
      },
    ],
  };
}

function respondToCurse(
  state: GameState,
  actorId: PlayerId,
  command: Extract<GameCommand, { readonly type: "RESPOND_TO_CURSE" }>,
  random: RandomSource,
  nowEpochMs: number,
): CommandResult {
  const pending = state.curseResponse;
  if (
    pending === null ||
    pending.responseId !== command.responseId ||
    pending.targetPlayerId !== actorId
  )
    return fail(
      state,
      "PENDING_DECISION",
      "There is no current Curse response for this player.",
    );
  const withoutResponse = { ...state, curseResponse: null };
  const completion: PendingEffectCompletion = {
    type: "CURSE",
    card: pending.curseCard,
    targetPlayerId: actorId,
    phaseAfterResolution: pending.phaseAfterResolution,
  };
  const response = command.response;
  if (response.type === "DECLINE") {
    const applied = applyEffectsAndComplete(
      withoutResponse,
      actorId,
      pending.remainingEffects,
      random,
      pending.curseCard,
      completion,
      nowEpochMs,
    );
    return succeed(applied.state, [
      {
        type: "CURSE_RESPONSE_RESOLVED",
        visibility: "PUBLIC",
        responseId: pending.responseId,
        playerId: actorId,
        outcome: "DECLINED",
      },
      ...applied.events,
    ]);
  }
  const target = state.players.find((player) => player.id === actorId)!;
  const protectionCard = target.hand.find(
    (card) => card.instanceId === response.cardId,
  );
  const isCancel = pending.cancelCardIds.includes(response.cardId);
  const isGuard = pending.itemGuardCardIds.includes(response.cardId);
  if (protectionCard === undefined || (!isCancel && !isGuard))
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The selected card is not an applicable Curse protection.",
    );
  const protectedCardId = response.protectedCardId;
  if (
    isGuard &&
    (protectedCardId === undefined ||
      !pending.protectableItemIds.includes(protectedCardId))
  )
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "Select one Equipment card affected by this Curse.",
    );
  if (isCancel && protectedCardId !== undefined)
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "Cancel protection does not select an Equipment card.",
    );
  let protectedState = updatePlayer(withoutResponse, actorId, (player) => ({
    ...player,
    hand: player.hand.filter(
      (card) => card.instanceId !== protectionCard.instanceId,
    ),
  }));
  protectedState = addToDiscard(protectedState, [protectionCard]);
  const privateEvent: GameEvent = {
    type: "CURSE_PROTECTION_USED",
    visibility: "PRIVATE",
    recipientPlayerId: actorId,
    playerId: actorId,
    cardId: protectionCard.instanceId,
    ...(protectedCardId === undefined ? {} : { protectedCardId }),
  };
  if (isCancel) {
    protectedState = addToDiscard(protectedState, [pending.curseCard]);
    if (pending.phaseAfterResolution !== null)
      protectedState = { ...protectedState, phase: GamePhase.POST_DOOR };
    return succeed(protectedState, [
      {
        type: "CURSE_RESPONSE_RESOLVED",
        visibility: "PUBLIC",
        responseId: pending.responseId,
        playerId: actorId,
        outcome: "CANCELLED",
      },
      privateEvent,
      {
        type: "CURSE_RESOLVED",
        visibility: "PUBLIC",
        playerId: actorId,
        cardId: pending.curseCard.instanceId,
        definitionId: pending.curseCard.definitionId,
      },
    ]);
  }
  const applied = applyEffectsAndComplete(
    protectedState,
    actorId,
    pending.remainingEffects,
    random,
    pending.curseCard,
    completion,
    nowEpochMs,
    protectedCardId,
  );
  return succeed(applied.state, [
    {
      type: "CURSE_RESPONSE_RESOLVED",
      visibility: "PUBLIC",
      responseId: pending.responseId,
      playerId: actorId,
      outcome: "ITEM_PROTECTED",
    },
    privateEvent,
    ...applied.events,
  ]);
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
    sex: command.sex,
    level: 1,
    hand: [],
    equipment: [],
    equipmentAttachments: [],
    classCards: [],
    raceCards: [],
    rolePermissionCards: [],
    hirelingCard: null,
    mountCard: null,
    isDead: false,
    activeEffects: [],
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
  const balanced = state.config.mode === "BALANCED";
  const starterCandidates = state.treasureDeck.filter((card) => {
    const definition = findDefinition(state, card);
    const equipment = definition.equipment;
    return (
      definition.starterEligible === true &&
      definition.tier === 1 &&
      definition.type === CardType.EQUIPMENT &&
      equipment !== undefined &&
      (equipment.restrictions?.length ?? 0) === 0 &&
      (equipment.combatBonus ?? 0) >= 1 &&
      (equipment.combatBonus ?? 0) <= 2
    );
  });
  if (balanced && starterCandidates.length < state.players.length) {
    return fail(
      state,
      "INSUFFICIENT_CARDS",
      "Balanced setup requires one legal Tier-1 starter item per player.",
    );
  }

  let workingState = state;
  const reserved = new Map<PlayerId, CardInstance>();
  if (balanced) {
    const candidates = [...starterCandidates];
    for (const player of state.players) {
      const [starter] = candidates.splice(random.nextInt(candidates.length), 1);
      if (starter === undefined)
        throw new RangeError("Starter selection failed.");
      reserved.set(player.id, starter);
    }
    const reservedIds = new Set(
      [...reserved.values()].map((card) => card.instanceId),
    );
    workingState = {
      ...workingState,
      treasureDeck: workingState.treasureDeck.filter(
        (card) => !reservedIds.has(card.instanceId),
      ),
    };
  } else {
    workingState = {
      ...workingState,
      doorDeck: shuffle(workingState.doorDeck, random),
      treasureDeck: shuffle(workingState.treasureDeck, random),
    };
  }

  const dealEvents: GameEvent[] = [];
  const players: PlayerState[] = [];
  for (const player of state.players) {
    const doorDraw = drawCards(
      workingState,
      DeckType.DOOR,
      STARTING_HAND_SIZE_PER_DECK,
      random,
      doorWeightsForLevel(1),
    );
    workingState = doorDraw.state;
    const normalTreasureCount = balanced
      ? STARTING_HAND_SIZE_PER_DECK - 1
      : STARTING_HAND_SIZE_PER_DECK;
    const treasureDraw = drawCards(
      workingState,
      DeckType.TREASURE,
      normalTreasureCount,
      random,
      BALANCED_TREASURE_WEIGHTS[1],
    );
    workingState = treasureDraw.state;
    const doorCards = doorDraw.cards;
    const treasureCards = [
      ...treasureDraw.cards,
      ...(reserved.get(player.id) === undefined
        ? []
        : [reserved.get(player.id)!]),
    ];
    const hand = balanced
      ? shuffle([...doorCards, ...treasureCards], random)
      : [...doorCards, ...treasureCards];
    dealEvents.push({
      type: "CARDS_DEALT",
      visibility: "PRIVATE",
      recipientPlayerId: player.id,
      playerId: player.id,
      doorCardIds: doorCards.map((card) => card.instanceId),
      treasureCardIds: treasureCards.map((card) => card.instanceId),
    });

    players.push({ ...player, hand });
  }
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
      doorDeck: workingState.doorDeck,
      treasureDeck: workingState.treasureDeck,
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
  nowEpochMs: number,
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
    const combatId = parseCombatId(
      `combat-${nextState.nextCombatSequence ?? 1}`,
    );
    nextState = {
      ...nextState,
      nextCombatSequence: (nextState.nextCombatSequence ?? 1) + 1,
      combat: {
        combatId,
        playerId: actorId,
        revision: 1,
        monsters: [createCombatMonster(nextState, card, encounterId)],
        nextEncounterSequence: 2,
        nextHelpOfferSequence: 1,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        helpOffer: null,
        helpAgreement: null,
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
    const effectResult = resolveOrOfferCurseResponse(
      nextState,
      null,
      actorId,
      card,
      "POST_DOOR",
      random,
      nowEpochMs,
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

export function canScavenge(state: GameState, playerId: PlayerId): boolean {
  if (
    state.phase !== GamePhase.POST_DOOR ||
    state.activePlayerId !== playerId ||
    state.combat !== null ||
    state.pendingDecision !== null
  )
    return false;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (
    player === undefined ||
    player.isDead ||
    player.level !== 1 ||
    permanentCombatPower(state, playerId) > 2
  )
    return false;
  const legalPositiveInHand = player.hand.some((card) => {
    const definition = findDefinition(state, card);
    return (
      definition.type === CardType.EQUIPMENT &&
      (definition.equipment?.combatBonus ?? 0) > 0 &&
      equipmentRestriction(player, definition) === null &&
      equipmentConflict(state, player, definition) === null
    );
  });
  if (legalPositiveInHand) return false;
  if (
    player.equipment.some(
      (card) => (findDefinition(state, card).equipment?.combatBonus ?? 0) > 1,
    )
  )
    return false;
  const lastTurn = [...state.eventLog]
    .reverse()
    .find(
      (entry) =>
        entry.event.type === "SCAVENGED" && entry.event.playerId === playerId,
    )?.turnNumber;
  if (
    lastTurn !== undefined &&
    state.turnNumber - lastTurn < state.players.length
  )
    return false;
  return state.treasureDeck.some((card) => {
    const definition = findDefinition(state, card);
    return (
      definition.scavengeEligible === true &&
      definition.sellable === false &&
      definition.tradeable === false &&
      equipmentRestriction(player, definition) === null &&
      equipmentConflict(state, player, definition) === null
    );
  });
}

function scavenge(
  state: GameState,
  actorId: PlayerId,
  random: RandomSource,
): CommandResult {
  if (!canScavenge(state, actorId))
    return fail(
      state,
      "COMMAND_NOT_AVAILABLE",
      "Scavenge is only available to an eligible recovering player.",
    );
  const player = state.players.find((candidate) => candidate.id === actorId)!;
  const candidateIndices = state.treasureDeck.flatMap((card, index) => {
    const definition = findDefinition(state, card);
    return definition.scavengeEligible === true &&
      definition.sellable === false &&
      definition.tradeable === false &&
      equipmentRestriction(player, definition) === null &&
      equipmentConflict(state, player, definition) === null
      ? [index]
      : [];
  });
  const selectedIndex =
    candidateIndices[random.nextInt(candidateIndices.length)];
  if (selectedIndex === undefined)
    throw new RangeError("Scavenge selection failed.");
  const treasureDeck = [...state.treasureDeck];
  const [card] = treasureDeck.splice(selectedIndex, 1);
  if (card === undefined) throw new RangeError("Scavenge selected no card.");
  const nextState = updatePlayer(
    { ...state, treasureDeck, phase: GamePhase.END_TURN },
    actorId,
    (current) => ({ ...current, hand: [...current.hand, card] }),
  );
  return succeed(nextState, [
    { type: "SCAVENGED", visibility: "PUBLIC", playerId: actorId, count: 1 },
    {
      type: "SCAVENGED_CARD",
      visibility: "PRIVATE",
      recipientPlayerId: actorId,
      playerId: actorId,
      cardId: card.instanceId,
      definitionId: card.definitionId,
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
  const combatId = parseCombatId(`combat-${nextState.nextCombatSequence ?? 1}`);
  nextState = {
    ...nextState,
    nextCombatSequence: (nextState.nextCombatSequence ?? 1) + 1,
    phase: GamePhase.DOOR_RESOLUTION,
    combat: {
      combatId,
      playerId: actorId,
      revision: 1,
      monsters: [createCombatMonster(nextState, monster, encounterId)],
      nextEncounterSequence: 2,
      nextHelpOfferSequence: 1,
      nextReactionWindowSequence: 1,
      reactionWindow: null,
      helpOffer: null,
      helpAgreement: null,
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
      activeEffects: player.activeEffects.filter(
        (effect) =>
          effect.expires !== "END_OF_TARGET_NEXT_TURN" ||
          (effect.targetTurnNumber ?? Number.POSITIVE_INFINITY) >
            nextTurnNumber,
      ),
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
  command: Extract<GameCommand, { readonly type: "PLAY_ROLE" }>,
): CommandResult {
  const { cardId, replaceCardId } = command;
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
    definition.type === CardType.CLASS ? player.classCards : player.raceCards;
  if (previous.some((role) => role.definitionId === definition.id))
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The same role definition cannot be active twice.",
    );
  const capacity = roleCapacity(state, player, definition.type);
  const replacement =
    replaceCardId === undefined
      ? undefined
      : previous.find((role) => role.instanceId === replaceCardId);
  if (
    (previous.length >= capacity && replacement === undefined) ||
    (previous.length < capacity && replaceCardId !== undefined)
  )
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      previous.length >= capacity
        ? "Playing a role at capacity requires an exact replacement target."
        : "A role cannot be replaced while a free role slot exists.",
    );
  const nextRoles = [
    ...previous.filter((role) => role.instanceId !== replaceCardId),
    card,
  ];
  let nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    hand: current.hand.filter((candidate) => candidate.instanceId !== cardId),
    ...(definition.type === CardType.CLASS
      ? { classCards: nextRoles }
      : { raceCards: nextRoles }),
  }));
  if (replacement !== undefined)
    nextState = addToDiscard(nextState, [replacement]);
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

function discardRole(
  state: GameState,
  actorId: PlayerId,
  cardId: CardInstanceId,
): CommandResult {
  if (!canChangeEquipment(state, actorId))
    return fail(
      state,
      "INVALID_PHASE",
      "Roles can only be changed during your turn outside combat.",
    );
  const player = state.players.find((candidate) => candidate.id === actorId);
  if (player === undefined)
    return fail(state, "ACTOR_NOT_FOUND", `Player ${actorId} was not found.`);
  const card = [...player.classCards, ...player.raceCards].find(
    (candidate) => candidate.instanceId === cardId,
  );
  if (card === undefined)
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The role is not active for the actor.",
    );
  const definition = findDefinition(state, card);
  const role = definition.type === CardType.CLASS ? "CLASS" : definition.type === CardType.RACE ? "RACE" : null;
  if (role === null)
    return fail(state, "CARD_NOT_PLAYABLE", "Only a Class or Race can be discarded as a role.");
  let nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    ...(role === "CLASS"
      ? { classCards: current.classCards.filter((candidate) => candidate.instanceId !== cardId) }
      : { raceCards: current.raceCards.filter((candidate) => candidate.instanceId !== cardId) }),
  }));
  nextState = addToDiscard(nextState, [card]);
  const revalidated = revalidatePlayerEquipment(nextState, actorId);
  return succeed(revalidated.state, [
    {
      type: "ROLE_DISCARDED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId,
      definitionId: definition.id,
      role,
    },
    ...revalidated.events,
  ]);
}

function playRolePermission(
  state: GameState,
  actorId: PlayerId,
  cardId: CardInstanceId,
): CommandResult {
  if (!canChangeEquipment(state, actorId))
    return fail(
      state,
      "INVALID_PHASE",
      "Role permissions can only change outside combat on your turn.",
    );
  const player = state.players.find((candidate) => candidate.id === actorId)!;
  const card = player.hand.find((candidate) => candidate.instanceId === cardId);
  if (card === undefined)
    return fail(
      state,
      "CARD_NOT_IN_HAND",
      `Card ${cardId} is not in the actor's hand.`,
    );
  const definition = findDefinition(state, card);
  if (
    definition.type !== CardType.ROLE_PERMISSION ||
    definition.rolePermission === undefined
  )
    return fail(
      state,
      "CARD_NOT_PLAYABLE",
      "The card is not a role permission.",
    );
  if (
    player.rolePermissionCards.some(
      (existing) =>
        findDefinition(state, existing).rolePermission?.role ===
        definition.rolePermission!.role,
    )
  )
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "Role permissions do not stack.",
    );
  const nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    hand: current.hand.filter((candidate) => candidate.instanceId !== cardId),
    rolePermissionCards: [...current.rolePermissionCards, card],
  }));
  return succeed(nextState, [
    {
      type: "ROLE_PERMISSION_PLAYED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId,
      definitionId: definition.id,
      role: definition.rolePermission.role,
    },
  ]);
}

function discardRolePermission(
  state: GameState,
  actorId: PlayerId,
  cardId: CardInstanceId,
  nowEpochMs: number,
): CommandResult {
  if (!canChangeEquipment(state, actorId))
    return fail(
      state,
      "INVALID_PHASE",
      "Role permissions can only change outside combat on your turn.",
    );
  const player = state.players.find((candidate) => candidate.id === actorId)!;
  const card = player.rolePermissionCards.find(
    (candidate) => candidate.instanceId === cardId,
  );
  if (card === undefined)
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The role permission is not owned by the actor.",
    );
  const definition = findDefinition(state, card);
  const role = definition.rolePermission?.role;
  if (role === undefined)
    throw new TypeError("A role permission has no role metadata.");
  let nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    rolePermissionCards: current.rolePermissionCards.filter(
      (candidate) => candidate.instanceId !== cardId,
    ),
  }));
  nextState = addToDiscard(nextState, [card]);
  const roles = role === "CLASS" ? player.classCards : player.raceCards;
  const events: GameEvent[] = [
    {
      type: "ROLE_PERMISSION_DISCARDED",
      visibility: "PUBLIC",
      playerId: actorId,
      cardId,
      definitionId: definition.id,
      role,
    },
  ];
  if (roles.length > 1) {
    const decisionId = parsePendingDecisionId(
      `decision-${nextState.nextPendingDecisionSequence}`,
    );
    nextState = {
      ...nextState,
      pendingDecision: {
        decisionId,
        createdAtEpochMs: nowEpochMs,
        expiresAtEpochMs: nowEpochMs + PENDING_DECISION_TIMEOUT_MS,
        type: "CHOOSE_ROLE_TO_KEEP",
        playerId: actorId,
        role,
        candidateCardIds: roles.map((candidate) => candidate.instanceId),
      },
      nextPendingDecisionSequence: nextState.nextPendingDecisionSequence + 1,
    };
    events.push({
      type: "ROLE_RETENTION_REQUIRED",
      visibility: "PUBLIC",
      playerId: actorId,
      decisionId,
      role,
      expiresAtEpochMs: nowEpochMs + PENDING_DECISION_TIMEOUT_MS,
    });
  }
  return succeed(nextState, events);
}

function resolveRoleRetention(
  state: GameState,
  actorId: PlayerId,
  decisionId: import("./identifiers.js").PendingDecisionId,
  keepCardId: CardInstanceId,
): CommandResult {
  const decision = state.pendingDecision;
  if (
    decision?.type !== "CHOOSE_ROLE_TO_KEEP" ||
    decision.playerId !== actorId ||
    decision.decisionId !== decisionId ||
    !decision.candidateCardIds.includes(keepCardId)
  )
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The role-retention decision is stale or invalid.",
    );
  const player = state.players.find((candidate) => candidate.id === actorId)!;
  const roles =
    decision.role === "CLASS" ? player.classCards : player.raceCards;
  const kept = roles.find((card) => card.instanceId === keepCardId);
  if (kept === undefined)
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The selected role is no longer active.",
    );
  const discarded = roles.filter((card) => card.instanceId !== keepCardId);
  let nextState = updatePlayer(
    { ...state, pendingDecision: null },
    actorId,
    (current) => ({
      ...current,
      ...(decision.role === "CLASS"
        ? { classCards: [kept] }
        : { raceCards: [kept] }),
    }),
  );
  nextState = addToDiscard(nextState, discarded);
  const revalidated = revalidatePlayerEquipment(nextState, actorId);
  return succeed(revalidated.state, [
    {
      type: "ROLE_RETAINED",
      visibility: "PUBLIC",
      playerId: actorId,
      role: decision.role,
      keptCardId: keepCardId,
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
    items.some((card) => {
      const definition = findDefinition(state, card);
      const defaultSellable =
        definition.deck === DeckType.TREASURE &&
        (definition.goldValue ?? 0) > 0;
      return (definition.sellable ?? defaultSellable) ? false : true;
    })
  )
    return fail(
      state,
      "CARD_NOT_SELLABLE",
      "Every selected card must be an explicitly sellable Treasure.",
    );
  const value = items.reduce((sum, card) => {
    const definition = findDefinition(state, card);
    return sum + (definition.goldValue ?? 0);
  }, 0);
  if (value < SELL_LEVEL_VALUE)
    return fail(
      state,
      "INSUFFICIENT_SALE_VALUE",
      `Sold items must be worth at least ${SELL_LEVEL_VALUE}.`,
    );
  const levelsGained = Math.floor(value / SELL_LEVEL_VALUE);
  if (
    player.level >= WINNING_LEVEL - 1 ||
    levelsGained > WINNING_LEVEL - 1 - player.level
  )
    return fail(
      state,
      "SALE_LEVEL_LIMIT",
      "A sale cannot grant level 10 or more levels than fit below victory.",
    );
  const soldIds = new Set(cardIds);
  const soldAttachments = player.equipmentAttachments.filter((attachment) =>
    soldIds.has(attachment.attachedToCardId),
  );
  let nextState = updatePlayer(state, actorId, (current) => ({
    ...current,
    level: current.level + levelsGained,
    hand: current.hand.filter((card) => !soldIds.has(card.instanceId)),
    equipment: current.equipment.filter(
      (card) => !soldIds.has(card.instanceId),
    ),
    equipmentAttachments: current.equipmentAttachments.filter(
      (attachment) => !soldIds.has(attachment.attachedToCardId),
    ),
  }));
  nextState = addToDiscard(nextState, [
    ...items,
    ...soldAttachments.map((attachment) => attachment.card),
  ]);
  return succeed(nextState, [
    {
      type: "CARDS_SOLD",
      visibility: "PUBLIC",
      playerId: actorId,
      cardIds,
      value,
      levelsGained,
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
  const definition = findDefinition(state, card);
  const tradeable =
    definition.tradeable ?? definition.type === CardType.EQUIPMENT;
  if (!tradeable)
    return fail(state, "CARD_NOT_PLAYABLE", "This card cannot be traded.");
  const detached = actor.equipmentAttachments.filter(
    (attachment) => attachment.attachedToCardId === cardId,
  );
  let nextState = updatePlayer(state, actorId, (player) => ({
    ...player,
    hand: [
      ...player.hand.filter((item) => item.instanceId !== cardId),
      ...detached.map((attachment) => attachment.card),
    ],
    equipment: player.equipment.filter((item) => item.instanceId !== cardId),
    equipmentAttachments: player.equipmentAttachments.filter(
      (attachment) => attachment.attachedToCardId !== cardId,
    ),
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

function updateCombatAfterIntervention(
  state: GameState,
  nowEpochMs: number,
): {
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
      eligiblePlayerIds: state.players.map((player) => player.id),
      expiresAtEpochMs: nowEpochMs + COMBAT_REACTION_TIMEOUT_MS,
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

function validateCombatAddress(
  state: GameState,
  combatId: import("./identifiers.js").CombatId | undefined,
  combatRevision: number | undefined,
): CommandResult | null {
  if (
    state.combat === null ||
    combatId === undefined ||
    state.combat.combatId !== combatId
  )
    return fail(
      state,
      "STALE_COMBAT_STATE",
      "The command targets a stale combat.",
    );
  if (combatRevision === undefined || state.combat.revision !== combatRevision)
    return fail(state, "STALE_COMBAT_STATE", "The combat revision is stale.");
  return null;
}

function playCard(
  state: GameState,
  actorId: PlayerId,
  command: Extract<GameCommand, { readonly type: "PLAY_CARD" }>,
  random: RandomSource,
  nowEpochMs: number,
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
  if (state.combat !== null) {
    const stale = validateCombatAddress(
      state,
      command.combatId,
      command.combatRevision,
    );
    if (stale !== null) return stale;
  } else if (
    command.combatId !== undefined ||
    command.combatRevision !== undefined ||
    command.reactionWindowId !== undefined
  ) {
    return fail(state, "STALE_COMBAT_STATE", "The combat is no longer active.");
  }
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
  const targetsSelf =
    command.target === null ||
    (command.target.type === "PLAYER" && command.target.playerId === actorId);
  if (
    definition.type === CardType.HIRELING ||
    definition.type === CardType.MOUNT
  ) {
    if (!canChangeEquipment(state, actorId) || !targetsSelf)
      return fail(
        state,
        "INVALID_TARGET",
        "A companion can only be played into your own slot on your turn.",
      );
    const previous =
      definition.type === CardType.HIRELING
        ? actor.hirelingCard
        : actor.mountCard;
    let nextState = updatePlayer(state, actorId, (player) => ({
      ...player,
      hand: player.hand.filter(
        (candidate) => candidate.instanceId !== card.instanceId,
      ),
      ...(definition.type === CardType.HIRELING
        ? { hirelingCard: card }
        : { mountCard: card }),
    }));
    if (previous !== null) nextState = addToDiscard(nextState, [previous]);
    return succeed(nextState, [
      {
        type: "CARD_PLAYED",
        visibility: "PUBLIC",
        playerId: actorId,
        cardId: card.instanceId,
        target: command.target,
      },
    ]);
  }
  if (definition.type === CardType.ATTACHMENT) {
    if (
      !canChangeEquipment(state, actorId) ||
      command.target?.type !== "EQUIPMENT" ||
      definition.attachment === undefined
    )
      return fail(
        state,
        "INVALID_TARGET",
        "An attachment must target your equipped weapon on your turn.",
      );
    const targetCardId = command.target.cardId;
    const host = actor.equipment.find(
      (candidate) => candidate.instanceId === targetCardId,
    );
    const hostDefinition =
      host === undefined ? undefined : findDefinition(state, host);
    const allowed =
      hostDefinition !== undefined &&
      (definition.attachment.allowedDefinitionIds?.includes(
        hostDefinition.id,
      ) ??
        hostDefinition.tags.some((tag) =>
          definition.attachment!.allowedTags.includes(
            tag as import("./cards.js").EquipmentTag,
          ),
        ));
    if (
      host === undefined ||
      !allowed ||
      actor.equipmentAttachments.some(
        (attachment) => attachment.attachedToCardId === host.instanceId,
      )
    )
      return fail(
        state,
        "CARD_NOT_PLAYABLE",
        "The selected Equipment cannot receive this attachment.",
      );
    const nextState = updatePlayer(state, actorId, (player) => ({
      ...player,
      hand: player.hand.filter(
        (candidate) => candidate.instanceId !== card.instanceId,
      ),
      equipmentAttachments: [
        ...player.equipmentAttachments,
        { card, attachedToCardId: host.instanceId },
      ],
    }));
    return succeed(nextState, [
      {
        type: "CARD_PLAYED",
        visibility: "PUBLIC",
        playerId: actorId,
        cardId: card.instanceId,
        target: command.target,
      },
    ]);
  }
  if (definition.type === CardType.UTILITY) {
    if (state.combat !== null)
      return fail(
        state,
        "CARD_NOT_PLAYABLE",
        "A turn utility cannot be played during combat.",
      );
    if (!canChangeEquipment(state, actorId) || !targetsSelf)
      return fail(
        state,
        "INVALID_PHASE",
        "A utility card can only be played on your turn outside combat.",
      );
    const withoutCard = updatePlayer(state, actorId, (player) => ({
      ...player,
      hand: player.hand.filter(
        (candidate) => candidate.instanceId !== card.instanceId,
      ),
    }));
    const applied = applyEffects(
      withoutCard,
      actorId,
      definition.effects,
      random,
      card,
      {
        type: "CURSE",
        card,
        targetPlayerId: actorId,
        phaseAfterResolution: null,
      },
    );
    return succeed(addToDiscard(applied.state, [card]), [
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
    const applied = resolveOrOfferCurseResponse(
      nextState,
      actorId,
      targetId,
      card,
      null,
      random,
      nowEpochMs,
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
      command.target.playerId === state.combat.helpAgreement?.helperId);

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
      activeEffects: [
        ...(player.activeEffects ?? []),
        {
          type: "COMBAT_POWER",
          sourceDefinitionId: definition.id,
          amount: bonus,
          expires: "END_OF_COMBAT",
        },
      ],
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
      activeEffects: [
        ...(player.activeEffects ?? []),
        {
          type: "COMBAT_POWER",
          sourceDefinitionId: definition.id,
          amount: bonus,
          expires: "END_OF_COMBAT",
        },
      ],
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

  const intervention = updateCombatAfterIntervention(nextState, nowEpochMs);
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

function expectedCombatTreasures(state: GameState): number {
  return (
    state.combat?.monsters.reduce(
      (sum, monster) => sum + calculateMonsterTreasures(monster),
      0,
    ) ?? 0
  );
}

function validateHelpContext(
  state: GameState,
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
): CommandResult | null {
  const stale = validateCombatAddress(state, combatId, combatRevision);
  if (stale !== null) return stale;
  if (
    state.combat === null ||
    state.phase !== GamePhase.DOOR_RESOLUTION ||
    state.combat.reactionWindow !== null ||
    state.combat.runAway !== null
  ) {
    return fail(
      state,
      "INVALID_PHASE",
      "Help negotiation requires an unresolved active combat.",
    );
  }
  if (state.combat.helpAgreement != null) {
    return fail(
      state,
      "HELP_ALREADY_ACCEPTED",
      "A helper has already joined this combat.",
    );
  }
  return null;
}

function proposeHelp(
  state: GameState,
  actorId: PlayerId,
  helperId: PlayerId,
  treasureCount: number,
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
  nowEpochMs: number,
): CommandResult {
  const invalid = validateHelpContext(state, combatId, combatRevision);
  if (invalid !== null) return invalid;
  const combat = state.combat!;
  if (combat.playerId !== actorId)
    return fail(
      state,
      "INVALID_PHASE",
      "Only the combat player may offer help.",
    );
  if (combat.helpOffer !== null)
    return fail(
      state,
      "HELP_NOT_REQUESTED",
      "Close the outstanding offer before creating a new one.",
    );
  if (
    helperId === actorId ||
    !state.players.some((player) => player.id === helperId && !player.isDead)
  ) {
    return fail(
      state,
      "INVALID_HELPER",
      "The requested helper is not eligible.",
    );
  }
  if (
    !Number.isInteger(treasureCount) ||
    treasureCount < 0 ||
    treasureCount > expectedCombatTreasures(state)
  )
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The promised Treasure count is invalid.",
    );
  const offerId = parseHelpOfferId(`offer-${combat.nextHelpOfferSequence}`);
  const nextCombat = {
    ...combat,
    revision: combat.revision + 1,
    helpOffer: {
      offerId,
      helperId,
      proposedBy: "ACTIVE" as const,
      treasureCount,
      expiresAtEpochMs: nowEpochMs + HELP_OFFER_TIMEOUT_MS,
    },
    nextHelpOfferSequence: combat.nextHelpOfferSequence + 1,
    history: [
      ...combat.history,
      {
        type: "HELP_OFFERED" as const,
        playerId: actorId,
        helperId,
        offerId,
        treasureCount,
      },
    ],
  };
  return succeed({ ...state, combat: nextCombat }, [
    {
      type: "HELP_OFFERED",
      visibility: "PUBLIC",
      playerId: actorId,
      helperId,
      offerId,
      treasureCount,
      expiresAtEpochMs: nowEpochMs + HELP_OFFER_TIMEOUT_MS,
    },
  ]);
}

function currentOffer(
  state: GameState,
  offerId: import("./identifiers.js").HelpOfferId,
): import("./game-state.js").HelpOfferState | null {
  return state.combat?.helpOffer?.offerId === offerId
    ? state.combat.helpOffer
    : null;
}

function counterHelp(
  state: GameState,
  actorId: PlayerId,
  offerId: import("./identifiers.js").HelpOfferId,
  treasureCount: number,
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
  nowEpochMs: number,
): CommandResult {
  const invalid = validateHelpContext(state, combatId, combatRevision);
  if (invalid !== null) return invalid;
  const offer = currentOffer(state, offerId);
  if (
    offer === null ||
    offer.proposedBy !== "ACTIVE" ||
    offer.helperId !== actorId
  )
    return fail(
      state,
      "HELP_NOT_REQUESTED",
      "Only the addressed helper may counter this offer.",
    );
  if (
    !Number.isInteger(treasureCount) ||
    treasureCount < 0 ||
    treasureCount > expectedCombatTreasures(state) ||
    treasureCount === offer.treasureCount
  )
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      "The counter must be a different legal count.",
    );
  const combat = state.combat!;
  const nextOfferId = parseHelpOfferId(`offer-${combat.nextHelpOfferSequence}`);
  const nextCombat = {
    ...combat,
    revision: combat.revision + 1,
    nextHelpOfferSequence: combat.nextHelpOfferSequence + 1,
    helpOffer: {
      offerId: nextOfferId,
      helperId: actorId,
      proposedBy: "HELPER" as const,
      treasureCount,
      expiresAtEpochMs: nowEpochMs + HELP_OFFER_TIMEOUT_MS,
    },
    history: [
      ...combat.history,
      {
        type: "HELP_COUNTERED" as const,
        playerId: actorId,
        helperId: actorId,
        offerId: nextOfferId,
        treasureCount,
      },
    ],
  };
  return succeed({ ...state, combat: nextCombat }, [
    {
      type: "HELP_COUNTERED",
      visibility: "PUBLIC",
      playerId: actorId,
      helperId: actorId,
      offerId: nextOfferId,
      treasureCount,
      expiresAtEpochMs: nowEpochMs + HELP_OFFER_TIMEOUT_MS,
    },
  ]);
}

function acceptHelpOffer(
  state: GameState,
  actorId: PlayerId,
  offerId: import("./identifiers.js").HelpOfferId,
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
): CommandResult {
  const invalid = validateHelpContext(state, combatId, combatRevision);
  if (invalid !== null) return invalid;
  const offer = currentOffer(state, offerId);
  if (offer === null)
    return fail(
      state,
      "HELP_NOT_REQUESTED",
      "The referenced help offer is stale.",
    );
  const combat = state.combat!;
  const expectedActor =
    offer.proposedBy === "ACTIVE" ? offer.helperId : combat.playerId;
  if (actorId !== expectedActor)
    return fail(
      state,
      "INVALID_HELPER",
      "This player cannot accept the offer.",
    );
  const nextCombat = {
    ...combat,
    revision: combat.revision + 1,
    helpOffer: null,
    helpAgreement: {
      helperId: offer.helperId,
      promisedTreasures: offer.treasureCount,
      acceptedOfferId: offer.offerId,
      agreedAtCombatRevision: combat.revision + 1,
    },
    history: [
      ...combat.history,
      {
        type: "HELP_OFFER_ACCEPTED" as const,
        playerId: actorId,
        helperId: offer.helperId,
        offerId: offer.offerId,
        treasureCount: offer.treasureCount,
      },
    ],
  };
  const nextState = { ...state, combat: nextCombat };
  return succeed(nextState, [
    {
      type: "HELP_OFFER_ACCEPTED",
      visibility: "PUBLIC",
      playerId: actorId,
      helperId: offer.helperId,
      offerId: offer.offerId,
      treasureCount: offer.treasureCount,
    },
    {
      type: "COMBAT_UPDATED",
      visibility: "PUBLIC",
      playerId: combat.playerId,
      playerPower: calculateCombatSidePower(nextState),
      monsterPower: calculateMonsterPower(nextState),
    },
  ]);
}

function rejectOrCancelHelp(
  state: GameState,
  actorId: PlayerId,
  offerId: import("./identifiers.js").HelpOfferId,
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
  cancel: boolean,
): CommandResult {
  const invalid = validateHelpContext(state, combatId, combatRevision);
  if (invalid !== null) return invalid;
  const offer = currentOffer(state, offerId);
  if (offer === null)
    return fail(
      state,
      "HELP_NOT_REQUESTED",
      "The referenced help offer is stale.",
    );
  const activeId = state.combat!.playerId;
  const expectedRejector =
    offer.proposedBy === "ACTIVE" ? offer.helperId : activeId;
  if (
    (cancel && actorId !== activeId) ||
    (!cancel && actorId !== expectedRejector)
  )
    return fail(state, "INVALID_HELPER", "This player cannot close the offer.");
  return succeed(
    {
      ...state,
      combat: {
        ...state.combat!,
        revision: state.combat!.revision + 1,
        helpOffer: null,
      },
    },
    [
      {
        type: cancel ? "HELP_OFFER_CANCELLED" : "HELP_OFFER_REJECTED",
        visibility: "PUBLIC",
        playerId: actorId,
        helperId: offer.helperId,
        offerId,
      },
    ],
  );
}

function clearCombatParticipantBonuses(state: GameState): GameState {
  if (state.combat === null) return state;
  const participantIds = new Set<PlayerId>([
    state.combat.playerId,
    ...(state.combat.helpAgreement == null
      ? []
      : [state.combat.helpAgreement.helperId]),
  ]);
  return {
    ...state,
    players: state.players.map((player) =>
      participantIds.has(player.id)
        ? {
            ...player,
            activeEffects: (player.activeEffects ?? []).filter(
              (effect) => effect.expires !== "END_OF_COMBAT",
            ),
          }
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

  let rewardState = state;
  const rewardCards: CardInstance[] = [];
  const rewardDeckEvents: GameEvent[] = [];
  for (const encounter of state.combat.monsters) {
    const count = calculateMonsterTreasures(encounter);
    const draw = drawCards(
      rewardState,
      DeckType.TREASURE,
      count,
      random,
      BALANCED_TREASURE_WEIGHTS[
        effectiveTierForStrength(
          calculateMonsterCurrentStrength(state, encounter),
        )
      ],
    );
    rewardState = draw.state;
    rewardCards.push(...draw.cards);
    rewardDeckEvents.push(...draw.events);
  }
  const shuffledReward = shuffle(rewardCards, random);
  const agreement = state.combat.helpAgreement;
  const helperCount =
    agreement === null
      ? 0
      : Math.min(agreement.promisedTreasures, shuffledReward.length);
  const helperCards = shuffledReward.slice(0, helperCount);
  const activeCards = shuffledReward.slice(helperCount);
  let nextState = updatePlayer(rewardState, actorId, (player) => ({
    ...player,
    hand: [...player.hand, ...activeCards],
    level: Math.min(WINNING_LEVEL, player.level + levelRewards),
  }));
  if (agreement !== null) {
    nextState = updatePlayer(nextState, agreement.helperId, (player) => ({
      ...player,
      hand: [...player.hand, ...helperCards],
    }));
  }
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
      amount:
        winner.level -
        state.players.find((player) => player.id === actorId)!.level,
      newLevel: winner.level,
    },
    ...rewardDeckEvents,
    {
      type: "TREASURE_GAINED",
      visibility: "PUBLIC",
      playerId: actorId,
      count: activeCards.length,
    },
    ...(agreement === null
      ? []
      : [
          {
            type: "TREASURE_GAINED" as const,
            visibility: "PUBLIC" as const,
            playerId: agreement.helperId,
            count: helperCards.length,
          },
        ]),
    {
      type: "COMBAT_REWARD_CARDS",
      visibility: "PRIVATE",
      recipientPlayerId: actorId,
      playerId: actorId,
      cardIds: activeCards.map((card) => card.instanceId),
    },
    ...(agreement === null
      ? []
      : [
          {
            type: "COMBAT_REWARD_CARDS" as const,
            visibility: "PRIVATE" as const,
            recipientPlayerId: agreement.helperId,
            playerId: agreement.helperId,
            cardIds: helperCards.map((card) => card.instanceId),
          },
        ]),
  ]);
}

function declareCombatVictory(
  state: GameState,
  actorId: PlayerId,
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
  random: RandomSource,
  nowEpochMs: number,
): CommandResult {
  const stale = validateCombatAddress(state, combatId, combatRevision);
  if (stale !== null) return stale;
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
  const cancelledOffer = state.combat.helpOffer;
  const nextState: GameState = {
    ...state,
    combat: {
      ...state.combat,
      helpOffer: null,
      nextReactionWindowSequence: reactionWindowId + 1,
      reactionWindow: {
        windowId: reactionWindowId,
        declaredAtRevision: state.combat.revision,
        claimantId: actorId,
        confirmedPlayerIds: [actorId],
        eligiblePlayerIds: state.players.map((player) => player.id),
        expiresAtEpochMs: nowEpochMs + COMBAT_REACTION_TIMEOUT_MS,
      },
    },
  };
  const declared: GameEvent = {
    type: "COMBAT_VICTORY_DECLARED",
    visibility: "PUBLIC",
    playerId: actorId,
    reactionWindowId,
    combatId: state.combat.combatId,
    combatRevision: state.combat.revision,
    expiresAtEpochMs: nowEpochMs + COMBAT_REACTION_TIMEOUT_MS,
  };
  const cancellationEvents: GameEvent[] =
    cancelledOffer === null
      ? []
      : [
          {
            type: "HELP_OFFER_CANCELLED",
            visibility: "PUBLIC",
            playerId: actorId,
            helperId: cancelledOffer.helperId,
            offerId: cancelledOffer.offerId,
          },
        ];
  if (state.players.length === 1) {
    const resolved = resolveCombatRewards(nextState, actorId, random);
    return resolved.success
      ? succeed(resolved.state, [
          ...cancellationEvents,
          declared,
          ...resolved.events,
        ])
      : fail(state, resolved.error.code, resolved.error.message);
  }
  return succeed(nextState, [...cancellationEvents, declared]);
}

function passCombatReaction(
  state: GameState,
  actorId: PlayerId,
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
  reactionWindowId: number,
  random: RandomSource,
): CommandResult {
  const stale = validateCombatAddress(state, combatId, combatRevision);
  if (stale !== null) return stale;
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
  if (confirmedPlayerIds.length < window.eligiblePlayerIds.length) {
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
  _actorId: PlayerId,
  random: RandomSource,
  nowEpochMs: number,
): EffectResult {
  let nextState = state;
  const events: GameEvent[] = [];

  while (nextState.combat?.runAway !== null) {
    const combat = nextState.combat;
    if (combat === null) break;
    const sequence = combat.runAway;
    if (sequence === null) break;

    if (sequence.sharedBadStuffCursor !== null) {
      const shared = sequence.sharedBadStuffCursor;
      const monster = combat.monsters[shared.encounterIndex];
      if (monster === undefined)
        throw new RangeError("Shared Bad Stuff encounter is missing.");
      const combatantId = sequence.combatantIds[shared.nextCombatantIndex];
      if (combatantId === undefined) {
        nextState = {
          ...nextState,
          combat: {
            ...combat,
            runAway: {
              ...sequence,
              cursor: {
                encounterIndex: shared.encounterIndex + 1,
                combatantIndex: 0,
              },
              sharedBadStuffCursor: null,
              sharedBadStuffResolvedEncounterIds: [
                ...sequence.sharedBadStuffResolvedEncounterIds,
                monster.encounterId,
              ],
            },
          },
        };
        continue;
      }
      const combatant = nextState.players.find(
        (player) => player.id === combatantId,
      );
      nextState = {
        ...nextState,
        combat: {
          ...combat,
          runAway: {
            ...sequence,
            sharedBadStuffCursor: {
              ...shared,
              nextCombatantIndex: shared.nextCombatantIndex + 1,
            },
          },
        },
      };
      if (combatant?.isDead === true) continue;
      const completion: PendingEffectCompletion = {
        type: "RUN_AWAY",
        playerId: combatantId,
        encounterId: monster.encounterId,
        combatId: combat.combatId,
        combatRevision: combat.revision,
      };
      const applied = applyEffects(
        nextState,
        combatantId,
        monster.badStuff,
        random,
        monster.monster,
        completion,
        nowEpochMs,
      );
      nextState = applied.state;
      events.push(...applied.events);
      if (nextState.pendingDecision !== null) break;
      const completed = completeEffectResolution(nextState, completion);
      nextState = completed.state;
      events.push(...completed.events);
      continue;
    }

    const monster = combat.monsters[sequence.cursor.encounterIndex];
    if (monster === undefined) {
      const attempts = sequence.attempts;
      let completed = clearCombatParticipantBonuses(nextState);
      completed = addToDiscard(completed, combatPhysicalCards(nextState));
      nextState = {
        ...completed,
        phase: GamePhase.END_TURN,
        combat: null,
        lastRunAwayResult: { playerId: combat.playerId, attempts },
      };
      break;
    }

    const combatantId = sequence.combatantIds[sequence.cursor.combatantIndex];
    if (combatantId === undefined) {
      const hasFailure = sequence.attempts.some(
        (attempt) =>
          attempt.encounterId === monster.encounterId &&
          attempt.outcome === "FAILED",
      );
      if (
        monster.badStuff.length > 0 &&
        findDefinition(nextState, monster.monster).monster?.badStuffTarget ===
          "ALL_COMBATANTS" &&
        hasFailure &&
        !sequence.sharedBadStuffResolvedEncounterIds.includes(
          monster.encounterId,
        )
      ) {
        nextState = {
          ...nextState,
          combat: {
            ...combat,
            runAway: {
              ...sequence,
              sharedBadStuffCursor: {
                encounterIndex: sequence.cursor.encounterIndex,
                nextCombatantIndex: 0,
              },
            },
          },
        };
      } else {
        nextState = {
          ...nextState,
          combat: {
            ...combat,
            runAway: {
              ...sequence,
              cursor: {
                encounterIndex: sequence.cursor.encounterIndex + 1,
                combatantIndex: 0,
              },
            },
          },
        };
      }
      continue;
    }

    const combatant = nextState.players.find(
      (player) => player.id === combatantId,
    );
    const nextCursor = {
      encounterIndex: sequence.cursor.encounterIndex,
      combatantIndex: sequence.cursor.combatantIndex + 1,
    };
    if (combatant?.isDead === true) {
      nextState = {
        ...nextState,
        combat: {
          ...combat,
          runAway: {
            ...sequence,
            cursor: nextCursor,
            attempts: [
              ...sequence.attempts,
              {
                encounterId: monster.encounterId,
                monsterCardId: monster.monster.instanceId,
                monsterDefinitionId: monster.monster.definitionId,
                combatantId,
                roll: null,
                outcome: "SKIPPED_DEAD",
                badStuffApplied: false,
              },
            ],
          },
        },
      };
      continue;
    }

    const roll = random.nextInt(RUN_AWAY_DIE_SIDES) + 1;
    const monsterDefinition = findDefinition(nextState, monster.monster);
    const roleModifier = [
      ...(combatant?.equipment ?? []),
      ...(combatant?.classCards ?? []),
      ...(combatant?.raceCards ?? []),
      ...(combatant?.hirelingCard === null ||
      combatant?.hirelingCard === undefined
        ? []
        : [combatant.hirelingCard]),
      ...(combatant?.mountCard === null || combatant?.mountCard === undefined
        ? []
        : [combatant.mountCard]),
    ].reduce((sum, card) => {
      const definition = findDefinition(nextState, card);
      const modifier =
        definition.equipment?.modifier ??
        definition.role?.modifier ??
        definition.companion?.modifier;
      return modifier?.type === "RUN_AWAY_ROLL"
        ? sum +
            resolveConditionalModifier(modifier, {
              state: nextState,
              player: combatant!,
              monster: monsterDefinition,
              card: definition,
            })
        : sum;
    }, 0);
    const activeModifier = (combatant?.activeEffects ?? [])
      .filter((effect) => effect.type === "RUN_AWAY_ROLL")
      .reduce((sum, effect) => sum + effect.amount, 0);
    const escaped =
      roll + roleModifier + activeModifier >= RUN_AWAY_SUCCESS_MINIMUM;
    const allCombatants =
      monsterDefinition.monster?.badStuffTarget === "ALL_COMBATANTS";
    const badStuffApplied = !escaped && monster.badStuff.length > 0;
    const attempt = {
      encounterId: monster.encounterId,
      monsterCardId: monster.monster.instanceId,
      monsterDefinitionId: monster.monster.definitionId,
      roll,
      combatantId,
      outcome: escaped ? ("ESCAPED" as const) : ("FAILED" as const),
      badStuffApplied,
    };
    nextState = {
      ...nextState,
      combat: {
        ...combat,
        runAway: {
          combatantIds: sequence.combatantIds,
          cursor: nextCursor,
          attempts: [...sequence.attempts, attempt],
          sharedBadStuffResolvedEncounterIds:
            sequence.sharedBadStuffResolvedEncounterIds,
          sharedBadStuffCursor: sequence.sharedBadStuffCursor,
        },
      },
    };
    events.push({
      type: "RUN_AWAY_ATTEMPTED",
      visibility: "PUBLIC",
      playerId: combatantId,
      encounterId: monster.encounterId,
      monsterCardId: monster.monster.instanceId,
      monsterDefinitionId: monster.monster.definitionId,
      roll,
      escaped,
    });

    if (!escaped && !allCombatants) {
      const completion: PendingEffectCompletion = {
        type: "RUN_AWAY",
        playerId: combatantId,
        encounterId: monster.encounterId,
        combatId: combat.combatId,
        combatRevision: combat.revision,
      };
      const applied = applyEffects(
        nextState,
        combatantId,
        monster.badStuff,
        random,
        monster.monster,
        completion,
        nowEpochMs,
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
  combatId: import("./identifiers.js").CombatId,
  combatRevision: number,
  random: RandomSource,
  nowEpochMs: number,
): CommandResult {
  const stale = validateCombatAddress(state, combatId, combatRevision);
  if (stale !== null) return stale;
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

  const cancelledOffer = state.combat.helpOffer;
  const runAwayRevision = state.combat.revision + 1;
  const started: GameState = {
    ...state,
    combat: {
      ...state.combat,
      revision: runAwayRevision,
      helpOffer: null,
      runAway: {
        combatantIds: [
          actorId,
          ...(state.combat.helpAgreement === null
            ? []
            : [state.combat.helpAgreement.helperId]),
        ],
        cursor: { combatantIndex: 0, encounterIndex: 0 },
        attempts: [],
        sharedBadStuffResolvedEncounterIds: [],
        sharedBadStuffCursor: null,
      },
    },
  };
  const result = continueRunAway(started, actorId, random, nowEpochMs);
  return succeed(result.state, [
    ...(cancelledOffer === null
      ? []
      : [
          {
            type: "HELP_OFFER_CANCELLED" as const,
            visibility: "PUBLIC" as const,
            playerId: actorId,
            helperId: cancelledOffer.helperId,
            offerId: cancelledOffer.offerId,
          },
        ]),
    ...result.events,
  ]);
}

function resolveCardDiscard(
  state: GameState,
  actorId: PlayerId,
  cardIds: readonly import("./identifiers.js").CardInstanceId[],
  random: RandomSource,
  decisionId: import("./identifiers.js").PendingDecisionId,
  combatId: import("./identifiers.js").CombatId | undefined,
  combatRevision: number | undefined,
  nowEpochMs: number,
): CommandResult {
  const decision = state.pendingDecision;
  if (
    decision === null ||
    decision.type !== "DISCARD_CARDS" ||
    decision.playerId !== actorId ||
    decision.decisionId !== decisionId
  ) {
    return fail(
      state,
      "PENDING_DECISION",
      "There is no card-discard decision for this player.",
    );
  }
  if (decision.completion.type === "RUN_AWAY") {
    if (
      combatId !== decision.completion.combatId ||
      combatRevision !== decision.completion.combatRevision ||
      state.combat?.combatId !== decision.completion.combatId ||
      state.combat.revision !== decision.completion.combatRevision
    )
      return fail(
        state,
        "STALE_COMBAT_STATE",
        "The pending decision belongs to a stale combat.",
      );
  }
  const player = state.players.find((candidate) => candidate.id === actorId)!;
  const source = decision.zone === "HAND" ? player.hand : player.equipment;
  const legalSource = source.filter(
    (card) => card.instanceId !== decision.protectedCardId,
  );
  if (
    cardIds.length !== decision.count ||
    new Set(cardIds).size !== cardIds.length ||
    cardIds.some((id) => !legalSource.some((card) => card.instanceId === id))
  ) {
    return fail(
      state,
      "INVALID_CARD_SELECTION",
      `Select exactly ${decision.count} available card(s).`,
    );
  }
  const selected = source.filter((card) => cardIds.includes(card.instanceId));
  const selectedIds = new Set(cardIds);
  const selectedAttachments =
    decision.zone === "EQUIPMENT"
      ? player.equipmentAttachments.filter((attachment) =>
          selectedIds.has(attachment.attachedToCardId),
        )
      : [];
  const selectedAttachmentIds = new Set(
    selectedAttachments.map((attachment) => attachment.card.instanceId),
  );
  const allSelected = [
    ...selected,
    ...selectedAttachments.map((attachment) => attachment.card),
  ];
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
          equipmentAttachments: current.equipmentAttachments.filter(
            (attachment) =>
              !selectedAttachmentIds.has(attachment.card.instanceId),
          ),
        },
  );
  nextState = addToDiscard(nextState, allSelected);
  nextState = { ...nextState, pendingDecision: null };
  const events: GameEvent[] = [
    {
      type: "CARDS_DISCARDED",
      visibility: "PRIVATE",
      recipientPlayerId: actorId,
      playerId: actorId,
      cardIds: allSelected.map((card) => card.instanceId),
    },
    {
      type: "CARDS_DISCARDED_SUMMARY",
      visibility: "PUBLIC",
      playerId: actorId,
      count: allSelected.length,
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
    nowEpochMs,
    decision.protectedCardId,
  );
  if (
    decision.completion.type === "RUN_AWAY" &&
    remaining.state.pendingDecision === null
  ) {
    const continued = continueRunAway(
      remaining.state,
      actorId,
      random,
      nowEpochMs,
    );
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
      command.decisionId,
      command.combatId,
      command.combatRevision,
      contextNow(context),
    );
  }

  if (command.type === "RESOLVE_ROLE_RETENTION") {
    return resolveRoleRetention(
      state,
      command.actorId,
      command.decisionId,
      command.keepCardId,
    );
  }

  if (command.type === "RESPOND_TO_CURSE") {
    return respondToCurse(
      state,
      command.actorId,
      command,
      context.random,
      contextNow(context),
    );
  }

  if (state.curseResponse != null) {
    return fail(
      state,
      "PENDING_DECISION",
      "The target must resolve the current Curse response first.",
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
      command.combatId,
      command.combatRevision,
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
    return playCard(
      state,
      command.actorId,
      command,
      context.random,
      contextNow(context),
    );
  }

  if (command.type === "TRADE_ITEM") {
    return tradeItem(
      state,
      command.actorId,
      command.cardId,
      command.recipientId,
    );
  }

  if (command.type === "COUNTER_HELP") {
    return counterHelp(
      state,
      command.actorId,
      command.offerId,
      command.treasureCount,
      command.combatId,
      command.combatRevision,
      contextNow(context),
    );
  }
  if (command.type === "ACCEPT_HELP_OFFER") {
    return acceptHelpOffer(
      state,
      command.actorId,
      command.offerId,
      command.combatId,
      command.combatRevision,
    );
  }
  if (
    command.type === "REJECT_HELP_OFFER" ||
    command.type === "CANCEL_HELP_OFFER"
  ) {
    return rejectOrCancelHelp(
      state,
      command.actorId,
      command.offerId,
      command.combatId,
      command.combatRevision,
      command.type === "CANCEL_HELP_OFFER",
    );
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
      return kickDoor(
        state,
        command.actorId,
        context.random,
        contextNow(context),
      );
    case "LOOK_FOR_TROUBLE":
      return lookForTrouble(state, command.actorId, command.cardId);
    case "LOOT_ROOM":
      return lootRoom(state, command.actorId, context.random);
    case "SCAVENGE":
      return scavenge(state, command.actorId, context.random);
    case "END_TURN":
      return endTurn(state, command.actorId, context.random);
    case "EQUIP_ITEM":
      return equipItem(state, command.actorId, command.cardId);
    case "UNEQUIP_ITEM":
      return unequipItem(state, command.actorId, command.cardId);
    case "PLAY_ROLE":
      return playRole(state, command.actorId, command);
    case "DISCARD_ROLE":
      return discardRole(state, command.actorId, command.cardId);
    case "PLAY_ROLE_PERMISSION":
      return playRolePermission(state, command.actorId, command.cardId);
    case "DISCARD_ROLE_PERMISSION":
      return discardRolePermission(
        state,
        command.actorId,
        command.cardId,
        contextNow(context),
      );
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
    case "PROPOSE_HELP":
      return proposeHelp(
        state,
        command.actorId,
        command.helperId,
        command.treasureCount,
        command.combatId,
        command.combatRevision,
        contextNow(context),
      );
    case "DECLARE_COMBAT_VICTORY":
      return declareCombatVictory(
        state,
        command.actorId,
        command.combatId,
        command.combatRevision,
        context.random,
        contextNow(context),
      );
    case "RUN_AWAY":
      return runAway(
        state,
        command.actorId,
        command.combatId,
        command.combatRevision,
        context.random,
        contextNow(context),
      );
  }
}

function appendResultEvents(
  previousState: GameState,
  result: CommandResult,
): CommandResult {
  if (!result.success || result.events.length === 0) return result;
  let turnNumber =
    previousState.status === GameStatus.LOBBY &&
    result.state.status !== GameStatus.LOBBY
      ? result.state.turnNumber
      : previousState.turnNumber;
  const firstSequence = previousState.eventLog.length + 1;
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
      eventLog: [...previousState.eventLog, ...entries],
    },
  };
}

export function getNextDeadlineEpochMs(state: GameState): number | null {
  const deadlines = [
    state.pendingDecision?.expiresAtEpochMs,
    state.curseResponse?.expiresAtEpochMs,
    state.combat?.reactionWindow?.expiresAtEpochMs,
    state.combat?.helpOffer?.expiresAtEpochMs,
  ].filter((value): value is number => value !== undefined && value > 0);
  return deadlines.length === 0 ? null : Math.min(...deadlines);
}

function autoResolveOneExpiredState(
  state: GameState,
  context: CommandContext,
  nowEpochMs: number,
): CommandResult {
  const decision = state.pendingDecision;
  if (
    decision !== null &&
    decision.expiresAtEpochMs > 0 &&
    decision.expiresAtEpochMs <= nowEpochMs
  ) {
    if (decision.type === "CHOOSE_ROLE_TO_KEEP") {
      const keepCardId = decision.candidateCardIds[0];
      if (keepCardId === undefined)
        return fail(
          state,
          "INVALID_CARD_SELECTION",
          "The expired role decision has no legal default.",
        );
      const resolved = resolveRoleRetention(
        state,
        decision.playerId,
        decision.decisionId,
        keepCardId,
      );
      return resolved.success
        ? succeed(resolved.state, [
            {
              type: "DECISION_AUTO_RESOLVED",
              visibility: "PUBLIC",
              decisionId: decision.decisionId,
              playerId: decision.playerId,
              decisionType: decision.type,
            },
            ...resolved.events,
          ])
        : resolved;
    }
    const player = state.players.find(
      (candidate) => candidate.id === decision.playerId,
    );
    const source = (
      decision.zone === "HAND" ? player?.hand : player?.equipment
    )?.filter((card) => card.instanceId !== decision.protectedCardId);
    if (source === undefined || source.length < decision.count)
      return fail(
        state,
        "INVALID_CARD_SELECTION",
        "The expired discard decision has no safe legal default.",
      );
    const candidates = [...source];
    const selected: CardInstanceId[] = [];
    while (selected.length < decision.count) {
      const [card] = candidates.splice(
        context.random.nextInt(candidates.length),
        1,
      );
      if (card === undefined) break;
      selected.push(card.instanceId);
    }
    const resolved = resolveCardDiscard(
      state,
      decision.playerId,
      selected,
      context.random,
      decision.decisionId,
      decision.completion.type === "RUN_AWAY"
        ? decision.completion.combatId
        : undefined,
      decision.completion.type === "RUN_AWAY"
        ? decision.completion.combatRevision
        : undefined,
      nowEpochMs,
    );
    return resolved.success
      ? succeed(resolved.state, [
          {
            type: "DECISION_AUTO_RESOLVED",
            visibility: "PUBLIC",
            decisionId: decision.decisionId,
            playerId: decision.playerId,
            decisionType: decision.type,
          },
          ...resolved.events,
        ])
      : resolved;
  }

  const curseResponse = state.curseResponse;
  if (
    curseResponse !== null &&
    curseResponse.expiresAtEpochMs > 0 &&
    curseResponse.expiresAtEpochMs <= nowEpochMs
  )
    return respondToCurse(
      state,
      curseResponse.targetPlayerId,
      {
        type: "RESPOND_TO_CURSE",
        actorId: curseResponse.targetPlayerId,
        responseId: curseResponse.responseId,
        response: { type: "DECLINE" },
      },
      context.random,
      nowEpochMs,
    );

  const combat = state.combat;
  const window = combat?.reactionWindow ?? null;
  if (
    combat !== null &&
    window !== null &&
    window.expiresAtEpochMs > 0 &&
    window.expiresAtEpochMs <= nowEpochMs
  ) {
    let working = state;
    const events: GameEvent[] = [];
    for (const playerId of window.eligiblePlayerIds) {
      if (working.combat === null) break;
      if (working.combat.reactionWindow?.confirmedPlayerIds.includes(playerId))
        continue;
      const passed = passCombatReaction(
        working,
        playerId,
        combat.combatId,
        combat.revision,
        window.windowId,
        context.random,
      );
      if (!passed.success)
        return fail(state, passed.error.code, passed.error.message);
      working = passed.state;
      events.push(...passed.events);
    }
    return succeed(working, events);
  }

  const offer = combat?.helpOffer ?? null;
  if (
    combat !== null &&
    offer !== null &&
    offer.expiresAtEpochMs > 0 &&
    offer.expiresAtEpochMs <= nowEpochMs
  ) {
    const actorId =
      offer.proposedBy === "ACTIVE" ? offer.helperId : combat.playerId;
    return succeed(
      {
        ...state,
        combat: { ...combat, revision: combat.revision + 1, helpOffer: null },
      },
      [
        {
          type: "HELP_OFFER_REJECTED",
          visibility: "PUBLIC",
          playerId: actorId,
          helperId: offer.helperId,
          offerId: offer.offerId,
        },
      ],
    );
  }
  return succeed(state, []);
}

export function processExpiredState(
  state: GameState,
  context: CommandContext,
): CommandResult {
  const nowEpochMs = contextNow(context);
  let working = state;
  const events: GameEvent[] = [];
  while (true) {
    const nextDeadline = getNextDeadlineEpochMs(working);
    if (nextDeadline === null || nextDeadline > nowEpochMs) break;
    const resolved = autoResolveOneExpiredState(working, context, nowEpochMs);
    if (!resolved.success)
      return fail(state, resolved.error.code, resolved.error.message);
    if (resolved.state === working && resolved.events.length === 0) break;
    working = resolved.state;
    events.push(...resolved.events);
  }
  return appendResultEvents(state, succeed(working, events));
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
          curseResponse: null,
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

  return appendResultEvents(state, result);
}
