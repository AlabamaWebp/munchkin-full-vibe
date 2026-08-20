import { describe, expect, it } from "vitest";
import {
  CardType,
  DeckType,
  EquipmentSlot,
  type CardDefinition,
} from "./cards.js";
import { executeCommand } from "./engine.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

const heroId = parsePlayerId("hero");
const helperId = parsePlayerId("helper");
const monsterDefinitionId = parseCardDefinitionId("bad-monster");
const equipmentDefinitionId = parseCardDefinitionId("lost-helmet");
const monster = {
  instanceId: parseCardInstanceId("bad-monster-1"),
  definitionId: monsterDefinitionId,
};
const helmet = {
  instanceId: parseCardInstanceId("lost-helmet-1"),
  definitionId: equipmentDefinitionId,
};
const definitions: readonly CardDefinition[] = [
  {
    id: monsterDefinitionId,
    name: "Bad Monster",
    description: "Punishes a failed escape.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: {
      level: 10,
      levelRewards: 1,
      treasureRewards: 1,
      badStuff: [
        { type: "LOSE_LEVEL", amount: 2 },
        { type: "DISCARD_RANDOM_CARDS", zone: "EQUIPMENT", count: 1 },
      ],
    },
  },
  {
    id: equipmentDefinitionId,
    name: "Lost Helmet",
    description: "Bad-stuff fodder.",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    equipment: { slot: EquipmentSlot.HEAD },
    effects: [{ type: "COMBAT_BONUS", amount: 1 }],
  },
];

function sequenceRandom(...values: number[]): RandomSource {
  let index = 0;
  return {
    nextInt(maxExclusive): number {
      const value = values[index++] ?? 0;
      if (value < 0 || value >= maxExclusive)
        throw new RangeError("Bad test random value.");
      return value;
    },
  };
}

function losingState(): GameState {
  return {
    schemaVersion: 3,
    id: parseGameId("run-away-test"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.DOOR_RESOLUTION,
    players: [
      {
        id: heroId,
        name: "Hero",
        level: 3,
        hand: [],
        equipment: [helmet],
        temporaryCombatBonus: 2,
      },
      {
        id: helperId,
        name: "Helper",
        level: 1,
        hand: [],
        equipment: [],
        temporaryCombatBonus: 0,
      },
    ],
    activePlayerId: heroId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: [],
    doorDiscard: [],
    treasureDiscard: [],
    combat: {
      playerId: heroId,
      monster,
      monsterBonus: 0,
      requestedHelperId: null,
      helperId,
      history: [
        { type: "COMBAT_STARTED", playerId: heroId, monsterDefinitionId },
      ],
    },
    lastRunAwayResult: null,
    pendingDecision: null,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
  };
}

describe("losing combat", () => {
  it("escapes on a roll of five and cleans up combat without bad stuff", () => {
    const result = executeCommand(
      losingState(),
      { type: "RUN_AWAY", actorId: heroId },
      { random: sequenceRandom(4) },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.state).toMatchObject({
      phase: GamePhase.END_TURN,
      combat: null,
      lastRunAwayResult: {
        playerId: heroId,
        roll: 5,
        escaped: true,
        badStuffApplied: false,
      },
    });
    expect(result.state.players[0]).toMatchObject({
      level: 3,
      equipment: [helmet],
      temporaryCombatBonus: 0,
    });
    expect(result.state.doorDiscard).toEqual([monster]);
    expect(result.events).toMatchObject([
      { type: "RUN_AWAY_ATTEMPTED", roll: 5, escaped: true },
    ]);
  });

  it("applies typed bad stuff after a failed escape and keeps level at least one", () => {
    const state = {
      ...losingState(),
      players: [
        { ...losingState().players[0]!, level: 2 },
        losingState().players[1]!,
      ],
    };
    const result = executeCommand(
      state,
      { type: "RUN_AWAY", actorId: heroId },
      { random: sequenceRandom(3, 0) },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.state.players[0]).toMatchObject({
      level: 1,
      equipment: [],
      temporaryCombatBonus: 0,
    });
    expect(result.state.treasureDiscard).toEqual([helmet]);
    expect(result.state.lastRunAwayResult).toMatchObject({
      roll: 4,
      escaped: false,
      badStuffApplied: true,
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "RUN_AWAY_ATTEMPTED",
      "LEVEL_LOST",
      "CARDS_DISCARDED",
      "CARDS_DISCARDED_SUMMARY",
      "BAD_STUFF_APPLIED",
    ]);
  });

  it("rejects escape outside the active losing combat atomically", () => {
    const state = losingState();
    const helperAttempt = executeCommand(
      state,
      { type: "RUN_AWAY", actorId: helperId },
      { random: sequenceRandom(4) },
    );
    const winningState = {
      ...state,
      players: [{ ...state.players[0]!, level: 20 }, state.players[1]!],
    };
    const winningAttempt = executeCommand(
      winningState,
      { type: "RUN_AWAY", actorId: heroId },
      { random: sequenceRandom(4) },
    );

    expect(helperAttempt).toMatchObject({
      success: false,
      state,
      events: [],
      error: { code: "NOT_ACTIVE_PLAYER" },
    });
    expect(winningAttempt).toMatchObject({
      success: false,
      state: winningState,
      events: [],
      error: { code: "COMMAND_NOT_AVAILABLE" },
    });
  });
});
