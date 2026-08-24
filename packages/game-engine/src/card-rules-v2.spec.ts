import { describe, expect, it } from "vitest";
import {
  CardSetId,
  GameMode,
  GamePhase,
  GameStatus,
  calculateMonsterPower,
  combatPowerBreakdown,
  createDevelopmentCardSet,
  createGame,
  executeCommand,
  parseCardInstanceId,
  parseCombatId,
  parseEncounterId,
  parseGameId,
  parsePlayerId,
  type CardInstance,
  type GameState,
  type PlayerState,
  type RandomSource,
  validateProductionCardDefinitions,
} from "./index.js";

const random: RandomSource = { nextInt: () => 2 };
const heroId = parsePlayerId("hero");
const rivalId = parsePlayerId("rival");
const encounterId = parseEncounterId("encounter-v2-rules");

function card(definitionId: string, suffix: string): CardInstance {
  return {
    instanceId: parseCardInstanceId(`${definitionId}-${suffix}`),
    definitionId: definitionId as CardInstance["definitionId"],
  };
}

function player(
  id: typeof heroId,
  hand: readonly CardInstance[] = [],
  roles: {
    classes?: readonly CardInstance[];
    races?: readonly CardInstance[];
  } = {},
): PlayerState {
  return {
    id,
    name: id,
    sex: "MALE",
    level: 1,
    hand,
    equipment: [],
    equipmentAttachments: [],
    classCards: roles.classes ?? [],
    raceCards: roles.races ?? [],
    rolePermissionCards: [],
    hirelingCard: null,
    mountCard: null,
    isDead: false,
    activeEffects: [],
    abilityUsages: [],
  };
}

function stateWith(
  players: readonly PlayerState[],
  monsterStrength = 8,
): GameState {
  const base = createGame({
    id: parseGameId("card-rules-v2"),
    config: {
      mode: GameMode.CLASSIC_CHAOS,
      enabledSetIds: Object.values(CardSetId),
    },
  });
  const monster = card("map-eater", "combat");
  return {
    ...base,
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.DOOR_RESOLUTION,
    turnNumber: 1,
    players,
    activePlayerId: players[0]!.id,
    combat: {
      combatId: parseCombatId("combat-v2-rules"),
      playerId: players[0]!.id,
      revision: 3,
      monsters: [
        {
          encounterId,
          monster,
          sourceCard: monster,
          clonedFromEncounterId: null,
          baseStrength: monsterStrength,
          baseLevelRewards: 1,
          baseTreasureRewards: 2,
          tier: 2,
          tags: ["BEAST"],
          badStuff: [],
          strengthModifier: 0,
          treasureModifier: 0,
          playedCards: [],
        },
      ],
      nextEncounterSequence: 2,
      nextHelpOfferSequence: 1,
      nextReactionWindowSequence: 1,
      reactionWindow: null,
      helpOffer: null,
      helpAgreement: null,
      history: [
        {
          type: "COMBAT_STARTED",
          playerId: players[0]!.id,
          encounterId,
          monsterDefinitionId: monster.definitionId,
        },
      ],
      runAway: null,
    },
  };
}

describe("V2 authored combat-side boosts", () => {
  it("applies the same authored one-shot to players or one exact encounter", () => {
    const boost = card("bottled-applause", "side-neutral");
    const base = stateWith([player(heroId, [boost])]);
    const players = executeCommand(
      base,
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: boost.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: base.combat!.combatId,
        combatRevision: base.combat!.revision,
      },
      { random },
    );
    expect(players.success).toBe(true);
    if (!players.success) return;
    expect(players.state.players[0]?.activeEffects).toContainEqual(
      expect.objectContaining({
        amount: 3,
        sourceDefinitionId: boost.definitionId,
      }),
    );
    expect(players.state.combat?.history.at(-1)).toMatchObject({
      type: "CARD_PLAYED",
      side: "PLAYERS",
    });

    const monsters = executeCommand(
      base,
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: boost.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        combatId: base.combat!.combatId,
        combatRevision: base.combat!.revision,
      },
      { random },
    );
    expect(monsters.success).toBe(true);
    if (!monsters.success) return;
    expect(calculateMonsterPower(monsters.state)).toBe(11);
    expect(monsters.state.combat?.monsters[0]?.playedCards[0]).toMatchObject({
      card: boost,
      strengthModifier: 3,
      purpose: "MODIFIER",
    });
    expect(monsters.state.combat?.history.at(-1)).toMatchObject({
      type: "CARD_PLAYED",
      side: "MONSTER",
      encounterId,
    });
  });

  it("keeps one-sided cards illegal on the other side and stale commands atomic", () => {
    const oneSided = card("emergency-confetti", "players-only");
    const state = stateWith([player(heroId, [oneSided])]);
    const wrongSide = executeCommand(
      state,
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: oneSided.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        combatId: state.combat!.combatId,
        combatRevision: state.combat!.revision,
      },
      { random },
    );
    expect(wrongSide).toMatchObject({ success: false, state });

    const stale = executeCommand(
      state,
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: oneSided.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: state.combat!.combatId,
        combatRevision: state.combat!.revision - 1,
      },
      { random },
    );
    expect(stale).toMatchObject({
      success: false,
      state,
      events: [],
      error: { code: "STALE_COMBAT_STATE" },
    });
  });
});

