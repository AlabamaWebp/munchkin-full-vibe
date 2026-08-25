import { describe, expect, it } from "vitest";
import {
  CardType,
  DeckType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import { HAND_LIMIT } from "./engine.js";
import { executeCommand } from "./legacy-test-command.js";
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
  parseEncounterId,
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
const otherRole = definition({
  id: "signal-class",
  name: "Signal",
  description: "Class",
  type: CardType.CLASS,
  deck: DeckType.DOOR,
  effects: [],
});
const otherRace = definition({
  id: "copper-race",
  name: "Copper",
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
  goldValue: 1000,
  effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  equipment: {
    slot: EquipmentSlot.HANDS,
    hands: 1,
    restrictions: [{ type: "CLASS", definitionId: role.id }],
  },
});
const cheap = definition({
  id: "cheap-hat",
  name: "Hat",
  description: "Cheap",
  type: CardType.EQUIPMENT,
  deck: DeckType.TREASURE,
  goldValue: 400,
  effects: [],
  equipment: { slot: EquipmentSlot.HEAD },
});
const classHelm = definition({
  id: "echo-helm",
  name: "Echo helm",
  description: "Restricted",
  type: CardType.EQUIPMENT,
  deck: DeckType.TREASURE,
  goldValue: 400,
  effects: [],
  equipment: {
    slot: EquipmentSlot.HEAD,
    hands: 0,
    restrictions: [{ type: "CLASS", definitionId: role.id }],
  },
});
const raceBoots = definition({
  id: "lantern-boots",
  name: "Lantern boots",
  description: "Restricted",
  type: CardType.EQUIPMENT,
  deck: DeckType.TREASURE,
  goldValue: 400,
  effects: [],
  equipment: {
    slot: EquipmentSlot.FEET,
    hands: 0,
    restrictions: [{ type: "RACE", definitionId: race.id }],
  },
});
const curse = definition({
  id: "role-curse",
  name: "Role curse",
  description: "Lose class",
  type: CardType.CURSE,
  deck: DeckType.DOOR,
  effects: [{ type: "DISCARD_ROLE", role: "CLASS" }],
});
const raceCurse = definition({
  id: "race-curse",
  name: "Race curse",
  description: "Lose race",
  type: CardType.CURSE,
  deck: DeckType.DOOR,
  effects: [{ type: "DISCARD_ROLE", role: "RACE" }],
});
const fatalMonster = definition({
  id: "fatal",
  name: "Fatal",
  description: "Fatal",
  type: CardType.MONSTER,
  deck: DeckType.DOOR,
  effects: [],
  monster: {
    strength: 20,
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
    sex: "MALE",
    level,
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

function state(players: readonly PlayerState[]): GameState {
  return {
    schemaVersion: 5,
    config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
    id: parseGameId("expanded"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.TURN_START,
    players,
    activePlayerId: adaId,
    cardDefinitions: [
      role,
      otherRole,
      race,
      otherRace,
      item,
      classHelm,
      raceBoots,
      cheap,
      curse,
      raceCurse,
      fatalMonster,
    ],
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
  };
}

describe("expanded rules", () => {
  it("plays a typed Curse from hand against a validated player target", () => {
    const curseCard = card("curse-1", curse.id);
    const roleCard = card("role-target", role.id);
    const target = { ...player(bobId, 2, []), classCards: [roleCard] };
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
      expect(result.state.players[1]?.classCards).toEqual([]);
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
    expect(roleResult.state.players[0]?.classCards).toEqual([roleCard]);
    expect(
      executeCommand(
        roleResult.state,
        { type: "EQUIP_ITEM", actorId: adaId, cardId: itemCard.instanceId },
        { random },
      ).success,
    ).toBe(true);
  });

  it("discards an active race through the authoritative role command", () => {
    const raceCard = card("race-1", race.id);
    const initial = state([player(adaId, 1, [raceCard]), player(bobId, 1, [])]);
    const played = executeCommand(
      initial,
      { type: "PLAY_ROLE", actorId: adaId, cardId: raceCard.instanceId },
      { random },
    );
    expect(played.success).toBe(true);
    if (!played.success) return;

    const discarded = executeCommand(
      played.state,
      { type: "DISCARD_ROLE", actorId: adaId, cardId: raceCard.instanceId },
      { random },
    );
    expect(discarded.success).toBe(true);
    if (!discarded.success) return;
    expect(discarded.state.players[0]?.raceCards).toEqual([]);
    expect(discarded.state.doorDiscard).toEqual(
      expect.arrayContaining([raceCard]),
    );
    expect(discarded.events).toContainEqual(
      expect.objectContaining({
        type: "ROLE_DISCARDED",
        role: "RACE",
        cardId: raceCard.instanceId,
      }),
    );
  });

  it("revalidates and publicly unequips every incompatible item after a class replacement", () => {
    const replacement = card("replacement-class", otherRole.id);
    const blade = card("equipped-blade", item.id);
    const helm = card("equipped-helm", classHelm.id);
    const currentRole = card("current-class", role.id);
    const initialPlayer = {
      ...player(adaId, 2, [replacement]),
      classCards: [currentRole],
      equipment: [blade, helm],
    };

    const result = executeCommand(
      state([initialPlayer, player(bobId, 1, [])]),
      {
        type: "PLAY_ROLE",
        actorId: adaId,
        cardId: replacement.instanceId,
        replaceCardId: currentRole.instanceId,
      },
      { random },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.players[0]?.equipment).toEqual([]);
    expect(result.state.players[0]?.hand).toEqual([blade, helm]);
    expect(
      result.events.filter((event) => event.type === "ITEM_UNEQUIPPED"),
    ).toEqual([
      expect.objectContaining({
        visibility: "PUBLIC",
        cardId: blade.instanceId,
      }),
      expect.objectContaining({
        visibility: "PUBLIC",
        cardId: helm.instanceId,
      }),
    ]);
  });

  it("revalidates race equipment after a DISCARD_ROLE Curse", () => {
    const curseCard = card("race-curse-card", raceCurse.id);
    const raceCard = card("current-race", race.id);
    const boots = card("equipped-boots", raceBoots.id);
    const target = {
      ...player(bobId, 2, []),
      raceCards: [raceCard],
      equipment: [boots],
    };

    const result = executeCommand(
      state([player(adaId, 1, [curseCard]), target]),
      {
        type: "PLAY_CARD",
        actorId: adaId,
        cardId: curseCard.instanceId,
        target: { type: "PLAYER", playerId: bobId },
      },
      { random },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.players[1]).toMatchObject({
      raceCards: [],
      equipment: [],
      hand: [boots],
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "ITEM_UNEQUIPPED",
        visibility: "PUBLIC",
        playerId: bobId,
        cardId: boots.instanceId,
      }),
    );
  });

  it("sells enough item value for engine-calculated levels and rejects too little", () => {
    const valuable = card("item-2", item.id);
    const cheapCard = card("cheap-1", cheap.id);
    const initial = {
      ...state([player(adaId, 2, [valuable, cheapCard]), player(bobId, 1, [])]),
      phase: GamePhase.END_TURN,
    };
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
      {
        ...state([player(adaId, 9, [valuable]), player(bobId, 1, [])]),
        phase: GamePhase.END_TURN,
      },
      { type: "SELL_ITEMS", actorId: adaId, cardIds: [valuable.instanceId] },
      { random },
    );
    expect(winningSale).toMatchObject({
      success: false,
      state: expect.objectContaining({
        status: GameStatus.IN_PROGRESS,
        winnerId: null,
      }),
      error: { code: "SALE_LEVEL_LIMIT" },
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
      expect(given.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "CHARITY_RESOLVED",
            visibility: "PUBLIC",
            count: 2,
          }),
          expect.objectContaining({
            type: "CHARITY_CARDS_REVEALED",
            visibility: "PRIVATE",
            recipientPlayerId: adaId,
            cardIds: cards.slice(0, 2).map((entry) => entry.instanceId),
          }),
          expect.objectContaining({
            type: "CHARITY_CARDS_REVEALED",
            visibility: "PRIVATE",
            recipientPlayerId: bobId,
            cardIds: cards.slice(0, 2).map((entry) => entry.instanceId),
          }),
        ]),
      );
    }
  });

  it("rejects the wrong charity count and a non-minimum-level recipient atomically", () => {
    const cards = Array.from({ length: HAND_LIMIT + 2 }, (_, index) =>
      card(`invalid-charity-${index}`, cheap.id),
    );
    const caraId = parsePlayerId("cara");
    const initial = {
      ...state([
        player(adaId, 4, cards),
        player(bobId, 1, []),
        player(caraId as typeof adaId, 2, []),
      ]),
      phase: GamePhase.END_TURN,
    };
    const wrongCount = executeCommand(
      initial,
      {
        type: "GIVE_CHARITY",
        actorId: adaId,
        cardIds: [cards[0]!.instanceId],
        recipientId: bobId,
      },
      { random },
    );
    expect(wrongCount).toMatchObject({
      success: false,
      state: initial,
      events: [],
    });
    const wrongRecipient = executeCommand(
      initial,
      {
        type: "GIVE_CHARITY",
        actorId: adaId,
        cardIds: cards.slice(0, 2).map((entry) => entry.instanceId),
        recipientId: caraId,
      },
      { random },
    );
    expect(wrongRecipient).toMatchObject({
      success: false,
      state: initial,
      events: [],
      error: { code: "INVALID_RECIPIENT" },
    });
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
      expect(given.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "CHARITY_CARDS_REVEALED",
            recipientPlayerId: adaId,
            cardIds: cards.slice(0, 2).map((entry) => entry.instanceId),
          }),
          expect.objectContaining({
            type: "CHARITY_CARDS_REVEALED",
            recipientPlayerId: bobId,
            cardIds: cards.slice(0, 2).map((entry) => entry.instanceId),
          }),
        ]),
      );
    }
  });

  it("discards selected charity when the actor is tied for minimum level", () => {
    const cards = Array.from({ length: HAND_LIMIT + 1 }, (_, index) =>
      card(`discard-charity-${index}`, cheap.id),
    );
    const selected = cards[0]!;
    const initial = {
      ...state([player(adaId, 1, cards), player(bobId, 1, [])]),
      phase: GamePhase.END_TURN,
    };
    const result = executeCommand(
      initial,
      {
        type: "GIVE_CHARITY",
        actorId: adaId,
        cardIds: [selected.instanceId],
        recipientId: null,
      },
      { random },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.treasureDiscard).toContainEqual(selected);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "CHARITY_CARDS_REVEALED",
        recipientPlayerId: adaId,
        recipientId: null,
        cardIds: [selected.instanceId],
      }),
    );
    expect(
      result.events.filter((event) => event.type === "CHARITY_CARDS_REVEALED"),
    ).toHaveLength(1);
  });

  it("applies death, discards possessions, and marks the player for revival", () => {
    const roleCard = card("role-death", role.id);
    const monsterCard = card("monster-death", fatalMonster.id);
    const initialPlayer = {
      ...player(adaId, 4, [card("cheap-death", cheap.id)]),
      classCards: [roleCard],
    };
    const initial: GameState = {
      ...state([initialPlayer, player(bobId, 1, [])]),
      phase: GamePhase.DOOR_RESOLUTION,
      combat: {
        playerId: adaId,
        revision: 1,
        monsters: [
          {
            encounterId: parseEncounterId("encounter-1"),
            monster: monsterCard,
            sourceCard: monsterCard,
            clonedFromEncounterId: null,
            baseStrength: 30,
            baseLevelRewards: 1,
            baseTreasureRewards: 0,
            tier: 3,
            tags: [],
            badStuff: fatalMonster.monster!.badStuff,
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
        runAway: null,
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
        classCards: [],
        level: 4,
      });
      expect(result.events.some((event) => event.type === "PLAYER_DIED")).toBe(
        true,
      );
    }
  });
});
