import { describe, expect, it, vi } from "vitest";
import {
  CardPlayTarget,
  CardPlayTiming,
  CardSetId,
  CardType,
  DeckType,
  EquipmentSlot,
  GameMode,
  GamePhase,
  GameStatus,
  capacityFor,
  createDevelopmentCardSet,
  createGame,
  createSeededRandomSource,
  executeCommand,
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
  type RandomSource,
} from "./index.js";

const actorId = parsePlayerId("actor");
const victimId = parsePlayerId("victim");
const otherId = parsePlayerId("other");

function definition(
  value: string,
  overrides: Partial<CardDefinition>,
): CardDefinition {
  return {
    id: parseCardDefinitionId(value),
    artKey: `test.${value}`,
    setId: CardSetId.CORE,
    tier: 1,
    name: value,
    description: `${value} description`,
    type: CardType.UTILITY,
    deck: DeckType.TREASURE,
    tags: [],
    play: { timings: [CardPlayTiming.TURN], target: CardPlayTarget.SELF },
    effects: [],
    ...overrides,
  };
}

function card(value: string, entry: CardDefinition): CardInstance {
  return {
    instanceId: parseCardInstanceId(value),
    definitionId: entry.id,
  };
}

function player(
  id: typeof actorId,
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
    hirelingCards: [],
    mountCards: [],
    isDead: false,
    activeEffects: [],
    abilityUsages: [],
    ...overrides,
  };
}

function state(
  definitions: readonly CardDefinition[],
  players: readonly PlayerState[],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    schemaVersion: 5,
    config: {
      mode: GameMode.CLASSIC_CHAOS,
      enabledSetIds: [CardSetId.CORE],
      maxHandSize: 5,
      doubleMonsterAmbushEnabled: false,
    },
    id: parseGameId("foundations"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.END_TURN,
    players,
    activePlayerId: actorId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: [],
    doorDiscard: [],
    treasureDiscard: [],
    combat: null,
    nextCombatSequence: 1,
    lastRunAwayResult: null,
    pendingDecision: null,
    curseResponse: null,
    nextCurseResponseSequence: 1,
    nextPendingDecisionSequence: 1,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
    ...overrides,
  };
}

function fixedRandom(value: number): RandomSource {
  return {
    nextInt(maxExclusive): number {
      if (value >= maxExclusive) throw new RangeError("bad test random");
      return value;
    },
  };
}