describe("V2 reusable role abilities", () => {
  it("spends exact hand costs for a once-per-combat power intervention", () => {
    const role = card("scrap-knights", "role");
    const firstCost = card("door-cache", "cost-one");
    const secondCost = card("treasure-rumor", "cost-two");
    const state = stateWith([
      player(heroId, [firstCost, secondCost], { classes: [role] }),
    ]);
    const used = executeCommand(
      state,
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: role.instanceId,
        costCardIds: [firstCost.instanceId],
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: state.combat!.combatId,
        combatRevision: state.combat!.revision,
      },
      { random },
    );
    expect(used.success).toBe(true);
    if (!used.success) return;
    expect(used.state.players[0]?.hand).toEqual([secondCost]);
    expect(used.state.doorDiscard).toContainEqual(firstCost);
    expect(used.state.players[0]?.abilityUsages).toHaveLength(1);
    expect(combatPowerBreakdown(used.state, heroId)).toContainEqual({
      source: "ACTIVE_EFFECT",
      sourceDefinitionId: role.definitionId,
      amount: 3,
    });
    expect(used.state.combat?.history.at(-1)).toMatchObject({
      type: "ROLE_ABILITY_USED",
      roleDefinitionId: role.definitionId,
      amount: 3,
    });

    const repeated = executeCommand(
      used.state,
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: role.instanceId,
        costCardIds: [secondCost.instanceId],
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: used.state.combat!.combatId,
        combatRevision: used.state.combat!.revision,
      },
      { random },
    );
    expect(repeated).toMatchObject({ success: false, state: used.state });
  });

  it("rejects invalid costs and stale role interventions without spending cards", () => {
    const role = card("lantern-wardens", "role");
    const cost = card("door-cache", "only-cost");
    const state = stateWith([player(heroId, [cost], { classes: [role] })]);
    const insufficient = executeCommand(
      state,
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: role.instanceId,
        costCardIds: [cost.instanceId],
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: state.combat!.combatId,
        combatRevision: state.combat!.revision,
      },
      { random },
    );
    expect(insufficient).toMatchObject({ success: false, state });

    const stale = executeCommand(
      stateWith([
        player(heroId, [cost, card("treasure-rumor", "extra")], {
          classes: [role],
        }),
      ]),
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: role.instanceId,
        costCardIds: [
          cost.instanceId,
          parseCardInstanceId("treasure-rumor-extra"),
        ],
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: state.combat!.combatId,
        combatRevision: 2,
      },
      { random },
    );
    expect(stale).toMatchObject({
      success: false,
      events: [],
      error: { code: "STALE_COMBAT_STATE" },
    });

    const reactionState = stateWith([
      player(heroId, [cost, card("treasure-rumor", "reaction-extra")], {
        classes: [role],
      }),
    ]);
    const withReaction: GameState = {
      ...reactionState,
      combat: {
        ...reactionState.combat!,
        reactionWindow: {
          windowId: 7,
          declaredAtRevision: reactionState.combat!.revision,
          claimantId: heroId,
          confirmedPlayerIds: [],
          eligiblePlayerIds: [heroId],
          expiresAtEpochMs: 20_000,
        },
      },
    };
    const staleReaction = executeCommand(
      withReaction,
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: role.instanceId,
        costCardIds: withReaction.players[0]!.hand.map(
          (value) => value.instanceId,
        ),
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: withReaction.combat!.combatId,
        combatRevision: withReaction.combat!.revision,
        reactionWindowId: 6,
      },
      { random },
    );
    expect(staleReaction).toMatchObject({
      success: false,
      state: withReaction,
      events: [],
      error: { code: "STALE_COMBAT_REACTION" },
    });
  });

  it("uses the reusable escape bonus in the deterministic Run Away roll", () => {
    const role = card("cartographers-circle", "role");
    const cost = card("door-cache", "escape-cost");
    const state = stateWith([player(heroId, [cost], { classes: [role] })], 20);
    const prepared = executeCommand(
      state,
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: role.instanceId,
        costCardIds: [cost.instanceId],
        target: { type: "SELF" },
        combatId: state.combat!.combatId,
        combatRevision: state.combat!.revision,
      },
      { random },
    );
    expect(prepared.success).toBe(true);
    if (!prepared.success) return;
    expect(prepared.state.players[0]?.activeEffects).toContainEqual(
      expect.objectContaining({ type: "RUN_AWAY_ROLL", amount: 2 }),
    );
    const escaped = executeCommand(
      prepared.state,
      {
        type: "RUN_AWAY",
        actorId: heroId,
        combatId: prepared.state.combat!.combatId,
        combatRevision: prepared.state.combat!.revision,
      },
      { random },
    );
    expect(escaped.success).toBe(true);
    if (!escaped.success) return;
    expect(escaped.state.lastRunAwayResult?.attempts[0]).toMatchObject({
      roll: 3,
      outcome: "ESCAPED",
    });

    const outsiderState = stateWith([
      player(heroId),
      player(rivalId, [cost], { classes: [role] }),
    ]);
    const outsider = executeCommand(
      outsiderState,
      {
        type: "USE_ROLE_ABILITY",
        actorId: rivalId,
        roleCardId: role.instanceId,
        costCardIds: [cost.instanceId],
        target: { type: "SELF" },
        combatId: outsiderState.combat!.combatId,
        combatRevision: outsiderState.combat!.revision,
      },
      { random },
    );
    expect(outsider).toMatchObject({
      success: false,
      state: outsiderState,
      error: { code: "INVALID_TARGET" },
    });
  });

  it("cycles authored cards once per turn and allows typed risky interference", () => {
    const drawRole = card("guild-of-echoes", "role");
    const costs = [
      card("door-cache", "cycle-a"),
      card("treasure-rumor", "cycle-b"),
    ];
    const combatState = stateWith([
      player(heroId, costs, { classes: [drawRole] }),
    ]);
    const turnState = {
      ...combatState,
      phase: GamePhase.TURN_START,
      combat: null,
    };
    const cycled = executeCommand(
      turnState,
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: drawRole.instanceId,
        costCardIds: costs.map((value) => value.instanceId),
        target: { type: "SELF" },
      },
      { random },
    );
    expect(cycled.success).toBe(true);
    if (!cycled.success) return;
    expect(cycled.state.players[0]?.hand).toHaveLength(2);
    expect(cycled.state.players[0]?.abilityUsages).toContainEqual(
      expect.objectContaining({ scope: { type: "TURN", turnNumber: 1 } }),
    );

    const exhaustedState = {
      ...turnState,
      treasureDeck: [],
      treasureDiscard: [],
    };
    const exhausted = executeCommand(
      exhaustedState,
      {
        type: "USE_ROLE_ABILITY",
        actorId: heroId,
        roleCardId: drawRole.instanceId,
        costCardIds: costs.map((value) => value.instanceId),
        target: { type: "SELF" },
      },
      { random },
    );
    expect(exhausted).toMatchObject({
      success: false,
      state: exhaustedState,
      events: [],
      error: { code: "INSUFFICIENT_CARDS" },
    });

    const riskyRole = card("nightglimmers", "role");
    const riskyCost = card("door-cache", "risky");
    const riskyState = stateWith([
      player(heroId),
      player(rivalId, [riskyCost], { races: [riskyRole] }),
    ]);
    const interfered = executeCommand(
      riskyState,
      {
        type: "USE_ROLE_ABILITY",
        actorId: rivalId,
        roleCardId: riskyRole.instanceId,
        costCardIds: [riskyCost.instanceId],
        target: { type: "COMBAT", side: "PLAYERS" },
        combatId: riskyState.combat!.combatId,
        combatRevision: riskyState.combat!.revision,
      },
      { random },
    );
    expect(interfered.success).toBe(true);
    if (!interfered.success) return;
    expect(interfered.state.players[0]?.activeEffects).toContainEqual(
      expect.objectContaining({
        amount: -2,
        sourceDefinitionId: riskyRole.definitionId,
      }),
    );
  });
});

