import { describe, expect, it } from "vitest";
import {
  CardType,
  DeckType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import { executeCommand, HAND_LIMIT } from "./engine.js";
import {
  GamePhase,
  GameStatus,
  type GameState,
  type PlayerState,
} from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
} from "./identifiers.js";

const adaId = parsePlayerId("ada");
const bobId = parsePlayerId("bob");
const random = { nextInt: () => 0 };

function definition(
  input: Omit<CardDefinition, "id"> & { id: string },
): CardDefinition {
  return { ...input, id: parseCardDefinitionId(input.id) };
}

const role = definition({
  id: "echo-class",
  name: "Echo",
  description: "Class",
  type: CardType.CLASS,
  deck: DeckType.DOOR,
  effects: [],
});
const race = definition({
  id: "lantern-race",
  name: "Lantern",
  description: "Race",
  type: CardType.RACE,
  deck: DeckType.DOOR,
  effects: [],
});
const item = definition({
  id: "echo-blade",
  name: "Echo blade",
  description: "Restricted",
  type: CardType.EQUIPMENT,
  deck: DeckType.TREASURE,
  effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  equipment: {
    slot: EquipmentSlot.HANDS,
    hands: 1,
    value: 1000,
    requiredClass: role.id,
  },
});
const cheap = definition({
  id: "cheap-hat",
  name: "Hat",
  description: "Cheap",
  type: CardType.EQUIPMENT,
  deck: DeckType.TREASURE,
  effects: [],
  equipment: { slot: EquipmentSlot.HEAD, value: 400 },
});
const curse = definition({
  id: "role-curse",
  name: "Role curse",
  description: "Lose class",
  type: CardType.CURSE,
  deck: DeckType.DOOR,
  effects: [{ type: "DISCARD_ROLE", role: "CLASS" }],
});
const fatalMonster = definition({
  id: "fatal",
  name: "Fatal",
  description: "Fatal",
  type: CardType.MONSTER,
  deck: DeckType.DOOR,
  effects: [],
  monster: {
    level: 20,
    levelRewards: 1,
    treasureRewards: 1,
    badStuff: [{ type: "DEATH" }],
  },
});

function card(id: string, definitionId: CardDefinition["id"]): CardInstance {
  return { instanceId: parseCardInstanceId(id), definitionId };
}

function player(
  id: typeof adaId,
  level: number,
  hand: readonly CardInstance[],
): PlayerState {
  return {
    id,
    name: id,
    level,
    hand,
    equipment: [],
    classCard: null,
    raceCard: null,
    isDead: false,
    temporaryCombatBonus: 0,
  };
}

