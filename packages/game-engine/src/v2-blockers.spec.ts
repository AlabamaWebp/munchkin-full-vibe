import { describe, expect, it } from "vitest";
import {
  CardSetId,
  CardType,
  DeckType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import type { GameCommand } from "./commands.js";
import {
  CURSE_RESPONSE_TIMEOUT_MS,
  HELP_OFFER_TIMEOUT_MS,
  executeCommand,
  processExpiredState,
} from "./engine.js";
import {
  GamePhase,
  GameStatus,
  type CombatState,
  type GameState,
  type PlayerState,
} from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseCombatId,
  parseEncounterId,
  parseGameId,
  parseHelpOfferId,
  parsePendingDecisionId,
  parsePlayerId,
} from "./identifiers.js";

const heroId = parsePlayerId("hero");
const targetId = parsePlayerId("target");
const encounterId = parseEncounterId("encounter-1");
const combatA = parseCombatId("combat-a");
const combatB = parseCombatId("combat-b");

const random = { nextInt: () => 0 };

function definition(
  id: string,
  overrides: Partial<CardDefinition>,
): CardDefinition {
  return {
    id: parseCardDefinitionId(id),
    artKey: `test.${id}`,
    setId: CardSetId.CORE,
    tier: 1,
    name: id,
    description: id,
    type: CardType.UTILITY,
    deck: DeckType.TREASURE,
    tags: [],
    effects: [],
    ...overrides,
  };
}

function card(id: string, source: CardDefinition): CardInstance {
  return {
    instanceId: parseCardInstanceId(id),
    definitionId: source.id,
  };
}

function player(
  id: typeof heroId,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    id,
    name: id,
    sex: "MALE",
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
    ...overrides,
  };
}

function game(
  definitions: readonly CardDefinition[],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    schemaVersion: 5,
    config: { mode: "BALANCED", enabledSetIds: [CardSetId.CORE] },
    id: parseGameId("blockers"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.POST_DOOR,
    players: [player(heroId), player(targetId)],
    activePlayerId: heroId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: [],
    doorDiscard: [],
    treasureDiscard: [],
    combat: null,
    nextCombatSequence: 3,
    lastRunAwayResult: null,
    pendingDecision: null,
    curseResponse: null,
    nextCurseResponseSequence: 1,
    nextPendingDecisionSequence: 1,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
    ...overrides,
  };
}

const monsterDefinition = definition("monster", {
  type: CardType.MONSTER,
  deck: DeckType.DOOR,
  monster: {
    strength: 2,
    levelRewards: 1,
    treasureRewards: 0,
    badStuff: [],
  },
});
const bonusDefinition = definition("bonus", {
  type: CardType.TEMPORARY_BONUS,
  effects: [{ type: "COMBAT_BONUS", amount: 2 }],
});
const monsterCard = card("monster-card", monsterDefinition);
const bonusCard = card("bonus-card", bonusDefinition);

function combat(combatId = combatB, revision = 4): CombatState {
  return {
    combatId,
    playerId: heroId,
    revision,
    monsters: [
      {
        encounterId,
        monster: monsterCard,
        sourceCard: monsterCard,
        clonedFromEncounterId: null,
        baseStrength: 2,
        baseLevelRewards: 1,
        baseTreasureRewards: 0,
        tier: 1,
        tags: [],
        badStuff: [],
        strengthModifier: 0,
        treasureModifier: 0,
        playedCards: [],
      },
    ],
    nextEncounterSequence: 2,
    nextHelpOfferSequence: 1,
    nextReactionWindowSequence: 2,
    reactionWindow: null,
    helpOffer: null,
    helpAgreement: null,
    history: [],
    runAway: null,
  };
}