describe("V2 production catalog rule metadata", () => {
  it("rejects an action whose authored effect and target cannot explain each other", () => {
    const neutral = createDevelopmentCardSet().definitions.find(
      (definition) => definition.id === "bottled-applause",
    )!;
    expect(() =>
      validateProductionCardDefinitions([
        {
          ...neutral,
          play: { ...neutral.play!, target: "COMBAT_PLAYERS" },
        },
      ]),
    ).toThrow(/effect and authored side target do not agree/);
  });

  it("authors only the intended ordinary boosts for both combat sides", () => {
    const definitions = createDevelopmentCardSet().definitions;
    expect(
      definitions
        .filter((definition) => definition.play?.target === "COMBAT_SIDE")
        .map((definition) => definition.id),
    ).toEqual(["bottled-applause", "borrowed-thunder", "sorcerers-gale"]);
    expect(
      definitions
        .filter((definition) => definition.setId === CardSetId.CORE)
        .filter(
          (definition) =>
            definition.type === "CLASS" || definition.type === "RACE",
        )
        .map((definition) => [
          definition.id,
          definition.role?.modifier?.type,
          definition.role?.activeAbility?.type,
        ]),
    ).toEqual([
      ["guild-of-echoes", "COMBAT_POWER", "DRAW_CARDS"],
      ["cartographers-circle", "RUN_AWAY_ROLL", "RUN_AWAY_BONUS"],
      ["scrap-knights", "COMBAT_POWER", "COMBAT_BONUS"],
      ["lantern-wardens", "COMBAT_POWER", "COMBAT_BONUS"],
      ["lantern-folk", "RUN_AWAY_ROLL", "DRAW_CARDS"],
      ["mosskin", "COMBAT_POWER", "COMBAT_BONUS"],
      ["brassborn", "EQUIPMENT_TAG_BONUS", undefined],
      ["nightglimmers", "COMBAT_POWER", "COMBAT_BONUS"],
    ]);
  });
});
