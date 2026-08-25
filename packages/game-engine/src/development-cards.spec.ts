import { describe, expect, it } from "vitest";
import {
  CardSetId,
  CardType,
  DeckType,
  GamePhase,
  GameStatus,
  createDevelopmentCardSet,
  createGame,
  createSeededRandomSource,
  executeCommand,
  parseGameId,
  parsePlayerId,
  permanentCombatPower,
  roleCapacity,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
} from "./index.js";

describe("V2 production card catalog", () => {
  const cardSet = createDevelopmentCardSet();
  const definitions = cardSet.definitions;
  const allCards = [...cardSet.doorDeck, ...cardSet.treasureDeck];

  it("has the explicit target size for Core and every optional set", () => {
    const expected = {
      CORE: [83, 198],
      COMPANIONS: [12, 24],
      ARSENAL: [18, 40],
      DUAL_IDENTITY: [12, 24],
      CLASSIC_FANTASY: [16, 32],
      CLERICAL_ERRORS: [18, 36],
      STEED_HIRELINGS: [17, 34],
    } as const;
    for (const setId of Object.values(CardSetId)) {
      const ids = new Set(
        definitions
          .filter((definition) => definition.setId === setId)
          .map((definition) => definition.id),
      );
      expect([
        ids.size,
        allCards.filter((card) => ids.has(card.definitionId)).length,
      ]).toEqual(expected[setId]);
    }
  });

  it("uses unique ids, art keys, instances, and valid references", () => {
    expect(new Set(definitions.map((definition) => definition.id)).size).toBe(
      definitions.length,
    );
    expect(
      new Set(definitions.map((definition) => definition.artKey)).size,
    ).toBe(definitions.length);
    expect(new Set(allCards.map((card) => card.instanceId)).size).toBe(
      allCards.length,
    );
    const ids = new Set(definitions.map((definition) => definition.id));
    expect(allCards.every((card) => ids.has(card.definitionId))).toBe(true);
    for (const definition of definitions)
      for (const restriction of definition.equipment?.restrictions ?? [])
        expect(ids.has(restriction.definitionId), definition.id).toBe(true);
  });

  it("gives every physical copy a deck matching its authored definition", () => {
    const byId = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    for (const card of cardSet.doorDeck)
      expect(byId.get(card.definitionId)?.deck, card.instanceId).toBe(
        DeckType.DOOR,
      );
    for (const card of cardSet.treasureDeck)
      expect(byId.get(card.definitionId)?.deck, card.instanceId).toBe(
        DeckType.TREASURE,
      );
  });

  it("matches the authored Core category and tier curve", () => {
    const core = definitions.filter(
      (definition) => definition.setId === CardSetId.CORE,
    );
    const count = (predicate: (definition: CardDefinition) => boolean) =>
      core.filter(predicate).length;
    expect(count((card) => card.type === CardType.MONSTER)).toBe(20);
    expect(
      count(
        (card) =>
          card.type === CardType.CURSE || card.type === CardType.COMBAT_CURSE,
      ),
    ).toBe(12);
    expect(count((card) => card.type === CardType.CLASS)).toBe(4);
    expect(count((card) => card.type === CardType.RACE)).toBe(4);
    expect(count((card) => card.type === CardType.EQUIPMENT)).toBe(20);
    expect(count((card) => card.type === CardType.TEMPORARY_BONUS)).toBe(9);
    expect(
      count((card) =>
        [
          CardType.MONSTER_MODIFIER,
          CardType.ADD_MONSTER,
          CardType.CLONE_MONSTER,
        ].includes(card.type),
      ),
    ).toBe(6);
    expect(count((card) => card.type === CardType.UTILITY)).toBe(8);
    expect(
      core
        .filter((card) => card.type === CardType.MONSTER)
        .map((card) => card.tier),
    ).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  });

  it("gives every actionable card timing/target and every sellable Treasure positive value", () => {
    for (const definition of definitions) {
      expect(definition.name.trim(), definition.id).not.toHaveLength(0);
      expect(definition.description.trim(), definition.id).not.toHaveLength(0);
      expect(
        definition.description
          .split(".")
          .filter((sentence) => sentence.trim().length > 0).length,
        definition.id,
      ).toBeLessThanOrEqual(2);
      if (definition.type !== CardType.MONSTER) {
        expect(definition.play?.timings.length, definition.id).toBeGreaterThan(
          0,
        );
        expect(definition.play?.target, definition.id).toEqual(
          expect.any(String),
        );
      }
      const defaultSellable =
        definition.deck === DeckType.TREASURE &&
        (definition.goldValue ?? 0) > 0;
      if (definition.sellable ?? defaultSellable)
        expect(definition.goldValue, definition.id).toBeGreaterThan(0);
      if (
        [
          CardType.MONSTER,
          CardType.CURSE,
          CardType.COMBAT_CURSE,
          CardType.CLASS,
          CardType.RACE,
          CardType.ROLE_PERMISSION,
        ].includes(definition.type)
      )
        expect(definition.sellable ?? false, definition.id).toBe(false);
    }
  });

  it("has a bounded six-player starter pool", () => {
    const starters = definitions.filter(
      (definition) => definition.starterEligible,
    );
    const copies = allCards.filter((card) =>
      starters.some((definition) => definition.id === card.definitionId),
    );
    expect(starters.length).toBeGreaterThanOrEqual(5);
    expect(copies.length).toBeGreaterThanOrEqual(12);
    for (const starter of starters) {
      expect(starter).toMatchObject({
        setId: CardSetId.CORE,
        tier: 1,
        type: CardType.EQUIPMENT,
      });
      expect(starter.equipment?.restrictions).toEqual([]);
      expect(starter.equipment?.combatBonus).toBeGreaterThanOrEqual(1);
      expect(starter.equipment?.combatBonus).toBeLessThanOrEqual(2);
    }
  });

  it("starts every supported player count in both modes with all selectable packs", () => {
    for (const mode of ["BALANCED", "CLASSIC_CHAOS"] as const) {
      for (let playerCount = 1; playerCount <= 6; playerCount += 1) {
        const random = createSeededRandomSource(
          playerCount * 100 + mode.length,
        );
        let state = createGame({
          id: parseGameId(`setup-${mode}-${playerCount}`),
          config: { mode, enabledSetIds: Object.values(CardSetId) },
        });
        for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
          const added = executeCommand(
            state,
            {
              type: "ADD_PLAYER",
              actorId: parsePlayerId(`setup-player-${playerIndex}`),
              name: `Player ${playerIndex}`,
              sex: "FEMALE",
            },
            { random },
          );
          expect(added.success).toBe(true);
          if (!added.success) throw new Error(added.error.message);
          state = added.state;
        }
        const started = executeCommand(
          state,
          { type: "START_GAME", actorId: state.players[0]!.id },
          { random },
        );
        expect(started.success).toBe(true);
        if (!started.success) throw new Error(started.error.message);
        expect(
          started.state.players.every((player) => player.hand.length === 8),
        ).toBe(true);
      }
    }
  });

  it("authors the new packs through existing roles, attachments, companions, and combat targets", () => {
    const set = (setId: CardSetId) =>
      definitions.filter((card) => card.setId === setId);
    expect(
      set(CardSetId.CLASSIC_FANTASY).filter((card) => card.role !== undefined),
    ).toHaveLength(4);
    expect(
      set(CardSetId.CLERICAL_ERRORS).filter(
        (card) => card.attachment !== undefined,
      ),
    ).toHaveLength(2);
    expect(
      set(CardSetId.STEED_HIRELINGS).filter(
        (card) => card.companion !== undefined,
      ),
    ).toHaveLength(9);
    for (const definition of [
      ...set(CardSetId.CLASSIC_FANTASY),
      ...set(CardSetId.CLERICAL_ERRORS),
      ...set(CardSetId.STEED_HIRELINGS),
    ])
      expect(
        definition.effects.length > 0 ||
          definition.role ||
          definition.companion ||
          definition.equipment ||
          definition.monster ||
          definition.attachment,
      ).toBeTruthy();
  });

  it("filters disabled expansions out of GameState", () => {
    const core = createGame({ id: parseGameId("core-catalog") });
    expect(
      core.cardDefinitions.every(
        (definition) => definition.setId === CardSetId.CORE,
      ),
    ).toBe(true);
    const expanded = createGame({
      id: parseGameId("expanded-catalog"),
      config: { mode: "BALANCED", enabledSetIds: Object.values(CardSetId) },
    });
    expect(expanded.cardDefinitions).toHaveLength(175);
    expect(
      new Set(expanded.cardDefinitions.map((definition) => definition.setId)),
    ).toEqual(new Set(Object.values(CardSetId)));
  });

  it("includes each requested optional pack only when explicitly selected", () => {
    for (const optionalSetId of [
      CardSetId.CLASSIC_FANTASY,
      CardSetId.CLERICAL_ERRORS,
      CardSetId.STEED_HIRELINGS,
    ]) {
      const state = createGame({
        id: parseGameId(`catalog-${optionalSetId}`),
        config: {
          mode: "BALANCED",
          enabledSetIds: [CardSetId.CORE, optionalSetId],
        },
      });
      const allowed = new Set([CardSetId.CORE, optionalSetId]);
      expect(
        state.cardDefinitions.every((card) => allowed.has(card.setId)),
      ).toBe(true);
      const definitions = new Set(state.cardDefinitions.map((card) => card.id));
      expect(
        [...state.doorDeck, ...state.treasureDeck].every((card) =>
          definitions.has(card.definitionId),
        ),
      ).toBe(true);
      expect(
        state.cardDefinitions.some((card) => card.setId === optionalSetId),
      ).toBe(true);
    }
  });
});

