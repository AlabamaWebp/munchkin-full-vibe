import { describe, expect, it } from "vitest";
import {
  CardType,
  DeckType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import { executeCommand } from "./engine.js";
import { calculateCombatPower, equipmentCombatBonus } from "./equipment.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
} from "./identifiers.js";
import { createSeededRandomSource } from "./random-source.js";

function equipmentDefinition(
  id: string,
  slot: EquipmentSlot,
  bonus: number,
  hands?: 1 | 2,
): CardDefinition {
  return {
    id: parseCardDefinitionId(id),
    name: id,
    description: `${id} equipment`,
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: bonus }],
    equipment: { slot, ...(hands === undefined ? {} : { hands }) },
  };
}

function instance(id: string): CardInstance {
  return {
    instanceId: parseCardInstanceId(`${id}-1`),
    definitionId: parseCardDefinitionId(id),
  };
}

const sword = equipmentDefinition("sword", EquipmentSlot.HANDS, 2, 1);
const shield = equipmentDefinition("shield", EquipmentSlot.HANDS, 1, 1);
const greatSword = equipmentDefinition(
  "great-sword",
  EquipmentSlot.HANDS,
  4,
  2,
);
const helmet = equipmentDefinition("helmet", EquipmentSlot.HEAD, 1);
const otherHelmet = equipmentDefinition("other-helmet", EquipmentSlot.HEAD, 2);
const trinket: CardDefinition = {
  id: parseCardDefinitionId("trinket"),
  name: "Trinket",
  description: "Not equipment",
  type: CardType.OTHER,
  deck: DeckType.TREASURE,
  effects: [],
};
const playerId = parsePlayerId("ada");
const random = createSeededRandomSource(1);

function stateWith(
  hand: readonly CardInstance[],
  equipment: readonly CardInstance[] = [],
  phase: GamePhase = GamePhase.TURN_START,
): GameState {
  return {
    schemaVersion: 3,
    id: parseGameId("equipment-game"),
    status: GameStatus.IN_PROGRESS,
    phase,
    players: [
      {
        id: playerId,
        name: "Ada",
        level: 3,
        hand,
        equipment,
        temporaryCombatBonus: 2,
      },
    ],
    activePlayerId: playerId,
    cardDefinitions: [sword, shield, greatSword, helmet, otherHelmet, trinket],
    doorDeck: [],
    treasureDeck: [],
    doorDiscard: [],
    treasureDiscard: [],
    combat: null,
    lastRunAwayResult: null,
    pendingDecision: null,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
  };
}

describe("equipment rules", () => {
  it("equips an owned item and emits a public event", () => {
    const card = instance("sword");
    const result = executeCommand(
      stateWith([card]),
      { type: "EQUIP_ITEM", actorId: playerId, cardId: card.instanceId },
      { random },
    );

    expect(result.success).toBe(true);
    expect(result.state.players[0]).toMatchObject({
      hand: [],
      equipment: [card],
    });
    expect(result.events).toEqual([
      {
        type: "ITEM_EQUIPPED",
        visibility: "PUBLIC",
        playerId,
        cardId: card.instanceId,
        definitionId: card.definitionId,
      },
    ]);
  });

  it("unequips an item back to the private hand", () => {
    const card = instance("helmet");
    const result = executeCommand(
      stateWith([], [card]),
      { type: "UNEQUIP_ITEM", actorId: playerId, cardId: card.instanceId },
      { random },
    );

    expect(result.success).toBe(true);
    expect(result.state.players[0]).toMatchObject({
      hand: [card],
      equipment: [],
    });
    expect(result.events[0]).toMatchObject({
      type: "ITEM_UNEQUIPPED",
      visibility: "PUBLIC",
    });
  });

  it("rejects non-equipment and cards outside the expected zone atomically", () => {
    const card = instance("trinket");
    const state = stateWith([card]);
    const wrongType = executeCommand(
      state,
      { type: "EQUIP_ITEM", actorId: playerId, cardId: card.instanceId },
      { random },
    );
    const notEquipped = executeCommand(
      state,
      { type: "UNEQUIP_ITEM", actorId: playerId, cardId: card.instanceId },
      { random },
    );

    expect(wrongType).toMatchObject({
      success: false,
      state,
      error: { code: "CARD_NOT_EQUIPMENT" },
    });
    expect(notEquipped).toMatchObject({
      success: false,
      state,
      error: { code: "CARD_NOT_EQUIPPED" },
    });
  });

  it("enforces one item per body slot", () => {
    const candidate = instance("other-helmet");
    const state = stateWith([candidate], [instance("helmet")]);
    const result = executeCommand(
      state,
      { type: "EQUIP_ITEM", actorId: playerId, cardId: candidate.instanceId },
      { random },
    );

    expect(result).toMatchObject({
      success: false,
      state,
      error: { code: "EQUIPMENT_SLOT_OCCUPIED" },
    });
  });

  it("allows two one-handed items but rejects a third hand or a two-handed item", () => {
    const swordCard = instance("sword");
    const shieldCard = instance("shield");
    const greatSwordCard = instance("great-sword");
    const fullHands = stateWith([greatSwordCard], [swordCard, shieldCard]);
    const result = executeCommand(
      fullHands,
      {
        type: "EQUIP_ITEM",
        actorId: playerId,
        cardId: greatSwordCard.instanceId,
      },
      { random },
    );

    expect(result).toMatchObject({
      success: false,
      state: fullHands,
      error: { code: "NOT_ENOUGH_FREE_HANDS" },
    });
  });

  it("rejects equipment changes outside the active player's safe phases", () => {
    const card = instance("sword");
    const state = stateWith([card], [], GamePhase.DOOR_RESOLUTION);
    const result = executeCommand(
      state,
      { type: "EQUIP_ITEM", actorId: playerId, cardId: card.instanceId },
      { random },
    );

    expect(result).toMatchObject({
      success: false,
      state,
      error: { code: "INVALID_PHASE" },
    });
  });

  it("derives equipment bonus and total combat power from authoritative state", () => {
    const state = stateWith([], [instance("sword"), instance("helmet")]);
    const player = state.players[0];
    if (player === undefined) throw new Error("Missing test player.");

    expect(equipmentCombatBonus(state, player)).toBe(3);
    expect(calculateCombatPower(state, playerId)).toBe(8);
  });
});
