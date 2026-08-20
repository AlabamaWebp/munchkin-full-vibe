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
  parseEncounterId,
  parsePlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

const random: RandomSource = { nextInt: () => 0 };
const heroId = parsePlayerId("hero");
const helperId = parsePlayerId("helper");
const outsiderId = parsePlayerId("outsider");
const encounterId = parseEncounterId("encounter-1");
const monsterDefinitionId = parseCardDefinitionId("monster");
const equipmentDefinitionId = parseCardDefinitionId("equipment");
const bonusDefinitionId = parseCardDefinitionId("bonus");
const modifierDefinitionId = parseCardDefinitionId("modifier");
const monsterBonusDefinitionId = parseCardDefinitionId("monster-bonus");
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
const monsterBonus = {
  instanceId: parseCardInstanceId("monster-bonus-1"),
  definitionId: monsterBonusDefinitionId,
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
  {
    id: monsterBonusDefinitionId,
    name: "Monster side bonus",
    description: "A temporary bonus for one Monster.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "MONSTER_COMBAT_BONUS", amount: 3 }],
  },
];

function state(): GameState {
  return {
    schemaVersion: 4,
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
        hand: [bonus, modifier, monsterBonus],
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
      revision: 1,
      monsters: [
        {
          encounterId,
          monster,
          sourceCard: monster,
          clonedFromEncounterId: null,
          baseStrength: 8,
          baseLevelRewards: 1,
          baseTreasureRewards: 0,
          badStuff: [],
          strengthModifier: 0,
          treasureModifier: 0,
          playedCards: [],
        },
      ],
      nextEncounterSequence: 2,
      nextReactionWindowSequence: 1,
      reactionWindow: null,
      requestedHelperId: null,
      helperId: null,
      runAway: null,
      history: [
        {
          type: "COMBAT_STARTED",
          playerId: heroId,
          encounterId,
          monsterDefinitionId,
        },
      ],
    },
    lastRunAwayResult: null,
    pendingDecision: null,
    eventLog: [],
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

    const declared = executeCommand(
      accepted.state,
      {
        type: "DECLARE_COMBAT_VICTORY",
        actorId: heroId,
        combatRevision: accepted.state.combat!.revision,
      },
      { random },
    );
    if (!declared.success) throw new Error(declared.error.message);
    const helperPassed = executeCommand(
      declared.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: helperId,
        reactionWindowId: declared.state.combat!.reactionWindow!.windowId,
      },
      { random },
    );
    if (!helperPassed.success) throw new Error(helperPassed.error.message);
    const victory = executeCommand(
      helperPassed.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: outsiderId,
        reactionWindowId: helperPassed.state.combat!.reactionWindow!.windowId,
      },
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

    const monsterModifierResult = executeCommand(
      playerBonus.state,
      {
        type: "PLAY_CARD",
        actorId: outsiderId,
        cardId: modifier.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
      },
      { random },
    );
    if (!monsterModifierResult.success)
      throw new Error(monsterModifierResult.error.message);
    expect(monsterModifierResult.state.combat?.monsters[0]).toMatchObject({
      strengthModifier: 4,
    });
    expect(monsterModifierResult.events.at(-1)).toMatchObject({
      playerPower: 6,
      monsterPower: 12,
    });
    expect(
      monsterModifierResult.state.combat?.history.map((entry) => entry.type),
    ).toEqual(["COMBAT_STARTED", "CARD_PLAYED", "CARD_PLAYED"]);
    expect(monsterModifierResult.state.treasureDiscard).toEqual([bonus]);
    expect(
      monsterModifierResult.state.combat?.monsters[0]?.playedCards,
    ).toMatchObject([
      { card: modifier, strengthModifier: 4, treasureModifier: 0 },
    ]);
  });

  it("lets a temporary combat bonus strengthen the monster side", () => {
    const result = executeCommand(
      state(),
      {
        type: "PLAY_CARD",
        actorId: outsiderId,
        cardId: monsterBonus.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
      },
      { random },
    );
    expect(result).toMatchObject({
      success: true,
      state: { combat: { monsters: [{ strengthModifier: 3 }] } },
    });
    if (result.success) {
      expect(result.events.at(-1)).toMatchObject({
        type: "COMBAT_UPDATED",
        playerPower: 3,
        monsterPower: 11,
      });
      expect(result.state.treasureDiscard).toEqual([]);
    }
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
