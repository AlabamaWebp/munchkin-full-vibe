import { describe, expect, it, vi } from "vitest";
import {
  CardType,
  DeckType,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import type { CommandResult } from "./engine.js";
import { executeCommand } from "./legacy-test-command.js";
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
  parseGameId,
  parseEncounterId,
  parsePlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

const heroId = parsePlayerId("hero");
const nextPlayerId = parsePlayerId("next-player");
const keepOrderRandom: RandomSource = {
  nextInt(maxExclusive: number): number {
    return maxExclusive - 1;
  },
};

function definition(
  id: string,
  type: CardType,
  deck: DeckType,
  effects: CardDefinition["effects"] = [],
): CardDefinition {
  return {
    id: parseCardDefinitionId(id),
    name: id,
    description: `${id} description`,
    type,
    deck,
    effects,
    ...(type === CardType.MONSTER
      ? {
          monster: {
            strength: 2,
            levelRewards: 1,
            treasureRewards: 2,
            badStuff: [],
          },
        }
      : {}),
  };
}

const doorDefinition = definition("door-card", CardType.UTILITY, DeckType.DOOR);
const treasureDefinition = definition(
  "treasure-card",
  CardType.UTILITY,
  DeckType.TREASURE,
);
const monsterDefinition = definition(
  "hand-monster",
  CardType.MONSTER,
  DeckType.DOOR,
);
const drawCurseDefinition = definition(
  "draw-curse",
  CardType.CURSE,
  DeckType.DOOR,
  [{ type: "DRAW_CARDS", deck: DeckType.DOOR, count: 2 }],
);
const definitions = [
  doorDefinition,
  treasureDefinition,
  monsterDefinition,
  drawCurseDefinition,
];

function card(id: string, cardDefinition: CardDefinition): CardInstance {
  return {
    instanceId: parseCardInstanceId(id),
    definitionId: cardDefinition.id,
  };
}

function player(
  id: typeof heroId,
  hand: readonly CardInstance[] = [],
): PlayerState {
  return {
    id,
    name: id,
    sex: "MALE",
    level: 5,
    hand,
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
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: 5,
    config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
    id: parseGameId("deck-recycling"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.POST_DOOR,
    players: [player(heroId)],
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

function requireSuccess(result: CommandResult): GameState {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.state;
}

describe("recycling deck draws", () => {
  it("draws from the current deck without touching a non-empty discard", () => {
    const first = card("door-first", doorDefinition);
    const second = card("door-second", doorDefinition);
    const discarded = card("door-discarded", doorDefinition);
    const initial = state({
      doorDeck: [first, second],
      doorDiscard: [discarded],
    });

    const result = executeCommand(
      initial,
      { type: "LOOT_ROOM", actorId: heroId },
      { random: keepOrderRandom },
    );
    const drawn = requireSuccess(result);

    expect(drawn.players[0]?.hand).toEqual([first]);
    expect(drawn.doorDeck).toEqual([second]);
    expect(drawn.doorDiscard).toEqual([discarded]);
    expect(result.events.map((event) => event.type)).toEqual([
      "ROOM_LOOTED",
      "CARD_DRAWN",
    ]);
  });

  it("keeps the deck remainder first, then shuffles the discard for a draw effect", () => {
    const curse = card("draw-curse-1", drawCurseDefinition);
    const current = card("door-current", doorDefinition);
    const recycledFirst = card("door-recycled-1", doorDefinition);
    const recycledSecond = card("door-recycled-2", doorDefinition);
    const initial = state({
      phase: GamePhase.TURN_START,
      doorDeck: [curse, current],
      doorDiscard: [recycledFirst, recycledSecond],
    });

    const result = executeCommand(
      initial,
      { type: "KICK_DOOR", actorId: heroId },
      { random: keepOrderRandom },
    );
    const resolved = requireSuccess(result);

    expect(resolved.players[0]?.hand).toEqual([current, recycledFirst]);
    expect(resolved.doorDeck).toEqual([recycledSecond]);
    expect(resolved.doorDiscard).toEqual([curse]);
    expect(result.events.map((event) => event.type)).toEqual([
      "DOOR_KICKED",
      "DECK_RESHUFFLED",
      "CARD_DRAWN",
      "CARD_DRAWN",
      "CURSE_RESOLVED",
    ]);
    const reshuffled = result.events[1];
    expect(reshuffled).toEqual({
      type: "DECK_RESHUFFLED",
      visibility: "PUBLIC",
      deck: DeckType.DOOR,
    });
    expect(JSON.stringify(reshuffled)).not.toContain(recycledFirst.instanceId);
  });

  it("recycles the Door discard when kicking with an empty draw pile", () => {
    const recycled = card("door-only-discard", doorDefinition);
    const initial = state({
      phase: GamePhase.TURN_START,
      doorDiscard: [recycled],
    });

    const result = executeCommand(
      initial,
      { type: "KICK_DOOR", actorId: heroId },
      { random: keepOrderRandom },
    );
    const kicked = requireSuccess(result);

    expect(kicked.players[0]?.hand).toEqual([recycled]);
    expect(kicked.doorDeck).toEqual([]);
    expect(kicked.doorDiscard).toEqual([]);
    expect(result.events.map((event) => event.type)).toEqual([
      "DECK_RESHUFFLED",
      "DOOR_KICKED",
      "CARD_ADDED_TO_HAND",
    ]);
  });

  it("fails atomically only when the Door deck and discard are both empty", () => {
    const initial = state();
    const random = { nextInt: vi.fn(() => 0) };
    const result = executeCommand(
      initial,
      { type: "LOOT_ROOM", actorId: heroId },
      { random },
    );

    expect(result).toMatchObject({
      success: false,
      state: initial,
      events: [],
      error: { code: "DECK_EMPTY" },
    });
    expect(random.nextInt).not.toHaveBeenCalled();
  });

  it("recycles Treasure discard across a combat-reward boundary", () => {
    const monster = card("reward-monster", monsterDefinition);
    const current = card("treasure-current", treasureDefinition);
    const recycled = card("treasure-recycled", treasureDefinition);
    const remaining = card("treasure-remaining", treasureDefinition);
    const combat: CombatState = {
      playerId: heroId,
      revision: 1,
      monsters: [
        {
          encounterId: parseEncounterId("encounter-1"),
          monster,
          sourceCard: monster,
          clonedFromEncounterId: null,
          baseStrength: 2,
          baseLevelRewards: 1,
          baseTreasureRewards: 2,
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
    };
    const initial = state({
      phase: GamePhase.DOOR_RESOLUTION,
      combat,
      treasureDeck: [current],
      treasureDiscard: [recycled, remaining],
    });

    const result = executeCommand(
      initial,
      {
        type: "DECLARE_COMBAT_VICTORY",
        actorId: heroId,
        combatRevision: initial.combat!.revision,
      },
      { random: keepOrderRandom },
    );
    const resolved = requireSuccess(result);

    expect(resolved.players[0]?.hand).toEqual([current, recycled]);
    expect(resolved.treasureDeck).toEqual([remaining]);
    expect(resolved.treasureDiscard).toEqual([]);
    expect(result.events).toContainEqual({
      type: "DECK_RESHUFFLED",
      visibility: "PUBLIC",
      deck: DeckType.TREASURE,
    });
  });

  it("recycles Door and Treasure independently for an exact revival deal", () => {
    const doors = Array.from({ length: 5 }, (_, index) =>
      card(`revival-door-${index}`, doorDefinition),
    );
    const treasures = Array.from({ length: 5 }, (_, index) =>
      card(`revival-treasure-${index}`, treasureDefinition),
    );
    const deadPlayer = { ...player(nextPlayerId), isDead: true };
    const initial = state({
      phase: GamePhase.END_TURN,
      players: [player(heroId), deadPlayer],
      doorDeck: doors.slice(0, 1),
      doorDiscard: doors.slice(1),
      treasureDeck: treasures.slice(0, 1),
      treasureDiscard: treasures.slice(1),
    });

    const result = executeCommand(
      initial,
      { type: "END_TURN", actorId: heroId },
      { random: keepOrderRandom },
    );
    const revived = requireSuccess(result);

    expect(revived.players[1]).toMatchObject({
      isDead: false,
      hand: [...doors.slice(0, 4), ...treasures.slice(0, 4)],
    });
    expect(revived.doorDeck).toEqual(doors.slice(4));
    expect(revived.treasureDeck).toEqual(treasures.slice(4));
    expect(revived.doorDiscard).toEqual([]);
    expect(revived.treasureDiscard).toEqual([]);
    expect(
      result.events
        .filter((event) => event.type === "DECK_RESHUFFLED")
        .map((event) => event.deck),
    ).toEqual([DeckType.DOOR, DeckType.TREASURE]);
  });

  it("does not partially resolve a draw effect or revival with combined shortages", () => {
    const curse = card("short-draw-curse", drawCurseDefinition);
    const onlyDoor = card("short-door", doorDefinition);
    const effectState = state({
      phase: GamePhase.TURN_START,
      doorDeck: [curse, onlyDoor],
    });
    expect(
      executeCommand(
        effectState,
        { type: "KICK_DOOR", actorId: heroId },
        { random: keepOrderRandom },
      ),
    ).toMatchObject({
      success: false,
      state: effectState,
      events: [],
      error: { code: "INSUFFICIENT_CARDS" },
    });

    const doors = Array.from({ length: 3 }, (_, index) =>
      card(`short-revival-door-${index}`, doorDefinition),
    );
    const treasures = Array.from({ length: 4 }, (_, index) =>
      card(`short-revival-treasure-${index}`, treasureDefinition),
    );
    const revivalState = state({
      phase: GamePhase.END_TURN,
      players: [player(heroId), { ...player(nextPlayerId), isDead: true }],
      doorDeck: doors.slice(0, 1),
      doorDiscard: doors.slice(1),
      treasureDiscard: treasures,
    });
    expect(
      executeCommand(
        revivalState,
        { type: "END_TURN", actorId: heroId },
        { random: keepOrderRandom },
      ),
    ).toMatchObject({
      success: false,
      state: revivalState,
      events: [],
      error: { code: "INSUFFICIENT_CARDS" },
    });
  });
});

describe("LOOK_FOR_TROUBLE", () => {
  it("moves exactly one owned Monster from hand into a normal public combat", () => {
    const monster = card("look-monster", monsterDefinition);
    const other = card("look-other", doorDefinition);
    const initial = state({ players: [player(heroId, [monster, other])] });

    const result = executeCommand(
      initial,
      {
        type: "LOOK_FOR_TROUBLE",
        actorId: heroId,
        cardId: monster.instanceId,
      },
      { random: keepOrderRandom },
    );
    const fighting = requireSuccess(result);

    expect(fighting.phase).toBe(GamePhase.DOOR_RESOLUTION);
    expect(fighting.players[0]?.hand).toEqual([other]);
    expect(fighting.combat).toMatchObject({
      playerId: heroId,
      monsters: [{ encounterId: parseEncounterId("encounter-1"), monster }],
      helpOffer: null,
      helpAgreement: null,
    });
    expect(result.events).toEqual([
      {
        type: "LOOKED_FOR_TROUBLE",
        visibility: "PUBLIC",
        playerId: heroId,
        monsterCardId: monster.instanceId,
        monsterDefinitionId: monster.definitionId,
      },
      {
        type: "COMBAT_STARTED",
        visibility: "PUBLIC",
        playerId: heroId,
        encounterId: parseEncounterId("encounter-1"),
        monsterCardId: monster.instanceId,
        monsterDefinitionId: monster.definitionId,
      },
    ]);
  });

  it("rejects a foreign card, non-Monster, wrong phase, and existing combat atomically", () => {
    const monster = card("guarded-monster", monsterDefinition);
    const other = card("guarded-other", doorDefinition);
    const initial = state({ players: [player(heroId, [monster, other])] });
    const command = {
      type: "LOOK_FOR_TROUBLE" as const,
      actorId: heroId,
      cardId: monster.instanceId,
    };

    const foreign = executeCommand(
      initial,
      { ...command, cardId: parseCardInstanceId("foreign-monster") },
      { random: keepOrderRandom },
    );
    expect(foreign).toMatchObject({
      success: false,
      state: initial,
      error: { code: "CARD_NOT_IN_HAND" },
    });

    const wrongType = executeCommand(
      initial,
      { ...command, cardId: other.instanceId },
      { random: keepOrderRandom },
    );
    expect(wrongType).toMatchObject({
      success: false,
      state: initial,
      error: { code: "CARD_NOT_PLAYABLE" },
    });

    const wrongPhase = { ...initial, phase: GamePhase.TURN_START };
    expect(
      executeCommand(wrongPhase, command, { random: keepOrderRandom }),
    ).toMatchObject({
      success: false,
      state: wrongPhase,
      error: { code: "INVALID_PHASE" },
    });

    const combat: CombatState = {
      playerId: heroId,
      revision: 1,
      monsters: [
        {
          encounterId: parseEncounterId("encounter-1"),
          monster,
          sourceCard: monster,
          clonedFromEncounterId: null,
          baseStrength: 2,
          baseLevelRewards: 1,
          baseTreasureRewards: 2,
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
    };
    const combatActive = { ...initial, combat };
    expect(
      executeCommand(combatActive, command, { random: keepOrderRandom }),
    ).toMatchObject({
      success: false,
      state: combatActive,
      error: { code: "INVALID_PHASE" },
    });
  });
});
