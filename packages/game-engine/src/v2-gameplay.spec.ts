import { describe, expect, it, vi } from "vitest";
import {
  CardType,
  DeckType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import { doorWeightsForLevel, drawCards } from "./deck.js";
import { canScavenge, type CommandResult } from "./engine.js";
import { executeCommand } from "./legacy-test-command.js";
import {
  calculateCombatSidePower,
  calculateMonsterCurrentStrength,
  calculateMonsterPower,
  combatPowerBreakdown,
} from "./equipment.js";
import { createGame } from "./game.js";
import {
  GamePhase,
  GameStatus,
  type GameState,
  type PlayerState,
} from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseEncounterId,
  parseGameId,
  parseHelpOfferId,
  parsePendingDecisionId,
  parsePlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

const heroId = parsePlayerId("v2-hero");
const helperId = parsePlayerId("v2-helper");
const outsiderId = parsePlayerId("v2-outsider");
const encounterId = parseEncounterId("encounter-1");

function definition(
  id: string,
  input: Omit<CardDefinition, "id" | "artKey" | "setId" | "tier" | "tags"> & {
    readonly tier?: 1 | 2 | 3;
    readonly tags?: CardDefinition["tags"];
  },
): CardDefinition {
  return {
    ...input,
    id: parseCardDefinitionId(id),
    artKey: `test.${id}`,
    setId: "CORE",
    tier: input.tier ?? 1,
    tags: input.tags ?? [],
  };
}

function card(id: string, cardDefinition: CardDefinition): CardInstance {
  return {
    instanceId: parseCardInstanceId(id),
    definitionId: cardDefinition.id,
  };
}

function player(
  id = heroId,
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

function state(
  definitions: readonly CardDefinition[],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    schemaVersion: 5,
    config: { mode: "BALANCED", enabledSetIds: ["CORE"] },
    id: parseGameId("v2-gameplay"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.POST_DOOR,
    players: [player()],
    activePlayerId: heroId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: [],
    doorDiscard: [],
    treasureDiscard: [],
    combat: null,
    lastRunAwayResult: null,
    pendingDecision: null,
    nextPendingDecisionSequence: 1,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
    ...overrides,
  };
}

function sequenceRandom(...values: number[]): RandomSource {
  let index = 0;
  return {
    nextInt(maxExclusive): number {
      const value = values[index++] ?? 0;
      if (value < 0 || value >= maxExclusive)
        throw new RangeError(
          `Random value ${value} is invalid for ${maxExclusive}.`,
        );
      return value;
    },
  };
}

function requireSuccess(result: CommandResult): GameState {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.state;
}

const utilityT1 = definition("utility-t1", {
  name: "T1",
  description: "T1 utility",
  type: CardType.UTILITY,
  deck: DeckType.DOOR,
  effects: [],
  tier: 1,
});
const utilityT2 = definition("utility-t2", {
  name: "T2",
  description: "T2 utility",
  type: CardType.UTILITY,
  deck: DeckType.DOOR,
  effects: [],
  tier: 2,
});
const utilityT3 = definition("utility-t3", {
  name: "T3",
  description: "T3 utility",
  type: CardType.UTILITY,
  deck: DeckType.DOOR,
  effects: [],
  tier: 3,
});

describe("V2 tier-aware draws and setup", () => {
  it("selects deterministic Balanced branches and falls back across unavailable tiers", () => {
    const t1 = card("t1", utilityT1);
    const t2 = card("t2", utilityT2);
    const t3 = card("t3", utilityT3);
    const initial = state([utilityT1, utilityT2, utilityT3], {
      doorDeck: [t1, t2, t3],
    });
    const tierTwo = drawCards(
      initial,
      DeckType.DOOR,
      1,
      sequenceRandom(90, 0),
      doorWeightsForLevel(1),
    );
    expect(tierTwo.cards).toEqual([t2]);

    const fallback = drawCards(
      state([utilityT3], { doorDeck: [t3] }),
      DeckType.DOOR,
      1,
      sequenceRandom(0, 0),
      doorWeightsForLevel(1),
    );
    expect(fallback.cards).toEqual([t3]);
  });

  it("keeps Classic top-draw behavior and atomically rejects a shortage", () => {
    const first = card("first", utilityT3);
    const second = card("second", utilityT1);
    const random = { nextInt: vi.fn(() => 0) };
    const classic = state([utilityT1, utilityT3], {
      config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
      doorDeck: [first, second],
    });
    expect(
      drawCards(classic, DeckType.DOOR, 1, random, doorWeightsForLevel(1))
        .cards,
    ).toEqual([first]);
    expect(random.nextInt).not.toHaveBeenCalled();

    expect(() =>
      drawCards(classic, DeckType.DOOR, 3, random, doorWeightsForLevel(1)),
    ).toThrow(/cannot provide 3/);
    expect(classic.doorDeck).toEqual([first, second]);
  });

  it("recycles during a weighted multi-draw without duplicating a physical card", () => {
    const first = card("recycle-first", utilityT1);
    const recycled = card("recycled", utilityT2);
    const drawn = drawCards(
      state([utilityT1, utilityT2], {
        doorDeck: [first],
        doorDiscard: [recycled],
      }),
      DeckType.DOOR,
      2,
      sequenceRandom(0, 0, 0, 0),
      doorWeightsForLevel(1),
    );
    expect(drawn.cards).toEqual([first, recycled]);
    expect(new Set(drawn.cards.map((item) => item.instanceId)).size).toBe(2);
    expect(drawn.events).toMatchObject([{ type: "DECK_RESHUFFLED" }]);
  });

  it("gives six Balanced players distinct legal starter equipment", () => {
    let game = createGame({ id: parseGameId("six-player-starters") });
    const random = sequenceRandom(...Array.from({ length: 500 }, () => 0));
    for (let index = 1; index <= 6; index += 1) {
      game = requireSuccess(
        executeCommand(
          game,
          {
            type: "ADD_PLAYER",
            actorId: parsePlayerId(`starter-player-${index}`),
            name: `P${index}`,
            sex: index % 2 === 0 ? "FEMALE" : "MALE",
          },
          { random },
        ),
      );
    }
    game = requireSuccess(
      executeCommand(
        game,
        { type: "START_GAME", actorId: game.players[0]!.id },
        { random },
      ),
    );
    const starterIds = game.players.map((current) => {
      const starters = current.hand.filter(
        (physical) =>
          game.cardDefinitions.find((item) => item.id === physical.definitionId)
            ?.starterEligible,
      );
      expect(starters.length).toBeGreaterThanOrEqual(1);
      return starters[0]!.instanceId;
    });
    expect(new Set(starterIds).size).toBe(6);
    const allZones = [
      ...game.doorDeck,
      ...game.treasureDeck,
      ...game.players.flatMap((current) => current.hand),
    ];
    expect(new Set(allZones.map((item) => item.instanceId)).size).toBe(
      allZones.length,
    );
  });
});

describe("V2 conditional encounter rewards", () => {
  it("uses the final conditional Monster strength for display and Treasure tier", () => {
    const monsterDefinition = definition("conditional-monster", {
      name: "Conditional monster",
      description: "Stronger against this hero",
      type: CardType.MONSTER,
      deck: DeckType.DOOR,
      effects: [],
      monster: {
        strength: 5,
        levelRewards: 1,
        treasureRewards: 1,
        badStuff: [],
        modifiers: [
          {
            type: "COMBAT_POWER",
            amount: 3,
            conditions: [{ type: "PLAYER_SEX_IS", sex: "MALE" }],
          },
        ],
      },
    });
    const rewardT1 = definition("conditional-reward-t1", {
      name: "T1 reward",
      description: "Early reward",
      type: CardType.UTILITY,
      deck: DeckType.TREASURE,
      effects: [],
      tier: 1,
    });
    const rewardT2 = definition("conditional-reward-t2", {
      name: "T2 reward",
      description: "Mid reward",
      type: CardType.UTILITY,
      deck: DeckType.TREASURE,
      effects: [],
      tier: 2,
    });
    const monster = card("conditional-monster-1", monsterDefinition);
    const encounter = {
      encounterId,
      monster,
      sourceCard: monster,
      clonedFromEncounterId: null,
      baseStrength: 5,
      baseLevelRewards: 1,
      baseTreasureRewards: 1,
      tier: 1 as const,
      tags: [] as const,
      badStuff: [] as const,
      strengthModifier: 0,
      treasureModifier: 0,
      playedCards: [],
    };
    const initial = state([monsterDefinition, rewardT1, rewardT2], {
      phase: GamePhase.DOOR_RESOLUTION,
      players: [player(heroId, { level: 9 })],
      treasureDeck: [
        card("conditional-reward-1", rewardT1),
        card("conditional-reward-2", rewardT2),
      ],
      combat: {
        playerId: heroId,
        revision: 1,
        monsters: [encounter],
        nextEncounterSequence: 2,
        nextHelpOfferSequence: 1,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        helpOffer: null,
        helpAgreement: null,
        history: [],
        runAway: null,
      },
    });
    expect(calculateMonsterCurrentStrength(initial, encounter)).toBe(8);

    const result = executeCommand(
      initial,
      {
        type: "DECLARE_COMBAT_VICTORY",
        actorId: heroId,
        combatRevision: 1,
      },
      { random: sequenceRandom(50, 0) },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.players[0]?.hand).toEqual([
      card("conditional-reward-2", rewardT2),
    ]);
  });
});

describe("V2 attachment cleanup", () => {
  const hostDefinition = definition("attachment-host", {
    name: "Host weapon",
    description: "Weapon",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    tags: ["WEAPON"],
    equipment: {
      slot: EquipmentSlot.HANDS,
      hands: 1,
      combatBonus: 1,
    },
    effects: [],
  });
  const attachmentDefinition = definition("attachment-card", {
    name: "Enhancer",
    description: "Attached bonus",
    type: CardType.ATTACHMENT,
    deck: DeckType.TREASURE,
    attachment: { combatBonus: 1, allowedTags: ["WEAPON"] },
    effects: [],
  });
  const curseDefinition = definition("attachment-curse", {
    name: "Break weapon",
    description: "Discard Equipment",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    effects: [{ type: "DISCARD_RANDOM_CARDS", zone: "EQUIPMENT", count: 1 }],
  });

  it("discards an enhancer with a randomly destroyed host", () => {
    const host = card("random-host", hostDefinition);
    const attachment = card("random-attachment", attachmentDefinition);
    const curse = card("random-curse", curseDefinition);
    const initial = state(
      [hostDefinition, attachmentDefinition, curseDefinition],
      {
        phase: GamePhase.TURN_START,
        doorDeck: [curse],
        players: [
          player(heroId, {
            equipment: [host],
            equipmentAttachments: [
              { card: attachment, attachedToCardId: host.instanceId },
            ],
          }),
        ],
      },
    );
    const result = executeCommand(
      initial,
      { type: "KICK_DOOR", actorId: heroId },
      { random: sequenceRandom(0, 0, 0) },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.players[0]?.equipmentAttachments).toEqual([]);
    expect(result.state.treasureDiscard).toEqual([host, attachment]);
  });

  it("rejects a stale decision and discards an enhancer with a chosen host", () => {
    const host = card("chosen-host", hostDefinition);
    const attachment = card("chosen-attachment", attachmentDefinition);
    const curse = card("chosen-curse", curseDefinition);
    const decisionId = parsePendingDecisionId("attachment-decision");
    const initial = state(
      [hostDefinition, attachmentDefinition, curseDefinition],
      {
        players: [
          player(heroId, {
            equipment: [host],
            equipmentAttachments: [
              { card: attachment, attachedToCardId: host.instanceId },
            ],
          }),
        ],
        pendingDecision: {
          decisionId,
          createdAtEpochMs: 0,
          expiresAtEpochMs: 0,
          type: "DISCARD_CARDS",
          playerId: heroId,
          zone: "EQUIPMENT",
          count: 1,
          sourceCardId: curse.instanceId,
          sourceDefinitionId: curse.definitionId,
          remainingEffects: [],
          completion: {
            type: "CURSE",
            card: curse,
            targetPlayerId: heroId,
            phaseAfterResolution: null,
          },
        },
      },
    );
    const stale = executeCommand(
      initial,
      {
        type: "RESOLVE_CARD_DISCARD",
        actorId: heroId,
        decisionId: parsePendingDecisionId("stale-decision"),
        cardIds: [host.instanceId],
      },
      { random: sequenceRandom(0) },
    );
    expect(stale).toMatchObject({
      success: false,
      state: initial,
      error: { code: "PENDING_DECISION" },
    });

    const result = executeCommand(
      initial,
      {
        type: "RESOLVE_CARD_DISCARD",
        actorId: heroId,
        decisionId,
        cardIds: [host.instanceId],
      },
      { random: sequenceRandom(0) },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.players[0]?.equipmentAttachments).toEqual([]);
    expect(result.state.treasureDiscard).toEqual([host, attachment]);
  });
});

const starter = definition("recovery-boots", {
  name: "Recovery boots",
  description: "A recovered item",
  type: CardType.EQUIPMENT,
  deck: DeckType.TREASURE,
  goldValue: 200,
  sellable: false,
  tradeable: false,
  scavengeEligible: true,
  equipment: { slot: EquipmentSlot.FEET, hands: 0, combatBonus: 1 },
  effects: [],
});
const strongItem = definition("strong-item", {
  name: "Strong item",
  description: "Disables recovery",
  type: CardType.EQUIPMENT,
  deck: DeckType.TREASURE,
  goldValue: 400,
  equipment: { slot: EquipmentSlot.HEAD, hands: 0, combatBonus: 2 },
  effects: [],
});

describe("V2 recovery and sale", () => {
  it("applies and automatically removes the computed Makeshift Tools source", () => {
    const monsterDefinition = definition("weak-monster", {
      name: "Weak monster",
      description: "Weak",
      type: CardType.MONSTER,
      deck: DeckType.DOOR,
      effects: [],
      monster: {
        strength: 2,
        levelRewards: 1,
        treasureRewards: 0,
        badStuff: [],
      },
    });
    const monster = card("weak-monster-1", monsterDefinition);
    const combat = state([monsterDefinition], {
      phase: GamePhase.DOOR_RESOLUTION,
      combat: {
        playerId: heroId,
        revision: 1,
        monsters: [
          {
            encounterId,
            monster,
            sourceCard: monster,
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
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        helpOffer: null,
        helpAgreement: null,
        history: [],
        runAway: null,
      },
    });
    expect(calculateCombatSidePower(combat)).toBe(3);
    expect(combatPowerBreakdown(combat, heroId)).toContainEqual({
      source: "MAKESHIFT_TOOLS",
      amount: 2,
    });
    const withHelper = {
      ...combat,
      players: [combat.players[0]!, player(helperId)],
      combat: {
        ...combat.combat!,
        helpAgreement: {
          helperId,
          promisedTreasures: 0,
          acceptedOfferId: parseHelpOfferId("agreement"),
          agreedAtCombatRevision: 1,
        },
      },
    };
    expect(combatPowerBreakdown(withHelper, heroId)).not.toContainEqual(
      expect.objectContaining({ source: "MAKESHIFT_TOOLS" }),
    );
  });

  it("Scavenges one private, unsellable current-pile card and blocks exploit boundaries", () => {
    const recovered = card("recovered-1", starter);
    const initial = state([starter, strongItem], { treasureDeck: [recovered] });
    expect(canScavenge(initial, heroId)).toBe(true);
    const result = executeCommand(
      initial,
      { type: "SCAVENGE", actorId: heroId },
      { random: sequenceRandom(0) },
    );
    expect(result).toMatchObject({
      success: true,
      state: { phase: GamePhase.END_TURN, treasureDeck: [] },
      events: [
        { type: "SCAVENGED", visibility: "PUBLIC" },
        {
          type: "SCAVENGED_CARD",
          visibility: "PRIVATE",
          recipientPlayerId: heroId,
        },
      ],
    });
    if (!result.success) return;
    expect(result.state.players[0]?.hand).toEqual([recovered]);
    expect(
      executeCommand(
        { ...result.state, phase: GamePhase.POST_DOOR },
        {
          type: "SELL_ITEMS",
          actorId: heroId,
          cardIds: [recovered.instanceId],
        },
        { random: sequenceRandom(0) },
      ),
    ).toMatchObject({ success: false, error: { code: "CARD_NOT_SELLABLE" } });
    expect(
      canScavenge(
        state([starter, strongItem], {
          treasureDeck: [recovered],
          players: [
            player(heroId, { hand: [card("held-strong", strongItem)] }),
          ],
        }),
        heroId,
      ),
    ).toBe(false);
  });

  it("sells valued Equipment and one-shots, loses remainder, and rejects invalid victory sales", () => {
    const oneShot = definition("sale-one-shot", {
      name: "One shot",
      description: "Valued Treasure",
      type: CardType.TEMPORARY_BONUS,
      deck: DeckType.TREASURE,
      goldValue: 600,
      effects: [{ type: "COMBAT_BONUS", amount: 2 }],
    });
    const equipment = definition("sale-equipment", {
      name: "Equipment",
      description: "Valued Equipment",
      type: CardType.EQUIPMENT,
      deck: DeckType.TREASURE,
      goldValue: 1500,
      equipment: { slot: EquipmentSlot.HEAD, combatBonus: 1 },
      effects: [],
    });
    const cards = [card("sale-shot", oneShot), card("sale-item", equipment)];
    const initial = state([oneShot, equipment], {
      phase: GamePhase.TURN_START,
      players: [player(heroId, { level: 2, hand: cards })],
    });
    const sold = executeCommand(
      initial,
      {
        type: "SELL_ITEMS",
        actorId: heroId,
        cardIds: cards.map((item) => item.instanceId),
      },
      { random: sequenceRandom(0) },
    );
    expect(sold).toMatchObject({
      success: true,
      state: { players: [{ level: 4, hand: [] }] },
      events: [{ type: "CARDS_SOLD", value: 2100, levelsGained: 2 }],
    });
    const victoryAttempt = executeCommand(
      state([equipment], {
        phase: GamePhase.TURN_START,
        players: [player(heroId, { level: 9, hand: [cards[1]!] })],
      }),
      { type: "SELL_ITEMS", actorId: heroId, cardIds: [cards[1]!.instanceId] },
      { random: sequenceRandom(0) },
    );
    expect(victoryAttempt).toMatchObject({
      success: false,
      error: { code: "SALE_LEVEL_LIMIT" },
    });
  });
});

function combatState(
  options: {
    readonly treasureRewards?: number;
    readonly treasureModifier?: number;
    readonly helperAgreement?: number | null;
    readonly badStuff?: CardDefinition["effects"];
    readonly players?: readonly PlayerState[];
  } = {},
): GameState {
  const monsterDefinition = definition("negotiation-monster", {
    name: "Negotiation monster",
    description: "A social test",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: {
      strength: 8,
      levelRewards: 2,
      treasureRewards: options.treasureRewards ?? 3,
      badStuff: (options.badStuff ?? []) as never,
    },
  });
  const reward = definition("reward-card", {
    name: "Reward",
    description: "Private reward",
    type: CardType.UTILITY,
    deck: DeckType.TREASURE,
    goldValue: 100,
    effects: [],
  });
  const monster = card("negotiation-monster-1", monsterDefinition);
  return state([monsterDefinition, reward], {
    config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
    phase: GamePhase.DOOR_RESOLUTION,
    players: options.players ?? [
      player(heroId, { level: 8 }),
      player(helperId),
      player(outsiderId),
    ],
    treasureDeck: Array.from({ length: 8 }, (_, index) =>
      card(`reward-${index}`, reward),
    ),
    combat: {
      playerId: heroId,
      revision: 1,
      monsters: [
        {
          encounterId,
          monster,
          sourceCard: monster,
          clonedFromEncounterId: null,
          baseStrength: 8,
          baseLevelRewards: 2,
          baseTreasureRewards: options.treasureRewards ?? 3,
          tier: 2,
          tags: [],
          badStuff: (options.badStuff ?? []) as never,
          strengthModifier: 0,
          treasureModifier: options.treasureModifier ?? 0,
          playedCards: [],
        },
      ],
      nextEncounterSequence: 2,
      nextHelpOfferSequence: 1,
      nextReactionWindowSequence: 1,
      reactionWindow: null,
      helpOffer: null,
      helpAgreement:
        options.helperAgreement === null ||
        options.helperAgreement === undefined
          ? null
          : {
              helperId,
              promisedTreasures: options.helperAgreement,
              acceptedOfferId: parseHelpOfferId("accepted"),
              agreedAtCombatRevision: 1,
            },
      history: [],
      runAway: null,
    },
  });
}

describe("V2 help, rewards, and helper risk", () => {
  it("supports offer, rejection, cancellation, acceptance, actor checks, revisions, and JSON reconnect", () => {
    const initial = combatState();
    const offered = executeCommand(
      initial,
      {
        type: "PROPOSE_HELP",
        actorId: heroId,
        helperId,
        treasureCount: 2,
        combatRevision: 1,
      },
      { random: sequenceRandom(0) },
    );
    const offeredState = requireSuccess(offered);
    expect(offeredState.combat?.helpOffer).toMatchObject({
      helperId,
      treasureCount: 2,
    });
    expect(offered.events).toContainEqual(
      expect.objectContaining({
        type: "HELP_OFFERED",
        treasureCount: 2,
        totalTreasureCount: 3,
      }),
    );
    expect(
      executeCommand(
        offeredState,
        {
          type: "ACCEPT_HELP_OFFER",
          actorId: outsiderId,
          offerId: offeredState.combat!.helpOffer!.offerId,
          combatRevision: offeredState.combat!.revision,
        },
        { random: sequenceRandom(0) },
      ),
    ).toMatchObject({ success: false, error: { code: "INVALID_HELPER" } });
    expect(
      executeCommand(
        offeredState,
        {
          type: "REJECT_HELP_OFFER",
          actorId: helperId,
          offerId: offeredState.combat!.helpOffer!.offerId,
          combatRevision: offeredState.combat!.revision,
        },
        { random: sequenceRandom(0) },
      ),
    ).toMatchObject({
      success: true,
      state: { combat: { helpOffer: null, helpAgreement: null } },
      events: [{ type: "HELP_OFFER_REJECTED", playerId: helperId }],
    });
    const cancelled = requireSuccess(
      executeCommand(
        offeredState,
        {
          type: "CANCEL_HELP_OFFER",
          actorId: heroId,
          offerId: offeredState.combat!.helpOffer!.offerId,
          combatRevision: offeredState.combat!.revision,
        },
        { random: sequenceRandom(0) },
      ),
    );
    const reoffered = requireSuccess(
      executeCommand(
        cancelled,
        {
          type: "PROPOSE_HELP",
          actorId: heroId,
          helperId,
          treasureCount: 1,
          combatRevision: cancelled.combat!.revision,
        },
        { random: sequenceRandom(0) },
      ),
    );
    const accepted = requireSuccess(
      executeCommand(
        reoffered,
        {
          type: "ACCEPT_HELP_OFFER",
          actorId: helperId,
          offerId: reoffered.combat!.helpOffer!.offerId,
          combatRevision: reoffered.combat!.revision,
        },
        { random: sequenceRandom(0) },
      ),
    );
    expect(accepted.combat?.helpAgreement).toMatchObject({
      helperId,
      promisedTreasures: 1,
    });
    expect(JSON.parse(JSON.stringify(accepted)).combat.helpAgreement).toEqual(
      accepted.combat?.helpAgreement,
    );
    expect(
      executeCommand(
        initial,
        {
          type: "PROPOSE_HELP",
          actorId: heroId,
          helperId,
          treasureCount: 1,
          combatRevision: 999,
        },
        { random: sequenceRandom(0) },
      ),
    ).toMatchObject({ success: false, error: { code: "STALE_COMBAT_STATE" } });
  });

  it.each([
    {
      name: "clamps a reduced reward",
      promised: 2,
      base: 1,
      modifier: 0,
      helper: 1,
      active: 0,
    },
    {
      name: "does not enlarge the promise",
      promised: 1,
      base: 2,
      modifier: 2,
      helper: 1,
      active: 3,
    },
  ])(
    "$name and keeps identities private",
    ({ promised, base, modifier, helper, active }) => {
      const initial = combatState({
        treasureRewards: base,
        treasureModifier: modifier,
        helperAgreement: promised,
        players: [
          player(heroId, {
            level: 9,
            activeEffects: [
              {
                type: "COMBAT_POWER",
                sourceDefinitionId: parseCardDefinitionId("reward-card"),
                amount: 20,
                expires: "END_OF_COMBAT",
              },
            ],
          }),
          player(helperId),
        ],
      });
      const declared = requireSuccess(
        executeCommand(
          initial,
          {
            type: "DECLARE_COMBAT_VICTORY",
            actorId: heroId,
            combatRevision: 1,
          },
          { random: sequenceRandom(0) },
        ),
      );
      const result = executeCommand(
        declared,
        {
          type: "PASS_COMBAT_REACTION",
          actorId: helperId,
          reactionWindowId: declared.combat!.reactionWindow!.windowId,
        },
        { random: sequenceRandom(...Array.from({ length: 20 }, () => 0)) },
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(
        result.state.players.find((item) => item.id === helperId)?.hand,
      ).toHaveLength(helper);
      expect(
        result.state.players.find((item) => item.id === heroId)?.hand,
      ).toHaveLength(active);
      expect(
        result.state.players.find((item) => item.id === helperId)?.level,
      ).toBe(1);
      expect(
        result.state.players.find((item) => item.id === heroId)?.level,
      ).toBe(10);
      const privateEvents = result.events.filter(
        (event) => event.type === "COMBAT_REWARD_CARDS",
      );
      expect(privateEvents).toHaveLength(2);
      expect(privateEvents.map((event) => event.recipientPlayerId)).toEqual([
        heroId,
        helperId,
      ]);
    },
  );

  it("runs active and helper away independently and resumes a helper choice without reroll", () => {
    const discardDefinition = definition("discard-fodder", {
      name: "Fodder",
      description: "Discard",
      type: CardType.UTILITY,
      deck: DeckType.TREASURE,
      effects: [],
    });
    const fodder = card("fodder-1", discardDefinition);
    const initial = combatState({
      helperAgreement: 0,
      badStuff: [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
      players: [player(heroId), player(helperId, { hand: [fodder] })],
    });
    const withDefinition = {
      ...initial,
      cardDefinitions: [...initial.cardDefinitions, discardDefinition],
    };
    const started = executeCommand(
      withDefinition,
      { type: "RUN_AWAY", actorId: heroId },
      { random: sequenceRandom(4, 0) },
    );
    expect(started).toMatchObject({
      success: true,
      state: {
        pendingDecision: { playerId: helperId, type: "DISCARD_CARDS" },
        combat: {
          runAway: {
            attempts: [{ outcome: "ESCAPED" }, { outcome: "FAILED" }],
          },
        },
      },
    });
    if (!started.success) return;
    const decision = started.state.pendingDecision!;
    const resumed = executeCommand(
      started.state,
      {
        type: "RESOLVE_CARD_DISCARD",
        actorId: helperId,
        decisionId: decision.decisionId,
        cardIds: [fodder.instanceId],
      },
      {
        random: {
          nextInt: vi.fn(() => {
            throw new Error("must not reroll");
          }),
        },
      },
    );
    expect(resumed).toMatchObject({
      success: true,
      state: { combat: null, phase: GamePhase.END_TURN },
    });
  });

  it.each([
    { name: "active dies", rolls: [0, 4], activeDead: true, helperDead: false },
    { name: "helper dies", rolls: [4, 0], activeDead: false, helperDead: true },
    { name: "both die", rolls: [0, 0], activeDead: true, helperDead: true },
  ])(
    "records independent helper risk when $name",
    ({ rolls, activeDead, helperDead }) => {
      const initial = combatState({
        helperAgreement: 0,
        badStuff: [{ type: "DEATH" }],
        players: [player(heroId), player(helperId)],
      });
      const result = executeCommand(
        initial,
        { type: "RUN_AWAY", actorId: heroId },
        { random: sequenceRandom(...rolls) },
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(
        result.state.players.find((item) => item.id === heroId)?.isDead,
      ).toBe(activeDead);
      expect(
        result.state.players.find((item) => item.id === helperId)?.isDead,
      ).toBe(helperDead);
      expect(
        result.state.lastRunAwayResult?.attempts.map(
          (attempt) => attempt.combatantId,
        ),
      ).toEqual([heroId, helperId]);
    },
  );

  it("uses encounter-major order for a helper across multiple Monsters", () => {
    const initial = combatState({
      helperAgreement: 0,
      players: [player(heroId), player(helperId)],
    });
    const second = {
      ...initial.combat!.monsters[0]!,
      encounterId: parseEncounterId("encounter-2"),
      clonedFromEncounterId: encounterId,
    };
    const result = executeCommand(
      {
        ...initial,
        combat: {
          ...initial.combat!,
          monsters: [...initial.combat!.monsters, second],
        },
      },
      { type: "RUN_AWAY", actorId: heroId },
      { random: sequenceRandom(4, 4, 4, 4) },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(
      result.state.lastRunAwayResult?.attempts.map((attempt) => [
        attempt.encounterId,
        attempt.combatantId,
      ]),
    ).toEqual([
      [encounterId, heroId],
      [encounterId, helperId],
      [parseEncounterId("encounter-2"), heroId],
      [parseEncounterId("encounter-2"), helperId],
    ]);
  });
});

describe("V2 conditional roles and role capacity", () => {
  it("applies Sex/Class/Race/tag conditional modifiers authoritatively", () => {
    const classDefinition = definition("hunter-class", {
      name: "Hunter",
      description: "Strong against beasts",
      type: CardType.CLASS,
      deck: DeckType.DOOR,
      effects: [],
      role: {
        role: "CLASS",
        modifier: {
          type: "COMBAT_POWER",
          amount: 2,
          conditions: [{ type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] }],
        },
      },
    });
    const monsterDefinition = definition("sex-beast", {
      name: "Beast",
      description: "Conditional",
      type: CardType.MONSTER,
      deck: DeckType.DOOR,
      tags: ["BEAST"],
      effects: [],
      monster: {
        strength: 4,
        levelRewards: 1,
        treasureRewards: 0,
        badStuff: [],
        modifiers: [
          {
            type: "COMBAT_POWER",
            amount: 3,
            conditions: [{ type: "PLAYER_SEX_IS", sex: "MALE" }],
          },
        ],
      },
    });
    const classCard = card("hunter-1", classDefinition);
    const monster = card("sex-beast-1", monsterDefinition);
    const combat = combatState({
      players: [player(heroId, { classCards: [classCard] })],
    });
    const conditioned: GameState = {
      ...combat,
      cardDefinitions: [classDefinition, monsterDefinition],
      combat: {
        ...combat.combat!,
        monsters: [
          {
            ...combat.combat!.monsters[0]!,
            monster,
            sourceCard: monster,
            baseStrength: 4,
            tags: ["BEAST"],
          },
        ],
      },
    };
    expect(calculateCombatSidePower(conditioned)).toBe(3);
    expect(calculateMonsterPower(conditioned)).toBe(7);
    expect(combatPowerBreakdown(conditioned, heroId)).toContainEqual(
      expect.objectContaining({ source: "ROLE", amount: 2 }),
    );
  });

  it("creates a reconnect-safe keep-role decision after permission loss and revalidates equipment", () => {
    const classOne = definition("class-one", {
      name: "One",
      description: "Class",
      type: CardType.CLASS,
      deck: DeckType.DOOR,
      effects: [],
      role: { role: "CLASS" },
    });
    const classTwo = definition("class-two", {
      name: "Two",
      description: "Class",
      type: CardType.CLASS,
      deck: DeckType.DOOR,
      effects: [],
      role: { role: "CLASS" },
    });
    const permission = definition("multi-class", {
      name: "Multi Class",
      description: "Permission",
      type: CardType.ROLE_PERMISSION,
      deck: DeckType.DOOR,
      effects: [],
      rolePermission: { role: "CLASS", additionalSlots: 1 },
    });
    const restricted = definition("class-two-item", {
      name: "Restricted",
      description: "Restricted",
      type: CardType.EQUIPMENT,
      deck: DeckType.TREASURE,
      goldValue: 300,
      effects: [],
      equipment: {
        slot: EquipmentSlot.HEAD,
        combatBonus: 1,
        restrictions: [{ type: "CLASS", definitionId: classTwo.id }],
      },
    });
    const one = card("class-one-1", classOne);
    const two = card("class-two-1", classTwo);
    const permissionCard = card("permission-1", permission);
    const item = card("restricted-1", restricted);
    const initial = state([classOne, classTwo, permission, restricted], {
      phase: GamePhase.TURN_START,
      players: [
        player(heroId, {
          classCards: [one, two],
          rolePermissionCards: [permissionCard],
          equipment: [item],
        }),
      ],
    });
    const lost = executeCommand(
      initial,
      {
        type: "DISCARD_ROLE_PERMISSION",
        actorId: heroId,
        cardId: permissionCard.instanceId,
      },
      { random: sequenceRandom(0) },
    );
    expect(lost).toMatchObject({
      success: true,
      state: {
        pendingDecision: { type: "CHOOSE_ROLE_TO_KEEP", role: "CLASS" },
      },
    });
    if (
      !lost.success ||
      lost.state.pendingDecision?.type !== "CHOOSE_ROLE_TO_KEEP"
    )
      return;
    expect(JSON.parse(JSON.stringify(lost.state)).pendingDecision).toEqual(
      lost.state.pendingDecision,
    );
    const resolved = executeCommand(
      lost.state,
      {
        type: "RESOLVE_ROLE_RETENTION",
        actorId: heroId,
        decisionId: lost.state.pendingDecision.decisionId,
        keepCardId: one.instanceId,
      },
      { random: sequenceRandom(0) },
    );
    expect(resolved).toMatchObject({
      success: true,
      state: {
        pendingDecision: null,
        players: [{ classCards: [one], equipment: [], hand: [item] }],
      },
    });
  });

  it("allows two distinct roles only with permission and rejects duplicate definitions", () => {
    const first = definition("capacity-one", {
      name: "One",
      description: "Class",
      type: CardType.CLASS,
      deck: DeckType.DOOR,
      effects: [],
      role: { role: "CLASS" },
    });
    const second = definition("capacity-two", {
      name: "Two",
      description: "Class",
      type: CardType.CLASS,
      deck: DeckType.DOOR,
      effects: [],
      role: { role: "CLASS" },
    });
    const permission = definition("capacity-permission", {
      name: "Permission",
      description: "Two Classes",
      type: CardType.ROLE_PERMISSION,
      deck: DeckType.DOOR,
      effects: [],
      rolePermission: { role: "CLASS", additionalSlots: 1 },
    });
    const firstCard = card("capacity-one-1", first);
    const duplicate = card("capacity-one-2", first);
    const secondCard = card("capacity-two-1", second);
    const permissionCard = card("capacity-permission-1", permission);
    let current = state([first, second, permission], {
      phase: GamePhase.TURN_START,
      players: [
        player(heroId, {
          hand: [permissionCard, firstCard, secondCard, duplicate],
        }),
      ],
    });
    current = requireSuccess(
      executeCommand(
        current,
        {
          type: "PLAY_ROLE_PERMISSION",
          actorId: heroId,
          cardId: permissionCard.instanceId,
        },
        { random: sequenceRandom(0) },
      ),
    );
    current = requireSuccess(
      executeCommand(
        current,
        {
          type: "PLAY_ROLE",
          actorId: heroId,
          cardId: firstCard.instanceId,
        },
        { random: sequenceRandom(0) },
      ),
    );
    current = requireSuccess(
      executeCommand(
        current,
        {
          type: "PLAY_ROLE",
          actorId: heroId,
          cardId: secondCard.instanceId,
        },
        { random: sequenceRandom(0) },
      ),
    );
    expect(current.players[0]?.classCards).toEqual([firstCard, secondCard]);
    expect(
      executeCommand(
        current,
        {
          type: "PLAY_ROLE",
          actorId: heroId,
          cardId: duplicate.instanceId,
          replaceCardId: secondCard.instanceId,
        },
        { random: sequenceRandom(0) },
      ),
    ).toMatchObject({
      success: false,
      error: { code: "INVALID_CARD_SELECTION" },
    });
  });
});