function state(players: readonly PlayerState[]): GameState {
  return {
    schemaVersion: 3,
    id: parseGameId("expanded"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.TURN_START,
    players,
    activePlayerId: adaId,
    cardDefinitions: [role, race, item, cheap, curse, fatalMonster],
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

describe("expanded rules", () => {
  it("plays a typed Curse from hand against a validated player target", () => {
    const curseCard = card("curse-1", curse.id);
    const roleCard = card("role-target", role.id);
    const target = { ...player(bobId, 2, []), classCard: roleCard };
    const initial = state([player(adaId, 1, [curseCard]), target]);
    const result = executeCommand(
      initial,
      {
        type: "PLAY_CARD",
        actorId: adaId,
        cardId: curseCard.instanceId,
        target: { type: "PLAYER", playerId: bobId },
      },
      { random },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.state.players[1]?.classCard).toBeNull();
      expect(result.state.doorDiscard).toEqual(
        expect.arrayContaining([curseCard, roleCard]),
      );
    }
  });

  it("plays classes and enforces typed equipment restrictions", () => {
    const roleCard = card("role-1", role.id);
    const itemCard = card("item-1", item.id);
    const initial = state([
      player(adaId, 1, [roleCard, itemCard]),
      player(bobId, 1, []),
    ]);
    const blocked = executeCommand(
      initial,
      { type: "EQUIP_ITEM", actorId: adaId, cardId: itemCard.instanceId },
      { random },
    );
    expect(blocked.success).toBe(false);
    if (!blocked.success) expect(blocked.error.code).toBe("CLASS_REQUIRED");

    const roleResult = executeCommand(
      initial,
      { type: "PLAY_ROLE", actorId: adaId, cardId: roleCard.instanceId },
      { random },
    );
    expect(roleResult.success).toBe(true);
    if (!roleResult.success) return;
    expect(roleResult.state.players[0]?.classCard).toEqual(roleCard);
    expect(
      executeCommand(
        roleResult.state,
        { type: "EQUIP_ITEM", actorId: adaId, cardId: itemCard.instanceId },
        { random },
      ).success,
    ).toBe(true);
  });

  it("sells enough item value for engine-calculated levels and rejects too little", () => {
    const valuable = card("item-2", item.id);
    const cheapCard = card("cheap-1", cheap.id);
    const initial = state([
      player(adaId, 2, [valuable, cheapCard]),
      player(bobId, 1, []),
    ]);
    const rejected = executeCommand(
      initial,
      { type: "SELL_ITEMS", actorId: adaId, cardIds: [cheapCard.instanceId] },
      { random },
    );
    expect(rejected.success).toBe(false);
    const sold = executeCommand(
      initial,
      { type: "SELL_ITEMS", actorId: adaId, cardIds: [valuable.instanceId] },
      { random },
    );
    expect(sold.success).toBe(true);
    if (sold.success) expect(sold.state.players[0]?.level).toBe(3);

    const winningSale = executeCommand(
      state([player(adaId, 9, [valuable]), player(bobId, 1, [])]),
      { type: "SELL_ITEMS", actorId: adaId, cardIds: [valuable.instanceId] },
      { random },
    );
    expect(winningSale).toMatchObject({
      success: true,
      state: {
        status: GameStatus.FINISHED,
        phase: GamePhase.FINISHED,
        winnerId: adaId,
      },
    });
  });

  it("trades only owned equipment to another player's private hand", () => {
    const itemCard = card("item-3", item.id);
    const initial = state([player(adaId, 1, [itemCard]), player(bobId, 1, [])]);
    const traded = executeCommand(
      initial,
      {
        type: "TRADE_ITEM",
        actorId: adaId,
        cardId: itemCard.instanceId,
        recipientId: bobId,
      },
      { random },
    );
    expect(traded.success).toBe(true);
    if (traded.success)
      expect(traded.state.players[1]?.hand).toEqual([itemCard]);
    expect(
      executeCommand(
        initial,
        {
          type: "TRADE_ITEM",
          actorId: adaId,
          cardId: itemCard.instanceId,
          recipientId: adaId,
        },
        { random },
      ).success,
    ).toBe(false);

    const outOfTurnItem = card("item-4", item.id);
    const outOfTurnState = state([
      player(adaId, 1, []),
      player(bobId, 1, [outOfTurnItem]),
    ]);
    expect(
      executeCommand(
        outOfTurnState,
        {
          type: "TRADE_ITEM",
          actorId: bobId,
          cardId: outOfTurnItem.instanceId,
          recipientId: adaId,
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      state: outOfTurnState,
      error: { code: "INVALID_PHASE" },
    });
  });

  it("gives exact excess charity to a lowest-level player", () => {
    const cards = Array.from({ length: HAND_LIMIT + 2 }, (_, index) =>
      card(`cheap-${index}`, cheap.id),
    );
    const initial = {
      ...state([player(adaId, 3, cards), player(bobId, 1, [])]),
      phase: GamePhase.END_TURN,
    };
    const given = executeCommand(
      initial,
      {
        type: "GIVE_CHARITY",
        actorId: adaId,
        cardIds: cards.slice(0, 2).map((entry) => entry.instanceId),
        recipientId: bobId,
      },
      { random },
    );
    expect(given.success).toBe(true);
    if (given.success) {
      expect(given.state.players[0]?.hand).toHaveLength(HAND_LIMIT);
      expect(given.state.players[1]?.hand).toHaveLength(2);
    }
  });

  it("lets the engine choose random excess charity cards", () => {
    const cards = Array.from({ length: HAND_LIMIT + 2 }, (_, index) =>
      card(`random-charity-${index}`, cheap.id),
    );
    const initial = {
      ...state([player(adaId, 3, cards), player(bobId, 1, [])]),
      phase: GamePhase.END_TURN,
    };
    const given = executeCommand(
      initial,
      { type: "GIVE_RANDOM_CHARITY", actorId: adaId },
      { random },
    );
    expect(given.success).toBe(true);
    if (given.success) {
      expect(given.state.players[0]?.hand).toHaveLength(HAND_LIMIT);
      expect(given.state.players[1]?.hand).toEqual(cards.slice(0, 2));
    }
  });

  it("applies death, discards possessions, and marks the player for revival", () => {
    const roleCard = card("role-death", role.id);
    const monsterCard = card("monster-death", fatalMonster.id);
    const initialPlayer = {
      ...player(adaId, 4, [card("cheap-death", cheap.id)]),
      classCard: roleCard,
    };
    const initial: GameState = {
      ...state([initialPlayer, player(bobId, 1, [])]),
      phase: GamePhase.DOOR_RESOLUTION,
      combat: {
        playerId: adaId,
        monster: monsterCard,
        monsterBonus: 0,
        requestedHelperId: null,
        helperId: null,
        history: [],
      },
    };
    const result = executeCommand(
      initial,
      { type: "RUN_AWAY", actorId: adaId },
      { random },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.state.players[0]).toMatchObject({
        isDead: true,
        hand: [],
        equipment: [],
        classCard: null,
        level: 4,
      });
      expect(result.events.some((event) => event.type === "PLAYER_DIED")).toBe(
        true,
      );
    }
  });
});
