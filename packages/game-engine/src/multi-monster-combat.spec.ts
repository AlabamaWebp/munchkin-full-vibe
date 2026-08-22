import { describe, expect, it } from "vitest";
import { CardType, DeckType, type CardDefinition } from "./cards.js";
import {
  calculateMonsterPower,
  calculateMonsterStrength,
  calculateMonsterTreasures,
} from "./equipment.js";
import { executeCommand } from "./legacy-test-command.js";
import {
  GamePhase,
  GameStatus,
  type CombatMonsterState,
  type GameState,
} from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseEncounterId,
  parseGameId,
  parsePlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

const heroId = parsePlayerId("multi-hero");
const firstEncounterId = parseEncounterId("encounter-1");
const secondEncounterId = parseEncounterId("encounter-2");

const firstMonsterDefinition: CardDefinition = {
  id: parseCardDefinitionId("filing-cabinet-wolf"),
  name: "Filing Cabinet Wolf",
  description: "It guards forms in triplicate.",
  type: CardType.MONSTER,
  deck: DeckType.DOOR,
  effects: [],
  monster: {
    strength: 6,
    levelRewards: 1,
    treasureRewards: 2,
    badStuff: [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
  },
};
const secondMonsterDefinition: CardDefinition = {
  id: parseCardDefinitionId("meeting-room-mimic"),
  name: "Meeting Room Mimic",
  description: "The chairs are teeth.",
  type: CardType.MONSTER,
  deck: DeckType.DOOR,
  effects: [],
  monster: {
    strength: 4,
    levelRewards: 2,
    treasureRewards: 1,
    badStuff: [{ type: "LOSE_LEVEL", amount: 1 }],
  },
};
const addDefinition: CardDefinition = {
  id: parseCardDefinitionId("open-mic-invitation"),
  name: "Open Mic Invitation",
  description: "Another Monster joins the show.",
  type: CardType.ADD_MONSTER,
  deck: DeckType.DOOR,
  effects: [{ type: "ADD_MONSTER_TO_COMBAT" }],
};
const cloneDefinition: CardDefinition = {
  id: parseCardDefinitionId("carbon-copy"),
  name: "Carbon Copy",
  description: "Duplicates one current Monster.",
  type: CardType.CLONE_MONSTER,
  deck: DeckType.TREASURE,
  effects: [{ type: "CLONE_COMBAT_MONSTER" }],
};
const boosterDefinition: CardDefinition = {
  id: parseCardDefinitionId("monster-promotion"),
  name: "Monster Promotion",
  description: "More strength and more loot.",
  type: CardType.MONSTER_MODIFIER,
  deck: DeckType.TREASURE,
  effects: [{ type: "MODIFY_MONSTER", strength: 5, treasures: 2 }],
};
const weakeningDefinition: CardDefinition = {
  id: parseCardDefinitionId("monster-nap"),
  name: "Monster Nap",
  description: "Less strength and less loot.",
  type: CardType.MONSTER_MODIFIER,
  deck: DeckType.TREASURE,
  effects: [{ type: "MODIFY_MONSTER", strength: -5, treasures: -1 }],
};
const rewardDefinition: CardDefinition = {
  id: parseCardDefinitionId("reward"),
  name: "Reward",
  description: "Test Treasure.",
  type: CardType.UTILITY,
  deck: DeckType.TREASURE,
  effects: [],
};

const firstMonster = {
  instanceId: parseCardInstanceId("first-monster"),
  definitionId: firstMonsterDefinition.id,
};
const secondMonster = {
  instanceId: parseCardInstanceId("second-monster"),
  definitionId: secondMonsterDefinition.id,
};
const addCard = {
  instanceId: parseCardInstanceId("add-card"),
  definitionId: addDefinition.id,
};
const cloneCard = {
  instanceId: parseCardInstanceId("clone-card"),
  definitionId: cloneDefinition.id,
};
const booster = {
  instanceId: parseCardInstanceId("booster"),
  definitionId: boosterDefinition.id,
};
const weakening = {
  instanceId: parseCardInstanceId("weakening"),
  definitionId: weakeningDefinition.id,
};
const spare = {
  instanceId: parseCardInstanceId("spare"),
  definitionId: rewardDefinition.id,
};
const rewards = Array.from({ length: 12 }, (_, index) => ({
  instanceId: parseCardInstanceId(`reward-${index + 1}`),
  definitionId: rewardDefinition.id,
}));

const definitions = [
  firstMonsterDefinition,
  secondMonsterDefinition,
  addDefinition,
  cloneDefinition,
  boosterDefinition,
  weakeningDefinition,
  rewardDefinition,
];

function combatMonster(
  monster: typeof firstMonster,
  encounterId = firstEncounterId,
): CombatMonsterState {
  const definition = definitions.find(
    (candidate) => candidate.id === monster.definitionId,
  )!;
  return {
    encounterId,
    monster,
    sourceCard: monster,
    clonedFromEncounterId: null,
    baseStrength: definition.monster!.strength,
    baseLevelRewards: definition.monster!.levelRewards,
    baseTreasureRewards: definition.monster!.treasureRewards,
    tier: 1,
    tags: [],
    badStuff: definition.monster!.badStuff,
    strengthModifier: 0,
    treasureModifier: 0,
    playedCards: [],
  };
}

function state(
  monsters: readonly CombatMonsterState[] = [combatMonster(firstMonster)],
): GameState {
  return {
    schemaVersion: 5,
    config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
    id: parseGameId("multi-monster"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.DOOR_RESOLUTION,
    players: [
      {
        id: heroId,
        name: "Hero",
        sex: "MALE",
        level: 3,
        hand: [secondMonster, addCard, cloneCard, booster, weakening, spare],
        equipment: [],
        equipmentAttachments: [],
        classCards: [],
        raceCards: [],
        rolePermissionCards: [],
        hirelingCard: null,
        mountCard: null,
        isDead: false,
        activeEffects: [
          {
            type: "COMBAT_POWER",
            sourceDefinitionId: rewardDefinition.id,
            amount: 20,
            expires: "END_OF_COMBAT",
          },
        ],
      },
    ],
    activePlayerId: heroId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: rewards,
    doorDiscard: [],
    treasureDiscard: [],
    combat: {
      playerId: heroId,
      revision: 1,
      monsters,
      nextEncounterSequence: monsters.length + 1,
      nextHelpOfferSequence: 1,
      nextReactionWindowSequence: 1,
      reactionWindow: null,
      helpOffer: null,
      helpAgreement: null,
      history: [
        {
          type: "COMBAT_STARTED",
          playerId: heroId,
          encounterId: monsters[0]!.encounterId,
          monsterDefinitionId: monsters[0]!.monster.definitionId,
        },
      ],
      runAway: null,
    },
    lastRunAwayResult: null,
    pendingDecision: null,
    nextPendingDecisionSequence: 1,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
  };
}

const fixedRandom: RandomSource = { nextInt: () => 0 };

function playOnMonster(
  current: GameState,
  cardId: typeof booster.instanceId,
  encounterId = firstEncounterId,
): GameState {
  const result = executeCommand(
    current,
    {
      type: "PLAY_CARD",
      actorId: heroId,
      cardId,
      target: { type: "COMBAT", side: "MONSTER", encounterId },
    },
    { random: fixedRandom },
  );
  if (!result.success) throw new Error(result.error.message);
  return result.state;
}

describe("multi-Monster combat", () => {
  it("adds a selected hand Monster with a stable encounter id and removes both cards", () => {
    const result = executeCommand(
      state(),
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: addCard.instanceId,
        target: { type: "HAND_MONSTER", cardId: secondMonster.instanceId },
      },
      { random: fixedRandom },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.state.players[0]?.hand).not.toEqual(
      expect.arrayContaining([addCard, secondMonster]),
    );
    expect(result.state.combat?.monsters).toMatchObject([
      { encounterId: firstEncounterId, monster: firstMonster },
      {
        encounterId: secondEncounterId,
        monster: secondMonster,
        playedCards: [{ card: addCard, purpose: "ADD_MONSTER" }],
      },
    ]);
    expect(calculateMonsterPower(result.state)).toBe(10);
    expect(result.events.map((event) => event.type)).toEqual([
      "CARD_PLAYED",
      "MONSTER_ADDED",
      "COMBAT_UPDATED",
    ]);
  });

  it("addresses one Monster and rejects an unknown encounter atomically", () => {
    const twoMonsters = state([
      combatMonster(firstMonster),
      combatMonster(secondMonster, secondEncounterId),
    ]);
    const modified = playOnMonster(
      twoMonsters,
      booster.instanceId,
      secondEncounterId,
    );
    expect(modified.combat?.monsters).toMatchObject([
      {
        encounterId: firstEncounterId,
        strengthModifier: 0,
        treasureModifier: 0,
      },
      {
        encounterId: secondEncounterId,
        strengthModifier: 5,
        treasureModifier: 2,
      },
    ]);

    const initial = state();
    const invalid = executeCommand(
      initial,
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: booster.instanceId,
        target: {
          type: "COMBAT",
          side: "MONSTER",
          encounterId: parseEncounterId("missing-encounter"),
        },
      },
      { random: fixedRandom },
    );
    expect(invalid).toMatchObject({
      success: false,
      state: initial,
      events: [],
      error: { code: "INVALID_TARGET" },
    });
  });

  it("clones a snapshot with current modifiers and keeps later changes independent", () => {
    const boosted = playOnMonster(state(), booster.instanceId);
    const cloned = executeCommand(
      boosted,
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: cloneCard.instanceId,
        target: {
          type: "COMBAT",
          side: "MONSTER",
          encounterId: firstEncounterId,
        },
      },
      { random: fixedRandom },
    );
    expect(cloned.success).toBe(true);
    if (!cloned.success) throw new Error(cloned.error.message);
    const clone = cloned.state.combat?.monsters[1];
    expect(clone).toMatchObject({
      encounterId: secondEncounterId,
      sourceCard: cloneCard,
      clonedFromEncounterId: firstEncounterId,
      strengthModifier: 5,
      treasureModifier: 2,
      playedCards: [
        { card: booster, purpose: "MODIFIER" },
        { card: cloneCard, purpose: "CLONE_MONSTER" },
      ],
    });

    const changedOriginal = playOnMonster(
      cloned.state,
      weakening.instanceId,
      firstEncounterId,
    );
    expect(changedOriginal.combat?.monsters).toMatchObject([
      { strengthModifier: 0, treasureModifier: 1 },
      { strengthModifier: 5, treasureModifier: 2 },
    ]);
  });

  it("caps weakened strength at one and Treasure rewards at zero", () => {
    const weakened = playOnMonster(state(), weakening.instanceId);
    const monster = weakened.combat!.monsters[0]!;
    expect(monster).toMatchObject({
      strengthModifier: -5,
      treasureModifier: -1,
    });
    expect(calculateMonsterStrength(monster)).toBe(1);
    expect(calculateMonsterTreasures(monster)).toBe(1);

    const weakenedAgain = {
      ...monster,
      strengthModifier: -50,
      treasureModifier: -50,
    };
    expect(calculateMonsterStrength(weakenedAgain)).toBe(1);
    expect(calculateMonsterTreasures(weakenedAgain)).toBe(0);
  });

  it("sums rewards and discards every physical Monster and modifier after victory", () => {
    const added = executeCommand(
      state(),
      {
        type: "PLAY_CARD",
        actorId: heroId,
        cardId: addCard.instanceId,
        target: { type: "HAND_MONSTER", cardId: secondMonster.instanceId },
      },
      { random: fixedRandom },
    );
    if (!added.success) throw new Error(added.error.message);
    const boosted = playOnMonster(added.state, booster.instanceId);
    const won = executeCommand(
      boosted,
      {
        type: "DECLARE_COMBAT_VICTORY",
        actorId: heroId,
        combatRevision: boosted.combat!.revision,
      },
      { random: fixedRandom },
    );

    expect(won.success).toBe(true);
    if (!won.success) throw new Error(won.error.message);
    expect(won.state.players[0]).toMatchObject({
      level: 6,
      activeEffects: [],
    });
    expect(won.state.players[0]?.hand.slice(-5)).toEqual(
      expect.arrayContaining(rewards.slice(0, 5)),
    );
    expect(won.state.doorDiscard).toEqual(
      expect.arrayContaining([firstMonster, secondMonster, addCard]),
    );
    expect(won.state.treasureDiscard).toContain(booster);
    expect(
      won.events.filter((event) => event.type === "COMBAT_WON"),
    ).toHaveLength(2);
    expect(won.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "LEVEL_GAINED", amount: 3 }),
        expect.objectContaining({ type: "TREASURE_GAINED", count: 5 }),
      ]),
    );
  });

  it("resumes sequential escape attempts after a reconnect-safe pending decision", () => {
    const initial = state([
      combatMonster(firstMonster),
      combatMonster(secondMonster, secondEncounterId),
    ]);
    const started = executeCommand(
      {
        ...initial,
        players: [{ ...initial.players[0]!, level: 3, activeEffects: [] }],
      },
      { type: "RUN_AWAY", actorId: heroId },
      { random: { nextInt: () => 0 } },
    );
    expect(started.success).toBe(true);
    if (!started.success) throw new Error(started.error.message);
    expect(started.state.pendingDecision).toMatchObject({
      type: "DISCARD_CARDS",
      sourceCardId: firstMonster.instanceId,
      completion: { type: "RUN_AWAY", encounterId: firstEncounterId },
    });
    expect(started.state.combat?.runAway).toMatchObject({
      cursor: { encounterIndex: 0, combatantIndex: 1 },
      attempts: [{ encounterId: firstEncounterId, roll: 1, outcome: "FAILED" }],
    });

    const reconnected = JSON.parse(JSON.stringify(started.state)) as GameState;
    const completed = executeCommand(
      reconnected,
      {
        type: "RESOLVE_CARD_DISCARD",
        actorId: heroId,
        decisionId: reconnected.pendingDecision!.decisionId,
        cardIds: [spare.instanceId],
      },
      { random: { nextInt: () => 1 } },
    );
    expect(completed.success).toBe(true);
    if (!completed.success) throw new Error(completed.error.message);
    expect(completed.state).toMatchObject({
      combat: null,
      pendingDecision: null,
      phase: GamePhase.END_TURN,
      lastRunAwayResult: {
        attempts: [
          { encounterId: firstEncounterId, roll: 1, outcome: "FAILED" },
          { encounterId: secondEncounterId, roll: 2, outcome: "FAILED" },
        ],
      },
    });
    expect(completed.state.players[0]?.level).toBe(2);
    expect(completed.state.doorDiscard).toEqual(
      expect.arrayContaining([firstMonster, secondMonster]),
    );
    expect(completed.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "BAD_STUFF_APPLIED",
          encounterId: firstEncounterId,
        }),
        expect.objectContaining({
          type: "RUN_AWAY_ATTEMPTED",
          encounterId: secondEncounterId,
        }),
        expect.objectContaining({
          type: "BAD_STUFF_APPLIED",
          encounterId: secondEncounterId,
        }),
      ]),
    );
  });
});