describe("authoritative next-pass foundations", () => {
  const item = definition("public-item", {
    type: CardType.EQUIPMENT,
    equipment: { slot: EquipmentSlot.HEAD, hands: 0, combatBonus: 3 },
  });
  const costDefinition = definition("ability-cost", {});
  const thiefRole = definition("quiet-acquisition", {
    type: CardType.CLASS,
    deck: DeckType.DOOR,
    role: {
      role: "CLASS",
      activeAbility: {
        type: "STEAL_EQUIPPED_ITEM",
        target: "EQUIPMENT",
        successChance: { numerator: 1, denominator: 6 },
        cost: { type: "DISCARD_HAND", count: 1 },
        usage: "ONCE_PER_TURN",
      },
    },
  });

  it("validates and snapshots lobby gameplay config, including optional ambush content", () => {
    expect(
      createGame({ id: parseGameId("default-config") }).config,
    ).toMatchObject({ maxHandSize: 5, doubleMonsterAmbushEnabled: false });
    expect(
      createGame({ id: parseGameId("default-config") }).cardDefinitions.some(
        (entry) => entry.requiredGameOption === "DOUBLE_MONSTER_AMBUSH",
      ),
    ).toBe(false);
    expect(
      createGame({
        id: parseGameId("ambush-config"),
        config: {
          mode: GameMode.BALANCED,
          enabledSetIds: [CardSetId.CORE],
          maxHandSize: 7,
          doubleMonsterAmbushEnabled: true,
        },
      }).cardDefinitions.some(
        (entry) => entry.requiredGameOption === "DOUBLE_MONSTER_AMBUSH",
      ),
    ).toBe(true);
    for (const maxHandSize of [2, 11])
      expect(() =>
        createGame({
          id: parseGameId(`invalid-hand-${maxHandSize}`),
          config: {
            mode: GameMode.BALANCED,
            enabledSetIds: [CardSetId.CORE],
            maxHandSize,
            doubleMonsterAmbushEnabled: false,
          },
        }),
      ).toThrow(/Maximum hand size/);
  });

  it("keeps the authored one-in-six theft tuning deterministic under seeded sampling", () => {
    const authored = createDevelopmentCardSet()
      .definitions.map((entry) => entry.role?.activeAbility)
      .find((ability) => ability?.type === "STEAL_EQUIPPED_ITEM");
    expect(authored).toMatchObject({
      type: "STEAL_EQUIPPED_ITEM",
      successChance: { numerator: 1, denominator: 6 },
      usage: "ONCE_PER_TURN",
    });
    if (authored?.type !== "STEAL_EQUIPPED_ITEM") return;
    const random = createSeededRandomSource(20260825);
    let successes = 0;
    for (let attempt = 0; attempt < 600; attempt += 1)
      if (
        random.nextInt(authored.successChance.denominator) <
        authored.successChance.numerator
      )
        successes += 1;
    expect(successes).toBe(114);
  });

  it("consumes a failed low-chance equipped theft and persists its once-per-turn usage", () => {
    const roleCard = card("role-1", thiefRole);
    const cost = card("cost-1", costDefinition);
    const target = card("item-1", item);
    const initial = state(
      [item, costDefinition, thiefRole],
      [
        player(actorId, { hand: [cost], classCards: [roleCard] }),
        player(victimId, { equipment: [target] }),
      ],
    );
    const failed = executeCommand(
      initial,
      {
        type: "USE_ROLE_ABILITY",
        actorId,
        roleCardId: roleCard.instanceId,
        costCardIds: [cost.instanceId],
        target: { type: "EQUIPMENT", cardId: target.instanceId },
      },
      { random: fixedRandom(5) },
    );
    expect(failed).toMatchObject({
      success: true,
      state: {
        players: [
          {
            hand: [],
            abilityUsages: [{ scope: { type: "TURN", turnNumber: 1 } }],
          },
          { equipment: [target] },
        ],
      },
      events: [{ type: "EQUIPPED_ITEM_THEFT_ATTEMPTED", succeeded: false }],
    });
    if (!failed.success) return;
    const reconnected = JSON.parse(JSON.stringify(failed.state)) as GameState;
    expect(reconnected.players[0]?.abilityUsages).toHaveLength(1);
    const random = { nextInt: vi.fn(() => 0) };
    expect(
      executeCommand(
        {
          ...reconnected,
          players: reconnected.players.map((entry) =>
            entry.id === actorId ? { ...entry, hand: [cost] } : entry,
          ),
        },
        {
          type: "USE_ROLE_ABILITY",
          actorId,
          roleCardId: roleCard.instanceId,
          costCardIds: [cost.instanceId],
          target: { type: "EQUIPMENT", cardId: target.instanceId },
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      error: { code: "COMMAND_NOT_AVAILABLE" },
    });
    expect(random.nextInt).not.toHaveBeenCalled();
  });

  it("moves the exact equipped physical card on success and returns its attachment to the victim", () => {
    const attachmentDefinition = definition("attachment", {
      type: CardType.ATTACHMENT,
      attachment: { allowedTags: [], combatBonus: 2 },
    });
    const roleCard = card("role-2", thiefRole);
    const cost = card("cost-2", costDefinition);
    const target = card("item-2", item);
    const attachment = card("attachment-1", attachmentDefinition);
    const result = executeCommand(
      state(
        [item, costDefinition, thiefRole, attachmentDefinition],
        [
          player(actorId, { hand: [cost], classCards: [roleCard] }),
          player(victimId, {
            equipment: [target],
            equipmentAttachments: [
              { card: attachment, attachedToCardId: target.instanceId },
            ],
          }),
        ],
      ),
      {
        type: "USE_ROLE_ABILITY",
        actorId,
        roleCardId: roleCard.instanceId,
        costCardIds: [cost.instanceId],
        target: { type: "EQUIPMENT", cardId: target.instanceId },
      },
      { random: fixedRandom(0) },
    );
    expect(result).toMatchObject({
      success: true,
      state: {
        players: [
          { hand: [target] },
          { hand: [attachment], equipment: [], equipmentAttachments: [] },
        ],
      },
      events: [{ type: "EQUIPPED_ITEM_THEFT_ATTEMPTED", succeeded: true }],
    });
  });

  it("steals a bounded engine-random hidden hand card without publishing candidate identities", () => {
    const theft = definition("wrong-pocket", {
      effects: [{ type: "STEAL_RANDOM_HAND_CARD" }],
      play: {
        timings: [CardPlayTiming.TURN],
        target: CardPlayTarget.ANY_PLAYER,
      },
    });
    const theftCard = card("theft-1", theft);
    const first = card("hidden-1", costDefinition);
    const selected = card("hidden-2", costDefinition);
    const result = executeCommand(
      state(
        [theft, costDefinition],
        [
          player(actorId, { hand: [theftCard] }),
          player(victimId, { hand: [first, selected] }),
        ],
      ),
      {
        type: "PLAY_CARD",
        actorId,
        cardId: theftCard.instanceId,
        target: { type: "PLAYER", playerId: victimId },
      },
      { random: fixedRandom(1) },
    );
    expect(result).toMatchObject({
      success: true,
      state: { players: [{ hand: [selected] }, { hand: [first] }] },
    });
    if (!result.success) return;
    const publicTheft = result.events.find(
      (event) => event.type === "RANDOM_HAND_THEFT",
    );
    expect(JSON.stringify(publicTheft)).not.toContain(selected.instanceId);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "STOLEN_HAND_CARD_REVEALED",
        visibility: "PRIVATE",
        recipientPlayerId: victimId,
        cardId: selected.instanceId,
      }),
    );
  });

  it("revalidates Head, Hands, Hireling, and Mount capacity from typed public-card modifiers", () => {
    const provider = definition("capacity-provider", {
      type: CardType.EQUIPMENT,
      equipment: { slot: EquipmentSlot.BODY, hands: 0, combatBonus: 0 },
      capacityModifiers: [
        { capacity: "HEAD", amount: 1 },
        { capacity: "HANDS", amount: 1 },
        { capacity: "HIRELING", amount: 1 },
        { capacity: "MOUNT", amount: 1 },
      ],
    });
    const handItem = definition("hand-item", {
      type: CardType.EQUIPMENT,
      equipment: { slot: EquipmentSlot.HANDS, hands: 1, combatBonus: 1 },
    });
    const hireling = definition("capacity-hireling", {
      type: CardType.HIRELING,
      companion: { kind: "HIRELING", combatBonus: 1 },
    });
    const mount = definition("capacity-mount", {
      type: CardType.MOUNT,
      companion: { kind: "MOUNT", combatBonus: 1 },
    });
    const providerCard = card("provider-1", provider);
    const headOne = card("head-1", item);
    const headTwo = card("head-2", item);
    const hands = [1, 2, 3].map((index) => card(`hand-${index}`, handItem));
    const hirelings = [1, 2].map((index) =>
      card(`hireling-${index}`, hireling),
    );
    const mounts = [1, 2].map((index) => card(`mount-${index}`, mount));
    const owner = player(actorId, {
      equipment: [providerCard, headOne, headTwo, ...hands],
      hirelingCard: hirelings[0]!,
      mountCard: mounts[0]!,
      hirelingCards: hirelings,
      mountCards: mounts,
    });
    const capacityState = state(
      [provider, item, handItem, hireling, mount],
      [owner],
    );
    expect([
      capacityFor(capacityState, owner, "HEAD"),
      capacityFor(capacityState, owner, "HANDS"),
      capacityFor(capacityState, owner, "HIRELING"),
      capacityFor(capacityState, owner, "MOUNT"),
    ]).toEqual([2, 3, 2, 2]);
    const removed = executeCommand(
      capacityState,
      { type: "UNEQUIP_ITEM", actorId, cardId: providerCard.instanceId },
      { random: fixedRandom(0) },
    );
    expect(removed).toMatchObject({
      success: true,
      state: {
        players: [
          {
            equipment: [headOne, hands[0], hands[1]],
            hand: [providerCard, headTwo, hands[2], hirelings[1], mounts[1]],
            hirelingCards: [hirelings[0]],
            mountCards: [mounts[0]],
          },
        ],
      },
    });
    if (removed.success)
      expect(
        removed.events.filter((event) => event.type === "COMPANION_UNSLOTTED"),
      ).toHaveLength(2);
  });

  it("uses the snapshotted bounded hand limit for cleanup and charity", () => {
    const cards = [1, 2, 3, 4].map((index) =>
      card(`limit-${index}`, costDefinition),
    );
    const initial = state(
      [costDefinition],
      [player(actorId, { hand: cards }), player(victimId)],
      {
        config: {
          mode: GameMode.CLASSIC_CHAOS,
          enabledSetIds: [CardSetId.CORE],
          maxHandSize: 3,
          doubleMonsterAmbushEnabled: false,
        },
      },
    );
    expect(
      executeCommand(
        initial,
        { type: "END_TURN", actorId },
        { random: fixedRandom(0) },
      ),
    ).toMatchObject({ success: false, error: { code: "HAND_LIMIT_EXCEEDED" } });
    const charity = executeCommand(
      initial,
      {
        type: "GIVE_CHARITY",
        actorId,
        cardIds: [cards[0]!.instanceId],
        recipientId: null,
      },
      { random: fixedRandom(0) },
    );
    expect(charity.success).toBe(true);
    if (charity.success)
      expect(charity.state.players[0]?.hand).toEqual(cards.slice(1));
  });

  it("starts an atomic ordinary two-Monster ambush across recycled Door resources", () => {
    const ambush = definition("ambush", {
      deck: DeckType.DOOR,
      effects: [{ type: "AMBUSH_MONSTERS", count: 2 }],
      requiredGameOption: "DOUBLE_MONSTER_AMBUSH",
      play: {
        timings: [CardPlayTiming.WHEN_DRAWN],
        target: CardPlayTarget.SELF,
      },
    });
    const monster = (value: string) =>
      definition(value, {
        type: CardType.MONSTER,
        deck: DeckType.DOOR,
        monster: {
          strength: 2,
          levelRewards: 1,
          treasureRewards: 1,
          badStuff: [],
        },
      });
    const firstDefinition = monster("ambush-monster-1");
    const secondDefinition = monster("ambush-monster-2");
    const source = card("ambush-card", ambush);
    const first = card("ambush-first", firstDefinition);
    const second = card("ambush-second", secondDefinition);
    const initial = state(
      [ambush, firstDefinition, secondDefinition],
      [player(actorId), player(otherId)],
      {
        phase: GamePhase.TURN_START,
        config: {
          mode: GameMode.CLASSIC_CHAOS,
          enabledSetIds: [CardSetId.CORE],
          maxHandSize: 5,
          doubleMonsterAmbushEnabled: true,
        },
        doorDeck: [source, first],
        doorDiscard: [second],
      },
    );
    const result = executeCommand(
      initial,
      { type: "KICK_DOOR", actorId },
      { random: fixedRandom(0) },
    );
    expect(result).toMatchObject({
      success: true,
      state: {
        combat: { monsters: [{ monster: first }, { monster: second }] },
      },
    });
    if (!result.success) return;
    expect(
      new Set(
        result.state.combat?.monsters.map((entry) => entry.monster.instanceId),
      ).size,
    ).toBe(2);
    expect(result.state.doorDiscard).toContainEqual(source);
    expect(result.events.map((event) => event.type)).toContain(
      "DECK_RESHUFFLED",
    );

    const insufficient = { ...initial, doorDiscard: [] };
    expect(
      executeCommand(
        insufficient,
        { type: "KICK_DOOR", actorId },
        { random: fixedRandom(0) },
      ),
    ).toMatchObject({
      success: false,
      state: insufficient,
      events: [],
      error: { code: "INSUFFICIENT_CARDS" },
    });

    const blocker = card("ambush-non-monster", ambush);
    const blockedRecycle = {
      ...initial,
      doorDeck: [source, first, blocker],
      doorDiscard: [second],
    };
    expect(
      executeCommand(
        blockedRecycle,
        { type: "KICK_DOOR", actorId },
        { random: fixedRandom(0) },
      ),
    ).toMatchObject({
      success: false,
      state: blockedRecycle,
      events: [],
      error: { code: "INSUFFICIENT_CARDS" },
    });
  });

  it("keeps draw-only ambush Doors out of initial hands without removing them from Door resources", () => {
    const ambush = definition("opening-ambush", {
      deck: DeckType.DOOR,
      effects: [{ type: "AMBUSH_MONSTERS", count: 2 }],
      requiredGameOption: "DOUBLE_MONSTER_AMBUSH",
      play: {
        timings: [CardPlayTiming.WHEN_DRAWN],
        target: CardPlayTarget.SELF,
      },
    });
    const ordinaryDoor = definition("opening-door", { deck: DeckType.DOOR });
    const ordinaryTreasure = definition("opening-treasure", {});
    const ambushCard = card("opening-ambush-card", ambush);
    const opening = state(
      [ambush, ordinaryDoor, ordinaryTreasure],
      [player(actorId), player(victimId)],
      {
        status: GameStatus.LOBBY,
        phase: GamePhase.TURN_START,
        config: {
          mode: GameMode.CLASSIC_CHAOS,
          enabledSetIds: [CardSetId.CORE],
          maxHandSize: 5,
          doubleMonsterAmbushEnabled: true,
        },
        doorDeck: [
          ambushCard,
          ...Array.from({ length: 8 }, (_, index) =>
            card(`opening-door-${index}`, ordinaryDoor),
          ),
        ],
        treasureDeck: Array.from({ length: 8 }, (_, index) =>
          card(`opening-treasure-${index}`, ordinaryTreasure),
        ),
      },
    );
    const started = executeCommand(
      opening,
      { type: "START_GAME", actorId },
      { random: fixedRandom(0) },
    );
    expect(started.success).toBe(true);
    if (!started.success) return;
    expect(
      started.state.players.flatMap((entry) => entry.hand),
    ).not.toContainEqual(ambushCard);
    expect(started.state.doorDeck).toContainEqual(ambushCard);
  });

  it("caps ordinary level effects at nine, preserves exceptional eligibility, and gates post-Door sale/end", () => {
    const ordinary = definition("ordinary-level", {
      effects: [{ type: "GAIN_LEVEL", amount: 2 }],
    });
    const exceptional = definition("exceptional-level", {
      effects: [{ type: "GAIN_LEVEL", amount: 1, victoryEligible: true }],
    });
    const sale = definition("sale", { goldValue: 1000, sellable: true });
    const ordinaryCard = card("ordinary-card", ordinary);
    const exceptionalCard = card("exceptional-card", exceptional);
    const saleCard = card("sale-card", sale);
    const postDoor = state(
      [ordinary, exceptional, sale],
      [player(actorId, { level: 9, hand: [ordinaryCard, saleCard] })],
      { phase: GamePhase.POST_DOOR },
    );
    expect(
      executeCommand(
        postDoor,
        { type: "END_TURN", actorId },
        { random: fixedRandom(0) },
      ),
    ).toMatchObject({ success: false, error: { code: "INVALID_PHASE" } });
    expect(
      executeCommand(
        postDoor,
        { type: "SELL_ITEMS", actorId, cardIds: [saleCard.instanceId] },
        { random: fixedRandom(0) },
      ),
    ).toMatchObject({ success: false, error: { code: "INVALID_PHASE" } });
    const gained = executeCommand(
      postDoor,
      {
        type: "PLAY_CARD",
        actorId,
        cardId: ordinaryCard.instanceId,
        target: { type: "PLAYER", playerId: actorId },
      },
      { random: fixedRandom(0) },
    );
    expect(gained).toMatchObject({
      success: true,
      state: { status: GameStatus.IN_PROGRESS, players: [{ level: 9 }] },
    });

    const exceptionalState = state(
      [exceptional],
      [player(actorId, { level: 9, hand: [exceptionalCard] })],
    );
    expect(
      executeCommand(
        exceptionalState,
        {
          type: "PLAY_CARD",
          actorId,
          cardId: exceptionalCard.instanceId,
          target: { type: "PLAYER", playerId: actorId },
        },
        { random: fixedRandom(0) },
      ),
    ).toMatchObject({
      success: true,
      state: { status: GameStatus.FINISHED, winnerId: actorId },
    });
    expect(
      createDevelopmentCardSet().definitions.some((entry) =>
        entry.effects.some(
          (effect) =>
            effect.type === "GAIN_LEVEL" && effect.victoryEligible === true,
        ),
      ),
    ).toBe(false);
  });
});
