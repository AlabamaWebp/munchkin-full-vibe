import {
  GamePhase,
  GameStatus,
  CardSetId,
  CardType,
  DeckType,
  parseCombatId,
  parseCardDefinitionId,
  parseCardInstanceId,
  parseEncounterId,
  type CardDefinition,
  type CardInstance,
  type CombatMonsterState,
  type GameState,
  type MonsterTag,
} from '@munchkin-lan/game-engine';

export const DEVELOPMENT_SCENARIOS = [
  'discard',
  'equipment',
  'multi-monster',
  'reaction',
  'curse-response',
  'ability-turn',
  'ability-combat',
  'winning-combat',
  'successful-run-away',
  'finished',
] as const;

export type DevelopmentScenario = (typeof DEVELOPMENT_SCENARIOS)[number];

function definition(state: GameState, id: string): CardDefinition {
  const result = state.cardDefinitions.find((candidate) => candidate.id === id);
  if (result === undefined)
    throw new Error(`QA scenario card definition is unavailable: ${id}`);
  return result;
}

function card(state: GameState, definitionId: string): CardInstance {
  const cards = [
    ...state.doorDeck,
    ...state.treasureDeck,
    ...state.players.flatMap((player) => [
      ...player.hand,
      ...player.equipment,
      ...player.classCards,
      ...player.raceCards,
      ...player.rolePermissionCards,
      ...player.equipmentAttachments.map((attachment) => attachment.card),
    ]),
  ];
  const result = cards.find(
    (candidate) => candidate.definitionId === definitionId,
  );
  if (result === undefined)
    throw new Error(
      `QA scenario card instance is unavailable: ${definitionId}`,
    );
  return result;
}

function qaCard(definitionId: string, instanceId: string): CardInstance {
  return {
    instanceId: parseCardInstanceId(instanceId),
    definitionId: parseCardDefinitionId(definitionId),
  };
}

function withDefinitions(
  state: GameState,
  additions: readonly CardDefinition[],
): GameState {
  return {
    ...state,
    cardDefinitions: [...state.cardDefinitions, ...additions],
  };
}

function cleanPlayers(
  state: GameState,
  hands: readonly (readonly CardInstance[])[],
) {
  return state.players.map((player, index) => ({
    ...player,
    level: 1,
    hand: hands[index] ?? [],
    equipment: [],
    equipmentAttachments: [],
    classCards: [],
    raceCards: [],
    rolePermissionCards: [],
    hirelingCard: null,
    mountCard: null,
    isDead: false,
    activeEffects: [],
    abilityUsages: [],
  }));
}

function monster(
  state: GameState,
  encounterId: string,
  monsterCard: CardInstance,
): CombatMonsterState {
  const cardDefinition = definition(state, monsterCard.definitionId);
  if (cardDefinition.monster === undefined)
    throw new Error('QA scenario requires a Monster card.');
  return {
    encounterId: parseEncounterId(encounterId),
    monster: monsterCard,
    sourceCard: monsterCard,
    clonedFromEncounterId: null,
    baseStrength: cardDefinition.monster.strength,
    baseLevelRewards: cardDefinition.monster.levelRewards,
    baseTreasureRewards: cardDefinition.monster.treasureRewards,
    tier: cardDefinition.tier,
    tags: cardDefinition.tags.filter((tag): tag is MonsterTag =>
      ['BEAST', 'UNDEAD', 'ARCANE', 'CONSTRUCT'].includes(tag),
    ),
    badStuff: cardDefinition.monster.badStuff,
    strengthModifier: 0,
    treasureModifier: 0,
    playedCards: [],
  };
}

function withCardsRemoved(
  state: GameState,
  used: readonly CardInstance[],
): GameState {
  const ids = new Set(used.map((candidate) => candidate.instanceId));
  return {
    ...state,
    doorDeck: state.doorDeck.filter(
      (candidate) => !ids.has(candidate.instanceId),
    ),
    treasureDeck: state.treasureDeck.filter(
      (candidate) => !ids.has(candidate.instanceId),
    ),
  };
}