describe("V2 blocker regressions", () => {
  it.each([
    {
      name: "combat card from combat A",
      command: {
        type: "PLAY_CARD",
        actorId: targetId,
        cardId: bonusCard.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: combatA,
        combatRevision: 4,
      } satisfies GameCommand,
    },
    {
      name: "stale mutable revision",
      command: {
        type: "PLAY_CARD",
        actorId: targetId,
        cardId: bonusCard.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: combatB,
        combatRevision: 3,
      } satisfies GameCommand,
    },
    {
      name: "stale help",
      command: {
        type: "PROPOSE_HELP",
        actorId: heroId,
        helperId: targetId,
        treasureCount: 0,
        combatId: combatA,
        combatRevision: 4,
      } satisfies GameCommand,
    },
    {
      name: "stale help revision",
      command: {
        type: "PROPOSE_HELP",
        actorId: heroId,
        helperId: targetId,
        treasureCount: 0,
        combatId: combatB,
        combatRevision: 3,
      } satisfies GameCommand,
    },
    {
      name: "stale reaction",
      command: {
        type: "PASS_COMBAT_REACTION",
        actorId: targetId,
        reactionWindowId: 1,
        combatId: combatA,
        combatRevision: 4,
      } satisfies GameCommand,
    },
    {
      name: "stale reaction revision",
      command: {
        type: "PASS_COMBAT_REACTION",
        actorId: targetId,
        reactionWindowId: 1,
        combatId: combatB,
        combatRevision: 3,
      } satisfies GameCommand,
    },
    {
      name: "stale run away",
      command: {
        type: "RUN_AWAY",
        actorId: heroId,
        combatId: combatA,
        combatRevision: 4,
      } satisfies GameCommand,
    },
    {
      name: "stale run-away revision",
      command: {
        type: "RUN_AWAY",
        actorId: heroId,
        combatId: combatB,
        combatRevision: 3,
      } satisfies GameCommand,
    },
  ])("rejects $name with zero mutation and zero events", ({ command }) => {
    const original = game([monsterDefinition, bonusDefinition], {
      phase: GamePhase.DOOR_RESOLUTION,
      combat: combat(),
      players: [player(heroId), player(targetId, { hand: [bonusCard] })],
    });
    const result = executeCommand(original, command, {
      random,
      clock: { now: () => 1_000 },
    });
    expect(result).toMatchObject({
      success: false,
      state: original,
      events: [],
      error: { code: "STALE_COMBAT_STATE" },
    });
    expect(result.state).toBe(original);
    expect(result.state.eventLog).toHaveLength(0);
  });

  it("uses absolute reaction deadlines and expires them authoritatively once", () => {
    let now = 1_000;
    const original = game([monsterDefinition], {
      phase: GamePhase.DOOR_RESOLUTION,
      players: [player(heroId, { level: 5 }), player(targetId)],
      combat: {
        ...combat(),
        reactionWindow: {
          windowId: 1,
          declaredAtRevision: 4,
          claimantId: heroId,
          confirmedPlayerIds: [heroId],
          eligiblePlayerIds: [heroId, targetId],
          expiresAtEpochMs: 2_000,
        },
      },
    });
    const context = { random, clock: { now: () => now } };
    const before = processExpiredState(original, context);
    expect(before.state).toBe(original);
    expect(before.events).toEqual([]);
    now = 2_000;
    const expired = processExpiredState(original, context);
    expect(expired.success).toBe(true);
    expect(expired.state.combat).toBeNull();
    expect(expired.events).toContainEqual(
      expect.objectContaining({
        type: "COMBAT_REACTION_PASSED",
        playerId: targetId,
      }),
    );
    const repeated = processExpiredState(expired.state, context);
    expect(repeated.state).toBe(expired.state);
    expect(repeated.events).toEqual([]);
  });

  it("expires pending choices and help offers with deterministic safe defaults", () => {
    const curse = definition("choice-curse", {
      type: CardType.CURSE,
      deck: DeckType.DOOR,
      effects: [],
    });
    const curseCard = card("choice-curse-card", curse);
    const handCard = card("choice", bonusDefinition);
    const pending = game([curse, bonusDefinition], {
      players: [player(heroId, { hand: [handCard] }), player(targetId)],
      pendingDecision: {
        decisionId: parsePendingDecisionId("decision-1"),
        createdAtEpochMs: 1_000,
        expiresAtEpochMs: 2_000,
        type: "DISCARD_CARDS",
        playerId: heroId,
        zone: "HAND",
        count: 1,
        sourceCardId: curseCard.instanceId,
        sourceDefinitionId: curse.id,
        remainingEffects: [],
        completion: {
          type: "CURSE",
          card: curseCard,
          targetPlayerId: heroId,
          phaseAfterResolution: null,
        },
      },
    });
    const resolved = processExpiredState(pending, {
      random,
      clock: { now: () => 2_000 },
    });
    expect(resolved.state.pendingDecision).toBeNull();
    expect(resolved.state.players[0]?.hand).toEqual([]);
    expect(resolved.events[0]).toMatchObject({
      type: "DECISION_AUTO_RESOLVED",
    });

    const withOffer = game([monsterDefinition], {
      phase: GamePhase.DOOR_RESOLUTION,
      combat: {
        ...combat(),
        helpOffer: {
          offerId: parseHelpOfferId("offer-1"),
          helperId: targetId,
          proposedBy: "ACTIVE",
          treasureCount: 0,
          expiresAtEpochMs: 2_000,
        },
      },
    });
    expect(
      processExpiredState(withOffer, { random, clock: { now: () => 1_999 } })
        .state,
    ).toBe(withOffer);
    const rejected = processExpiredState(withOffer, {
      random,
      clock: { now: () => 2_000 },
    });
    expect(rejected.state.combat?.helpOffer).toBeNull();
    expect(rejected.events).toContainEqual(
      expect.objectContaining({ type: "HELP_OFFER_REJECTED" }),
    );
  });

  it("resolves a Curse immediately when no defense exists", () => {
    const curse = definition("level-curse", {
      type: CardType.CURSE,
      deck: DeckType.DOOR,
      effects: [{ type: "LOSE_LEVEL", amount: 1 }],
    });
    const curseCard = card("level-curse-card", curse);
    const original = game([curse], {
      players: [
        player(heroId, { hand: [curseCard] }),
        player(targetId, { level: 3 }),
      ],
    });
    const result = executeCommand(
      original,
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: curseCard.instanceId,
        target: { type: "PLAYER", playerId: targetId },
      },
      { random, clock: { now: () => 1_000 } },
    );
    expect(result.success).toBe(true);
    expect(result.state.curseResponse).toBeNull();
    expect(result.state.players[1]?.level).toBe(2);
  });

  it("allows only the target to decline or cancel a Curse and hides no-op failures", () => {
    const curse = definition("cancelled-curse", {
      type: CardType.CURSE,
      deck: DeckType.DOOR,
      effects: [{ type: "LOSE_LEVEL", amount: 1 }],
    });
    const cancel = definition("cancel", {
      curseProtection: { mode: "CANCEL" },
    });
    const curseCard = card("cancelled-curse-card", curse);
    const cancelCard = card("cancel-card", cancel);
    const offered = executeCommand(
      game([curse, cancel], {
        players: [
          player(heroId, { hand: [curseCard] }),
          player(targetId, { level: 3, hand: [cancelCard] }),
        ],
      }),
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: curseCard.instanceId,
        target: { type: "PLAYER", playerId: targetId },
      },
      { random, clock: { now: () => 1_000 } },
    );
    expect(offered.success).toBe(true);
    const response = offered.state.curseResponse!;
    expect(response.expiresAtEpochMs).toBe(1_000 + CURSE_RESPONSE_TIMEOUT_MS);
    const foreign = executeCommand(
      offered.state,
      {
        type: "RESPOND_TO_CURSE",
        actorId: heroId,
        responseId: response.responseId,
        response: { type: "DECLINE" },
      },
      { random, clock: { now: () => 1_001 } },
    );
    expect(foreign.success).toBe(false);
    expect(foreign.state).toBe(offered.state);
    expect(foreign.events).toEqual([]);
    const cancelled = executeCommand(
      offered.state,
      {
        type: "RESPOND_TO_CURSE",
        actorId: targetId,
        responseId: response.responseId,
        response: { type: "USE_PROTECTION", cardId: cancelCard.instanceId },
      },
      { random, clock: { now: () => 1_002 } },
    );
    expect(cancelled.success).toBe(true);
    expect(cancelled.state.curseResponse).toBeNull();
    expect(cancelled.state.players[1]?.level).toBe(3);
    expect(cancelled.events).toContainEqual(
      expect.objectContaining({
        type: "CURSE_PROTECTION_USED",
        visibility: "PRIVATE",
      }),
    );
  });

  it("protects exactly one valid affected Item and rejects invalid choices", () => {
    const curse = definition("item-curse", {
      type: CardType.CURSE,
      deck: DeckType.DOOR,
      effects: [{ type: "DISCARD_RANDOM_CARDS", zone: "EQUIPMENT", count: 1 }],
    });
    const guard = definition("guard", {
      curseProtection: { mode: "PROTECT_ONE_ITEM" },
    });
    const item = definition("item", {
      type: CardType.EQUIPMENT,
      equipment: { slot: EquipmentSlot.HEAD, combatBonus: 1 },
    });
    const curseCard = card("item-curse-card", curse);
    const guardCard = card("guard-card", guard);
    const protectedItem = card("protected-item", item);
    const otherItem = card("other-item", item);
    const offered = executeCommand(
      game([curse, guard, item], {
        players: [
          player(heroId, { hand: [curseCard] }),
          player(targetId, {
            hand: [guardCard],
            equipment: [protectedItem, otherItem],
          }),
        ],
      }),
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: curseCard.instanceId,
        target: { type: "PLAYER", playerId: targetId },
      },
      { random, clock: { now: () => 1_000 } },
    );
    const response = offered.state.curseResponse!;
    const invalid = executeCommand(
      offered.state,
      {
        type: "RESPOND_TO_CURSE",
        actorId: targetId,
        responseId: response.responseId,
        response: {
          type: "USE_PROTECTION",
          cardId: guardCard.instanceId,
          protectedCardId: parseCardInstanceId("not-equipped"),
        },
      },
      { random, clock: { now: () => 1_001 } },
    );
    expect(invalid.success).toBe(false);
    expect(invalid.state).toBe(offered.state);
    expect(invalid.events).toEqual([]);
    const protectedResult = executeCommand(
      offered.state,
      {
        type: "RESPOND_TO_CURSE",
        actorId: targetId,
        responseId: response.responseId,
        response: {
          type: "USE_PROTECTION",
          cardId: guardCard.instanceId,
          protectedCardId: protectedItem.instanceId,
        },
      },
      { random, clock: { now: () => 1_002 } },
    );
    expect(protectedResult.success).toBe(true);
    expect(protectedResult.state.players[1]?.equipment).toEqual([
      protectedItem,
    ]);
  });

  it("defaults an unanswered Curse response to DECLINE at its deadline", () => {
    const curse = definition("timed-curse", {
      type: CardType.CURSE,
      deck: DeckType.DOOR,
      effects: [{ type: "LOSE_LEVEL", amount: 1 }],
    });
    const cancel = definition("timed-cancel", {
      curseProtection: { mode: "CANCEL" },
    });
    const curseCard = card("timed-curse-card", curse);
    const cancelCard = card("timed-cancel-card", cancel);
    const offered = executeCommand(
      game([curse, cancel], {
        players: [
          player(heroId, { hand: [curseCard] }),
          player(targetId, { level: 3, hand: [cancelCard] }),
        ],
      }),
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: curseCard.instanceId,
        target: { type: "PLAYER", playerId: targetId },
      },
      { random, clock: { now: () => 1_000 } },
    );
    const before = processExpiredState(offered.state, {
      random,
      clock: { now: () => 1_000 + CURSE_RESPONSE_TIMEOUT_MS - 1 },
    });
    expect(before.state).toBe(offered.state);
    const expired = processExpiredState(offered.state, {
      random,
      clock: { now: () => 1_000 + CURSE_RESPONSE_TIMEOUT_MS },
    });
    expect(expired.state.curseResponse).toBeNull();
    expect(expired.state.players[1]?.level).toBe(2);
    expect(expired.events).toContainEqual(
      expect.objectContaining({
        type: "CURSE_RESPONSE_RESOLVED",
        outcome: "DECLINED",
      }),
    );
  });

  it("assigns an absolute help deadline from the injected clock", () => {
    const original = game([monsterDefinition], {
      phase: GamePhase.DOOR_RESOLUTION,
      combat: combat(),
    });
    const offered = executeCommand(
      original,
      {
        type: "PROPOSE_HELP",
        actorId: heroId,
        helperId: targetId,
        treasureCount: 0,
        combatId: combatB,
        combatRevision: 4,
      },
      { random, clock: { now: () => 5_000 } },
    );
    expect(offered.success).toBe(true);
    expect(offered.state.combat?.helpOffer?.expiresAtEpochMs).toBe(
      5_000 + HELP_OFFER_TIMEOUT_MS,
    );
  });
});
