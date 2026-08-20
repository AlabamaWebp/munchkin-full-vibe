import { describe, expect, it } from "vitest";
import { CardType, DeckType, type CardDefinition } from "./cards.js";
import { executeCommand } from "./engine.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

const random: RandomSource = { nextInt: () => 0 };
const playerId = parsePlayerId("hero");
const monsterDefinitionId = parseCardDefinitionId("test-monster");
const bonusDefinitionId = parseCardDefinitionId("test-bonus");
const otherDefinitionId = parseCardDefinitionId("test-other");
const treasureDefinitionId = parseCardDefinitionId("test-treasure");
const monster = {
  instanceId: parseCardInstanceId("test-monster-1"),
  definitionId: monsterDefinitionId,
};
const bonus = {
  instanceId: parseCardInstanceId("test-bonus-1"),
  definitionId: bonusDefinitionId,
};
const other = {
  instanceId: parseCardInstanceId("test-other-1"),
  definitionId: otherDefinitionId,
};
const treasures = [1, 2].map((copy) => ({
  instanceId: parseCardInstanceId(`test-treasure-${copy}`),
  definitionId: treasureDefinitionId,
}));

const definitions: readonly CardDefinition[] = [
  {
    id: monsterDefinitionId,
    name: "Test Monster",
    description: "A test opponent.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level: 4, levelRewards: 1, treasureRewards: 2, badStuff: [] },
  },
  {
    id: bonusDefinitionId,
    name: "Test Bonus",
    description: "A temporary boost.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 4 }],
  },
  {
    id: otherDefinitionId,
    name: "Other",
    description: "Not playable in combat.",
    type: CardType.OTHER,
    deck: DeckType.TREASURE,
    effects: [],
  },
  {
    id: treasureDefinitionId,
    name: "Reward",
    description: "Combat loot.",
    type: CardType.OTHER,
    deck: DeckType.TREASURE,
    effects: [],
  },
];

function combatState(): GameState {
  return {
    schemaVersion: 3,
    id: parseGameId("combat-test"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.DOOR_RESOLUTION,
    players: [
      {
        id: playerId,
        name: "Hero",
        level: 1,
        hand: [bonus, other],
        equipment: [],
        temporaryCombatBonus: 0,
      },
    ],
    activePlayerId: playerId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: treasures,
    doorDiscard: [],
    treasureDiscard: [],
    combat: {
      playerId,
      monster,
      monsterBonus: 0,
      requestedHelperId: null,
      helperId: null,
      history: [{ type: "COMBAT_STARTED", playerId, monsterDefinitionId }],
    },
    lastRunAwayResult: null,
    pendingDecision: null,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
  };
}

describe("basic combat", () => {
  it("plays and discards a temporary bonus into the active combat", () => {
    const result = executeCommand(
      combatState(),
      {
        type: "PLAY_CARD",
        actorId: playerId,
        cardId: bonus.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
      },
      { random },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.state.players[0]).toMatchObject({ temporaryCombatBonus: 4 });
    expect(result.state.players[0]?.hand).not.toContain(bonus);
    expect(result.state.treasureDiscard).toContain(bonus);
    expect(result.events).toMatchObject([
      { type: "CARD_PLAYED", visibility: "PUBLIC" },
      { type: "COMBAT_UPDATED", playerPower: 5, monsterPower: 4 },
    ]);
  });

  it("rejects an invalid target and a non-bonus card atomically", () => {
    const state = combatState();
    const invalidTarget = executeCommand(
      state,
      {
        type: "PLAY_CARD",
        actorId: playerId,
        cardId: bonus.instanceId,
        target: null,
      },
      { random },
    );
    const invalidCard = executeCommand(
      state,
      {
        type: "PLAY_CARD",
        actorId: playerId,
        cardId: other.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
      },
      { random },
    );

    expect(invalidTarget).toMatchObject({
      success: false,
      state,
      error: { code: "INVALID_TARGET" },
    });
    expect(invalidCard).toMatchObject({
      success: false,
      state,
      error: { code: "CARD_NOT_PLAYABLE" },
    });
  });

  it("requires player power to strictly exceed monster power", () => {
    const state = {
      ...combatState(),
      players: [{ ...combatState().players[0]!, level: 4 }],
    };
    const result = executeCommand(
      state,
      { type: "RESOLVE_COMBAT", actorId: playerId },
      { random },
    );

    expect(result).toMatchObject({
      success: false,
      state,
      error: { code: "COMBAT_NOT_WON" },
    });
  });

  it("awards levels and private treasure identities after victory", () => {
    const state = {
      ...combatState(),
      players: [
        { ...combatState().players[0]!, level: 5, temporaryCombatBonus: 2 },
      ],
    };
    const result = executeCommand(
      state,
      { type: "RESOLVE_COMBAT", actorId: playerId },
      { random },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.state).toMatchObject({
      phase: GamePhase.END_TURN,
      combat: null,
    });
    expect(result.state.players[0]).toMatchObject({
      level: 6,
      temporaryCombatBonus: 0,
    });
    expect(result.state.players[0]?.hand).toEqual([
      ...state.players[0]!.hand,
      ...treasures,
    ]);
    expect(result.state.doorDiscard).toContain(monster);
    expect(result.state.treasureDeck).toEqual([]);
    expect(result.events.map((event) => event.type)).toEqual([
      "COMBAT_WON",
      "LEVEL_GAINED",
      "TREASURE_GAINED",
      "CARD_DRAWN",
      "CARD_DRAWN",
    ]);
    expect(result.events.slice(3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          visibility: "PRIVATE",
          recipientPlayerId: playerId,
        }),
      ]),
    );
    expect(JSON.stringify(result.events.slice(0, 3))).not.toContain(
      treasures[0]!.instanceId,
    );
  });

  it("finishes the game at level ten and rejects later gameplay commands", () => {
    const state = {
      ...combatState(),
      players: [{ ...combatState().players[0]!, level: 9 }],
    };
    const result = executeCommand(
      state,
      { type: "RESOLVE_COMBAT", actorId: playerId },
      { random },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.state).toMatchObject({
      status: GameStatus.FINISHED,
      phase: GamePhase.FINISHED,
      winnerId: playerId,
      activePlayerId: playerId,
      combat: null,
    });
    expect(result.events.at(-1)).toEqual({
      type: "GAME_FINISHED",
      visibility: "PUBLIC",
      winnerId: playerId,
      winningLevel: 10,
    });

    expect(
      executeCommand(
        result.state,
        { type: "END_TURN", actorId: playerId },
        { random },
      ),
    ).toMatchObject({
      success: false,
      state: result.state,
      error: { code: "COMMAND_NOT_AVAILABLE" },
    });
  });

  it("does not partially resolve a reward when the Treasure deck is short", () => {
    const state = {
      ...combatState(),
      treasureDeck: treasures.slice(0, 1),
      players: [{ ...combatState().players[0]!, level: 5 }],
    };
    const result = executeCommand(
      state,
      { type: "RESOLVE_COMBAT", actorId: playerId },
      { random },
    );

    expect(result).toMatchObject({
      success: false,
      state,
      events: [],
      error: { code: "INSUFFICIENT_CARDS" },
    });
  });
});