function instance(
  state: GameState,
  definitionId: string,
  suffix: string,
): CardInstance {
  const card = [...state.doorDeck, ...state.treasureDeck].find(
    (candidate) => candidate.definitionId === definitionId,
  );
  if (card === undefined) throw new Error(`Missing ${definitionId}`);
  return {
    ...card,
    instanceId: `${card.instanceId}-${suffix}` as CardInstance["instanceId"],
  };
}
function player(
  value: string,
  hand: readonly CardInstance[] = [],
): PlayerState {
  return {
    id: parsePlayerId(value),
    name: value,
    sex: "MALE",
    level: 1,
    hand,
    equipment: [],
    equipmentAttachments: [],
    classCards: [],
    raceCards: [],
    rolePermissionCards: [],
    hirelingCard: null,
    mountCard: null,
    activeEffects: [],
    isDead: false,
  };
}
function playable(players: readonly PlayerState[]): GameState {
  const base = createGame({
    id: parseGameId("catalog-abilities"),
    config: { mode: "CLASSIC_CHAOS", enabledSetIds: Object.values(CardSetId) },
  });
  return {
    ...base,
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.TURN_START,
    activePlayerId: players[0]!.id,
    players,
  };
}

describe("V2 catalog abilities", () => {
  const random = createSeededRandomSource(7);

  it("enforces one Hireling and one Mount slot", () => {
    const base = playable([player("ada")]);
    const first = instance(base, "eager-intern", "a");
    const second = instance(base, "lantern-scout", "b");
    const mount = instance(base, "stubborn-pony", "c");
    let state = { ...base, players: [player("ada", [first, second, mount])] };
    for (const card of [first, mount, second]) {
      const result = executeCommand(
        state,
        {
          type: "PLAY_CARD",
          actorId: state.players[0]!.id,
          cardId: card.instanceId,
          target: null,
        },
        { random },
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      state = result.state;
    }
    expect(state.players[0]?.hirelingCard).toEqual(second);
    expect(state.players[0]?.mountCard).toEqual(mount);
    expect(state.treasureDiscard).toContainEqual(first);
  });

  it("allows one compatible enhancer per equipped weapon", () => {
    const base = playable([player("ada")]);
    const weapon = instance(base, "spatula-of-resolve", "host");
    const enhancer = instance(base, "sharpening-chorus", "one");
    const duplicate = instance(base, "sharpening-chorus", "two");
    const state = {
      ...base,
      players: [
        { ...player("ada", [enhancer, duplicate]), equipment: [weapon] },
      ],
    };
    const actorId = state.players[0]!.id;
    const attached = executeCommand(
      state,
      {
        type: "PLAY_CARD",
        actorId,
        cardId: enhancer.instanceId,
        target: { type: "EQUIPMENT", cardId: weapon.instanceId },
      },
      { random },
    );
    expect(attached.success).toBe(true);
    if (!attached.success) return;
    expect(attached.state.players[0]?.equipmentAttachments).toEqual([
      { card: enhancer, attachedToCardId: weapon.instanceId },
    ]);
    expect(permanentCombatPower(attached.state, actorId)).toBe(4);
    expect(
      executeCommand(
        attached.state,
        {
          type: "PLAY_CARD",
          actorId,
          cardId: duplicate.instanceId,
          target: { type: "EQUIPMENT", cardId: weapon.instanceId },
        },
        { random },
      ).success,
    ).toBe(false);
  });

  it("cancels a matching Curse through typed protection", () => {
    const base = playable([player("ada"), player("bob")]);
    const ward = instance(base, "hexproof-cap", "ward");
    const curse = instance(base, "curse-shortcut-tax", "curse");
    const ada = { ...player("ada"), equipment: [ward] };
    const bob = player("bob", [curse]);
    const state = { ...base, players: [ada, bob], activePlayerId: bob.id };
    const result = executeCommand(
      state,
      {
        type: "PLAY_CARD",
        actorId: bob.id,
        cardId: curse.instanceId,
        target: { type: "PLAYER", playerId: ada.id },
      },
      { random },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.players[0]?.level).toBe(1);
    expect(result.state.doorDiscard).toContainEqual(curse);
  });

  it("role permissions increase only their authored capacity", () => {
    const base = playable([player("ada")]);
    const permission = instance(base, "double-major", "permission");
    const state = { ...base, players: [player("ada", [permission])] };
    const result = executeCommand(
      state,
      {
        type: "PLAY_ROLE_PERMISSION",
        actorId: state.players[0]!.id,
        cardId: permission.instanceId,
      },
      { random },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(roleCapacity(result.state, result.state.players[0]!, "CLASS")).toBe(
      2,
    );
    expect(roleCapacity(result.state, result.state.players[0]!, "RACE")).toBe(
      1,
    );
  });
});