export function createDevelopmentScenario(
  initial: GameState,
  scenario: DevelopmentScenario,
): GameState {
  const active = initial.players[0];
  if (active === undefined)
    throw new Error('Start a room before loading a QA scenario.');
  const helper = initial.players[1] ?? active;
  const third = initial.players[2] ?? helper;
  const now = Date.now();

  if (scenario === 'discard') {
    const source = card(initial, 'corridor-crab');
    const candidates = [
      card(initial, 'emergency-confetti'),
      card(initial, 'bottled-applause'),
    ];
    const state = withCardsRemoved(initial, [source, ...candidates]);
    return {
      ...state,
      phase: GamePhase.POST_DOOR,
      activePlayerId: active.id,
      players: cleanPlayers(state, [candidates]),
      pendingDecision: {
        decisionId: 'qa-discard' as never,
        type: 'DISCARD_CARDS',
        playerId: active.id,
        zone: 'HAND',
        count: 1,
        sourceCardId: source.instanceId,
        sourceDefinitionId: source.definitionId,
        remainingEffects: [],
        completion: {
          type: 'CURSE',
          card: source,
          targetPlayerId: active.id,
          phaseAfterResolution: 'POST_DOOR',
        },
        createdAtEpochMs: now,
        expiresAtEpochMs: now + 60_000,
      },
      curseResponse: null,
      combat: null,
      lastRunAwayResult: null,
    };
  }

  if (scenario === 'equipment') {
    const weapon = card(initial, 'cometglass-sabre');
    const attachment = card(initial, 'moonsteel-edge');
    const passive = card(initial, 'beast-hunters-vest');
    const state = withCardsRemoved(initial, [weapon, attachment, passive]);
    return {
      ...state,
      phase: GamePhase.POST_DOOR,
      activePlayerId: active.id,
      players: cleanPlayers(state, [[]]).map((player, index) =>
        index === 0
          ? {
              ...player,
              equipment: [weapon, passive],
              equipmentAttachments: [
                { card: attachment, attachedToCardId: weapon.instanceId },
              ],
            }
          : player,
      ),
      pendingDecision: null,
      curseResponse: null,
      combat: null,
      lastRunAwayResult: null,
    };
  }

  if (scenario === 'curse-response') {
    const curse = card(initial, 'curse-echoing-doubt');
    const ward = qaCard('qa-curse-ward', 'qa-curse-ward-1');
    const state = withDefinitions(withCardsRemoved(initial, [curse]), [
      {
        id: parseCardDefinitionId('qa-curse-ward'),
        artKey: 'qa.curse-ward',
        setId: CardSetId.CORE,
        tier: 1,
        name: 'QA Ward',
        description: 'Development-only Curse response card.',
        type: CardType.UTILITY,
        deck: DeckType.TREASURE,
        tags: [],
        effects: [],
        curseProtection: { mode: 'CANCEL' },
      },
    ]);
    return {
      ...state,
      phase: GamePhase.POST_DOOR,
      activePlayerId: active.id,
      players: cleanPlayers(state, [[ward]]),
      combat: null,
      pendingDecision: null,
      curseResponse: {
        responseId: 'qa-curse-response' as never,
        targetPlayerId: active.id,
        sourcePlayerId: helper.id,
        curseCard: curse,
        remainingEffects: definition(initial, curse.definitionId).effects,
        phaseAfterResolution: 'POST_DOOR',
        cancelCardIds: [ward.instanceId],
        itemGuardCardIds: [],
        protectableItemIds: [],
        createdAtEpochMs: now,
        expiresAtEpochMs: now + 60_000,
      },
      lastRunAwayResult: null,
    };
  }

  if (scenario === 'ability-turn') {
    const role = qaCard('guild-of-echoes', 'qa-guild-of-echoes');
    const costs = [
      qaCard('emergency-confetti', 'qa-ability-cost-1'),
      qaCard('bottled-applause', 'qa-ability-cost-2'),
    ];
    const state = initial;
    return {
      ...state,
      phase: GamePhase.POST_DOOR,
      activePlayerId: active.id,
      players: cleanPlayers(
        state,
        state.players.map(() => costs),
      ).map((player) => ({ ...player, classCards: [role] })),
      combat: null,
      pendingDecision: null,
      curseResponse: null,
      lastRunAwayResult: null,
    };
  }

  if (scenario === 'finished') {
    const state = { ...initial, players: cleanPlayers(initial, []) };
    return {
      ...state,
      status: GameStatus.FINISHED,
      phase: GamePhase.FINISHED,
      activePlayerId: active.id,
      winnerId: active.id,
      players: state.players.map((player, index) => ({
        ...player,
        level: index === 0 ? 10 : 6,
      })),
      combat: null,
      pendingDecision: null,
      curseResponse: null,
      lastRunAwayResult: null,
    };
  }

  const firstMonster = card(initial, 'dust-bunny-brigade');
  const secondMonster = card(initial, 'paper-mimic');
  const playerBonus = card(initial, 'bottled-applause');
  const monsterBonus = card(initial, 'strategic-banana-peel');
  const state = withCardsRemoved(initial, [
    firstMonster,
    secondMonster,
    playerBonus,
    monsterBonus,
  ]);
  const combat = {
    combatId: parseCombatId('qa-combat'),
    playerId: active.id,
    revision: 1,
    monsters: [
      monster(state, 'qa-encounter-1', firstMonster),
      monster(state, 'qa-encounter-2', secondMonster),
    ],
    nextEncounterSequence: 3,
    nextHelpOfferSequence: 1,
    nextReactionWindowSequence: 2,
    reactionWindow: null,
    helpOffer: null,
    helpAgreement: null,
    history: [],
    runAway: null,
  };
  if (scenario === 'successful-run-away') {
    return {
      ...state,
      phase: GamePhase.END_TURN,
      activePlayerId: active.id,
      players: cleanPlayers(state, []),
      combat: null,
      pendingDecision: null,
      curseResponse: null,
      lastRunAwayResult: {
        playerId: active.id,
        attempts: [
          {
            encounterId: parseEncounterId('qa-encounter-1'),
            monsterCardId: firstMonster.instanceId,
            monsterDefinitionId: firstMonster.definitionId,
            combatantId: active.id,
            roll: 5,
            outcome: 'ESCAPED',
            badStuffApplied: false,
          },
          {
            encounterId: parseEncounterId('qa-encounter-1'),
            monsterCardId: firstMonster.instanceId,
            monsterDefinitionId: firstMonster.definitionId,
            combatantId: helper.id,
            roll: 6,
            outcome: 'ESCAPED',
            badStuffApplied: false,
          },
        ],
      },
    };
  }
  if (scenario === 'reaction') {
    return {
      ...state,
      phase: GamePhase.DOOR_RESOLUTION,
      activePlayerId: active.id,
      players: cleanPlayers(state, [[], [monsterBonus], []]),
      combat: {
        ...combat,
        monsters: [monster(state, 'qa-encounter-1', firstMonster)],
        reactionWindow: {
          windowId: 1,
          declaredAtRevision: 1,
          claimantId: active.id,
          confirmedPlayerIds: [],
          eligiblePlayerIds: [active.id, helper.id, third.id],
          expiresAtEpochMs: now + 20_000,
        },
      },
      pendingDecision: null,
      curseResponse: null,
      lastRunAwayResult: null,
    };
  }
  if (scenario === 'ability-combat') {
    const role = qaCard('scrap-knights', 'qa-scrap-knights');
    return {
      ...state,
      phase: GamePhase.DOOR_RESOLUTION,
      activePlayerId: active.id,
      players: cleanPlayers(state, [[playerBonus]]).map((player, index) =>
        index === 0 ? { ...player, classCards: [role] } : player,
      ),
      combat,
      pendingDecision: null,
      curseResponse: null,
      lastRunAwayResult: null,
    };
  }
  if (scenario === 'winning-combat') {
    return {
      ...state,
      phase: GamePhase.DOOR_RESOLUTION,
      activePlayerId: active.id,
      players: cleanPlayers(state, []).map((player, index) => ({
        ...player,
        level: index === 0 ? 9 : 1,
      })),
      combat: {
        ...combat,
        monsters: [monster(state, 'qa-encounter-1', firstMonster)],
      },
      pendingDecision: null,
      curseResponse: null,
      lastRunAwayResult: null,
    };
  }
  return {
    ...state,
    phase: GamePhase.DOOR_RESOLUTION,
    activePlayerId: active.id,
    players: cleanPlayers(state, [[playerBonus, monsterBonus], [], []]),
    combat,
    pendingDecision: null,
    curseResponse: null,
    lastRunAwayResult: null,
  };
}
