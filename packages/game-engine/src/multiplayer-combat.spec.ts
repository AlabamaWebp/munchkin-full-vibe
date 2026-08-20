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

const random: RandomSource = { nextInt: () => 0 };
const heroId = parsePlayerId("hero");
const helperId = parsePlayerId("helper");
const outsiderId = parsePlayerId("outsider");
const monsterDefinitionId = parseCardDefinitionId("monster");
const equipmentDefinitionId = parseCardDefinitionId("equipment");
const bonusDefinitionId = parseCardDefinitionId("bonus");
const modifierDefinitionId = parseCardDefinitionId("modifier");
const monster = {
  instanceId: parseCardInstanceId("monster-1"),
  definitionId: monsterDefinitionId,
};
const equipment = {
  instanceId: parseCardInstanceId("equipment-1"),
  definitionId: equipmentDefinitionId,
};
const bonus = {
  instanceId: parseCardInstanceId("bonus-1"),
  definitionId: bonusDefinitionId,
};
const modifier = {
  instanceId: parseCardInstanceId("modifier-1"),
  definitionId: modifierDefinitionId,
};

const definitions: readonly CardDefinition[] = [
  {
    id: monsterDefinitionId,
    name: "Monster",
    description: "Test monster.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level: 8, levelRewards: 1, treasureRewards: 0, badStuff: [] },
  },
  {
    id: equipmentDefinitionId,
    name: "Equipment",
    description: "Helper equipment.",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    equipment: { slot: EquipmentSlot.HEAD },
    effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  },
  {
    id: bonusDefinitionId,
    name: "Bonus",
    description: "Helps the adventurers.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 3 }],
  },
  {
    id: modifierDefinitionId,
    name: "Modifier",
    description: "Helps the monster.",
    type: CardType.MONSTER_MODIFIER,
    deck: DeckType.TREASURE,
    effects: [{ type: "MONSTER_COMBAT_BONUS", amount: 4 }],
  },
];

function state(): GameState {
  return {
    schemaVersion: 2,
    id: parseGameId("multiplayer-combat"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.DOOR_RESOLUTION,
    players: [
      {
        id: heroId,
        name: "Hero",
        level: 3,
        hand: [],
        equipment: [],
        temporaryCombatBonus: 0,
      },
      {
        id: helperId,
        name: "Helper",
        level: 4,
        hand: [],
        equipment: [equipment],
        temporaryCombatBonus: 0,
      },
      {
        id: outsiderId,
        name: "Outsider",
        level: 1,
        hand: [bonus, modifier],
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
      helperId: null,
      history: [
        { type: "COMBAT_STARTED", playerId: heroId, monsterDefinitionId },
      ],
    },
    turnNumber: 1,
    winnerId: null,
  };
}

describe("multiplayer combat", () => {
  it("requests and accepts help, then includes level and equipment contribution", () => {
    const requested = executeCommand(
      state(),
      { type: "REQUEST_HELP", actorId: heroId, helperId },
      { random },
    );
    if (!requested.success) throw new Error(requested.error.message);
    expect(requested.state.combat?.requestedHelperId).toBe(helperId);

    const accepted = executeCommand(
      requested.state,
      { type: "ACCEPT_HELP", actorId: helperId },
      { random },
    );
    if (!accepted.success) throw new Error(accepted.error.message);
    expect(accepted.state.combat).toMatchObject({
      requestedHelperId: null,
      helperId,
    });
    expect(accepted.events.at(-1)).toMatchObject({
      type: "COMBAT_UPDATED",
      playerPower: 9,
      monsterPower: 8,
    });

    const victory = executeCommand(
      accepted.state,
      { type: "RESOLVE_COMBAT", actorId: heroId },
      { random },
    );
    expect(victory.success).toBe(true);
  });

  it("rejects self-help and acceptance by a player who was not requested", () => {
    const initial = state();
    expect(
      executeCommand(
        initial,
        { type: "REQUEST_HELP", actorId: heroId, helperId: heroId },
        { random },
      ),
    ).toMatchObject({ success: false, error: { code: "INVALID_HELPER" } });
    expect(
      executeCommand(
        initial,
        { type: "ACCEPT_HELP", actorId: outsiderId },
        { random },
      ),
    ).toMatchObject({
      success: false,
      state: initial,
      error: { code: "HELP_NOT_REQUESTED" },
    });
  });

  it("lets another player affect either side and records public history", () => {
    const playerBonus = executeCommand(
      state(),
      {
        type: "PLAY_CARD",
        actorId: outsiderId,
        cardId: bonus.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
      },
      { random },
    );
    if (!playerBonus.success) throw new Error(playerBonus.error.message);
    expect(playerBonus.events.at(-1)).toMatchObject({
      type: "COMBAT_UPDATED",
      playerPower: 6,
      monsterPower: 8,
    });

    const monsterBonus = executeCommand(
      playerBonus.state,
      {
        type: "PLAY_CARD",
        actorId: outsiderId,
        cardId: modifier.instanceId,
        target: { type: "COMBAT", side: "MONSTER" },
      },
      { random },
    );
    if (!monsterBonus.success) throw new Error(monsterBonus.error.message);
    expect(monsterBonus.state.combat).toMatchObject({ monsterBonus: 4 });
    expect(monsterBonus.events.at(-1)).toMatchObject({
      playerPower: 6,
      monsterPower: 12,
    });
    expect(
      monsterBonus.state.combat?.history.map((entry) => entry.type),
    ).toEqual(["COMBAT_STARTED", "CARD_PLAYED", "CARD_PLAYED"]);
    expect(monsterBonus.state.treasureDiscard).toEqual([bonus, modifier]);
  });

  it("rejects a card played on the wrong combat side atomically", () => {
    const initial = state();
    const result = executeCommand(
      initial,
      {
        type: "PLAY_CARD",
        actorId: outsiderId,
        cardId: modifier.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
      },
      { random },
    );
    expect(result).toMatchObject({
      success: false,
      state: initial,
      events: [],
      error: { code: "CARD_NOT_PLAYABLE" },
    });
  });
});
