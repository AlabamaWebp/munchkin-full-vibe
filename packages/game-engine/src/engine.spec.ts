import { describe, expect, it } from "vitest";
import {
  CardType,
  DeckType,
  type CardDefinition,
  type CardInstance,
  type CardSet,
} from "./cards.js";
import { createDevelopmentCardSet } from "./development-cards.js";
import {
  MAX_PLAYERS,
  STARTING_HAND_SIZE_PER_DECK,
  executeCommand,
  type CommandResult,
} from "./engine.js";
import { createGame } from "./game.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
  type PlayerId,
} from "./identifiers.js";
import {
  createSeededRandomSource,
  type RandomSource,
} from "./random-source.js";

const keepOrderRandom: RandomSource = {
  nextInt(maxExclusive: number): number {
    return maxExclusive - 1;
  },
};

function requireSuccess(result: CommandResult): GameState {
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.state;
}

function addPlayer(
  state: GameState,
  id: string,
  name = id,
  random: RandomSource = keepOrderRandom,
): GameState {
  return requireSuccess(
    executeCommand(
      state,
      { type: "ADD_PLAYER", actorId: parsePlayerId(id), name, sex: "MALE" },
      { random },
    ),
  );
}

function startGame(
  state: GameState,
  actorId: PlayerId = state.players[0]?.id ?? parsePlayerId("missing"),
  random: RandomSource = keepOrderRandom,
): GameState {
  return requireSuccess(
    executeCommand(state, { type: "START_GAME", actorId }, { random }),
  );
}

function definition(
  id: string,
  type: CardType,
  deck: DeckType,
  effects: CardDefinition["effects"] = [],
): CardDefinition {
  return {
    id: parseCardDefinitionId(id),
    artKey: `test.${id}`,
    setId: "CORE",
    tier: 1,
    tags: [],
    name: id,
    description: `${id} test card`,
    type,
    deck,
    effects,
    ...(type === CardType.MONSTER
      ? {
          monster: {
            strength: 2,
            levelRewards: 1,
            treasureRewards: 1,
            badStuff: [],
          },
        }
      : {}),
  };
}

function instance(definitionId: string, copy: number): CardInstance {
  return {
    instanceId: parseCardInstanceId(`${definitionId}-${copy}`),
    definitionId: parseCardDefinitionId(definitionId),
  };
}

function cardSetWithDoor(
  target: CardDefinition,
  followingType: CardType = CardType.UTILITY,
  playerCount = 1,
): CardSet {
  const fillerDoor = definition("filler-door", CardType.UTILITY, DeckType.DOOR);
  const following = definition("following-door", followingType, DeckType.DOOR);
  const treasure = definition(
    "filler-treasure",
    CardType.UTILITY,
    DeckType.TREASURE,
  );
  const initialCards = STARTING_HAND_SIZE_PER_DECK * playerCount;

  return {
    definitions: [fillerDoor, target, following, treasure],
    doorDeck: [
      ...Array.from({ length: initialCards }, (_, index) =>
        instance(fillerDoor.id, index + 1),
      ),
      instance(target.id, 1),
      instance(following.id, 1),
    ],
    treasureDeck: Array.from({ length: initialCards }, (_, index) =>
      instance(treasure.id, index + 1),
    ),
  };
}

function startedSinglePlayerGame(target: CardDefinition): GameState {
  let state = createGame({
    id: parseGameId("focused-game"),
    cardSet: cardSetWithDoor(target),
    config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
  });
  state = addPlayer(state, "ada", "Ada");
  return startGame(state);
}

describe("game setup", () => {
  it("creates a serializable lobby with the fictional development set", () => {
    const state = createGame({ id: parseGameId("game-1") });
    const set = createDevelopmentCardSet();

    expect(state).toMatchObject({
      status: GameStatus.LOBBY,
      phase: GamePhase.LOBBY,
      players: [],
      activePlayerId: null,
      combat: null,
      turnNumber: 0,
    });
    expect(
      set.definitions.filter((card) => card.type === CardType.MONSTER),
    ).toHaveLength(29);
    expect(
      set.definitions.filter((card) => card.type === CardType.EQUIPMENT),
    ).toHaveLength(34);
    expect(
      set.definitions.filter((card) => card.type === CardType.CURSE),
    ).toHaveLength(13);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("adds one through six players by command and rejects a seventh", () => {
    let state = createGame({ id: parseGameId("game-players") });

    for (let index = 1; index <= MAX_PLAYERS; index += 1) {
      state = addPlayer(state, `player-${index}`, ` Player ${index} `);
    }

    expect(state.players).toHaveLength(6);
    expect(state.players[0]?.name).toBe("Player 1");

    const result = executeCommand(
      state,
      {
        type: "ADD_PLAYER",
        actorId: parsePlayerId("player-7"),
        name: "Player 7",
      },
      { random: keepOrderRandom },
    );
    expect(result).toMatchObject({
      success: false,
      state,
      error: { code: "PLAYER_LIMIT_REACHED" },
    });
  });

  it("rejects duplicate ids and empty names without changing state", () => {
    const state = addPlayer(
      createGame({ id: parseGameId("invalid-player") }),
      "ada",
      "Ada",
    );
    const duplicate = executeCommand(
      state,
      { type: "ADD_PLAYER", actorId: parsePlayerId("ada"), name: "Again" },
      { random: keepOrderRandom },
    );
    const emptyName = executeCommand(
      state,
      { type: "ADD_PLAYER", actorId: parsePlayerId("bob"), name: "  " },
      { random: keepOrderRandom },
    );

    expect(duplicate).toMatchObject({
      success: false,
      state,
      error: { code: "DUPLICATE_PLAYER_ID" },
    });
    expect(emptyName).toMatchObject({
      success: false,
      state,
      error: { code: "INVALID_PLAYER_NAME" },
    });
  });

  it("shuffles, deals four cards from each deck, and begins turn one", () => {
    let state = createGame({ id: parseGameId("dealing") });
    state = addPlayer(state, "ada", "Ada");
    state = addPlayer(state, "bob", "Bob");
    const originalDoorCount = state.doorDeck.length;
    const originalTreasureCount = state.treasureDeck.length;
    const result = executeCommand(
      state,
      { type: "START_GAME", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );
    const started = requireSuccess(result);

    expect(started.status).toBe(GameStatus.IN_PROGRESS);
    expect(started.phase).toBe(GamePhase.TURN_START);
    expect(started.activePlayerId).toBe(parsePlayerId("bob"));
    expect(started.turnNumber).toBe(1);
    expect(started.players.map((player) => player.hand.length)).toEqual([8, 8]);
    expect(started.doorDeck).toHaveLength(originalDoorCount - 8);
    expect(started.treasureDeck).toHaveLength(originalTreasureCount - 8);

    const dealEvents = result.events.filter(
      (event) => event.type === "CARDS_DEALT",
    );
    expect(dealEvents).toHaveLength(2);
    expect(dealEvents.every((event) => event.visibility === "PRIVATE")).toBe(
      true,
    );
    const publicPayload = JSON.stringify(
      result.events.filter((event) => event.visibility === "PUBLIC"),
    );
    for (const player of started.players) {
      for (const card of player.hand) {
        expect(publicPayload).not.toContain(card.instanceId);
      }
    }
  });

  it("produces identical deck and player choices from the same seed", () => {
    function run(seed: number): GameState {
      let state = createGame({ id: parseGameId("deterministic") });
      state = addPlayer(state, "ada");
      state = addPlayer(state, "bob");
      return startGame(
        state,
        parsePlayerId("ada"),
        createSeededRandomSource(seed),
      );
    }

    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });
});

describe("turn commands", () => {
  it("rejects commands from a non-active or unknown player", () => {
    let state = createGame({ id: parseGameId("wrong-player") });
    state = addPlayer(state, "ada");
    state = addPlayer(state, "bob");
    state = startGame(state);

    const wrongPlayer = executeCommand(
      state,
      { type: "KICK_DOOR", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );
    const unknown = executeCommand(
      state,
      { type: "KICK_DOOR", actorId: parsePlayerId("eve") },
      { random: keepOrderRandom },
    );

    expect(wrongPlayer).toMatchObject({
      success: false,
      state,
      error: { code: "NOT_ACTIVE_PLAYER" },
    });
    expect(unknown).toMatchObject({
      success: false,
      state,
      error: { code: "ACTOR_NOT_FOUND" },
    });
  });

  it("rejects commands issued in the wrong phase", () => {
    const state = startedSinglePlayerGame(
      definition("other", CardType.UTILITY, DeckType.DOOR),
    );
    const result = executeCommand(
      state,
      { type: "LOOT_ROOM", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );

    expect(result).toMatchObject({
      success: false,
      state,
      error: { code: "INVALID_PHASE" },
    });
  });

  it("reveals an Other Door card and puts it in the active hand", () => {
    const state = startedSinglePlayerGame(
      definition("odd-door", CardType.UTILITY, DeckType.DOOR),
    );
    const result = executeCommand(
      state,
      { type: "KICK_DOOR", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );
    const kicked = requireSuccess(result);

    expect(kicked.phase).toBe(GamePhase.POST_DOOR);
    expect(kicked.combat).toBeNull();
    expect(kicked.players[0]?.hand).toHaveLength(9);
    expect(result.events.map((event) => event.type)).toEqual([
      "DOOR_KICKED",
      "CARD_ADDED_TO_HAND",
    ]);
  });

  it("starts combat when the Door contains a monster", () => {
    const state = startedSinglePlayerGame(
      definition("test-monster", CardType.MONSTER, DeckType.DOOR),
    );
    const result = executeCommand(
      state,
      { type: "KICK_DOOR", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );
    const kicked = requireSuccess(result);

    expect(kicked.phase).toBe(GamePhase.DOOR_RESOLUTION);
    expect(kicked.combat).toMatchObject({
      playerId: parsePlayerId("ada"),
      monsters: [
        { monster: { definitionId: parseCardDefinitionId("test-monster") } },
      ],
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "DOOR_KICKED",
      "COMBAT_STARTED",
    ]);

    const loot = executeCommand(
      kicked,
      { type: "LOOT_ROOM", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );
    expect(loot).toMatchObject({
      success: false,
      state: kicked,
      error: { code: "INVALID_PHASE" },
    });
  });

  it("resolves a typed curse effect and discards the curse", () => {
    const curse = definition("forgetful-curse", CardType.CURSE, DeckType.DOOR, [
      { type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 1 },
    ]);
    const state = startedSinglePlayerGame(curse);
    const discardedCard = state.players[0]?.hand.at(-1);
    const result = executeCommand(
      state,
      { type: "KICK_DOOR", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );
    const kicked = requireSuccess(result);

    expect(kicked.phase).toBe(GamePhase.POST_DOOR);
    expect(kicked.players[0]?.hand).toHaveLength(7);
    expect(
      [...kicked.doorDiscard, ...kicked.treasureDiscard].some(
        (card) => card === discardedCard,
      ),
    ).toBe(true);
    expect(
      kicked.doorDiscard.some(
        (card) =>
          card.definitionId === parseCardDefinitionId("forgetful-curse"),
      ),
    ).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "DOOR_KICKED",
      "CARDS_DISCARDED",
      "CARDS_DISCARDED_SUMMARY",
      "CURSE_RESOLVED",
    ]);
    expect(result.events[1]).toMatchObject({
      visibility: "PRIVATE",
      recipientPlayerId: parsePlayerId("ada"),
    });
  });

  it("pauses a curse while its target chooses cards and resumes after an exact selection", () => {
    const curse = definition("choosing-curse", CardType.CURSE, DeckType.DOOR, [
      { type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 2 },
      { type: "LOSE_LEVEL", amount: 1 },
    ]);
    const state = startedSinglePlayerGame(curse);
    const chosen = state.players[0]!.hand.slice(0, 2);
    const kicked = requireSuccess(
      executeCommand(
        state,
        { type: "KICK_DOOR", actorId: parsePlayerId("ada") },
        { random: keepOrderRandom },
      ),
    );

    expect(kicked.phase).toBe(GamePhase.DOOR_RESOLUTION);
    expect(kicked.pendingDecision).toMatchObject({
      type: "DISCARD_CARDS",
      playerId: parsePlayerId("ada"),
      count: 2,
      zone: "HAND",
    });
    expect(
      executeCommand(
        kicked,
        { type: "END_TURN", actorId: parsePlayerId("ada") },
        { random: keepOrderRandom },
      ),
    ).toMatchObject({ success: false, error: { code: "PENDING_DECISION" } });

    const resolved = executeCommand(
      kicked,
      {
        type: "RESOLVE_CARD_DISCARD",
        actorId: parsePlayerId("ada"),
        decisionId: kicked.pendingDecision!.decisionId,
        cardIds: chosen.map((card) => card.instanceId),
      },
      { random: keepOrderRandom },
    );
    const final = requireSuccess(resolved);
    expect(final.pendingDecision).toBeNull();
    expect(final.phase).toBe(GamePhase.POST_DOOR);
    expect(final.players[0]).toMatchObject({
      level: 1,
      hand: expect.any(Array),
    });
    expect(final.players[0]?.hand).toHaveLength(6);
    expect(resolved.events.map((event) => event.type)).toEqual([
      "CARDS_DISCARDED",
      "CARDS_DISCARDED_SUMMARY",
      "CURSE_RESOLVED",
    ]);
  });

  it("loots one facedown Door card and keeps its identity private", () => {
    const state = startedSinglePlayerGame(
      definition("other", CardType.UTILITY, DeckType.DOOR),
    );
    const afterDoor = requireSuccess(
      executeCommand(
        state,
        { type: "KICK_DOOR", actorId: parsePlayerId("ada") },
        { random: keepOrderRandom },
      ),
    );
    const lootedCard = afterDoor.doorDeck[0];
    const result = executeCommand(
      afterDoor,
      { type: "LOOT_ROOM", actorId: parsePlayerId("ada") },
      { random: keepOrderRandom },
    );
    const looted = requireSuccess(result);

    expect(looted.phase).toBe(GamePhase.END_TURN);
    expect(looted.players[0]?.hand).toContain(lootedCard);
    expect(result.events).toMatchObject([
      { type: "ROOM_LOOTED", visibility: "PUBLIC" },
      {
        type: "CARD_DRAWN",
        visibility: "PRIVATE",
        recipientPlayerId: parsePlayerId("ada"),
      },
    ]);
    expect(JSON.stringify(result.events[0])).not.toContain(
      lootedCard?.instanceId,
    );
  });

  it("ends the turn, advances player order, and increments the turn", () => {
    const other = definition("turn-other", CardType.UTILITY, DeckType.DOOR);
    let state = createGame({
      id: parseGameId("turn-order"),
      cardSet: cardSetWithDoor(other, CardType.UTILITY, 2),
      config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
    });
    state = addPlayer(state, "ada");
    state = addPlayer(state, "bob");
    state = startGame(state);
    const activeId = state.activePlayerId ?? parsePlayerId("missing");
    const afterDoor = requireSuccess(
      executeCommand(
        state,
        { type: "KICK_DOOR", actorId: activeId },
        { random: keepOrderRandom },
      ),
    );

    if (afterDoor.combat !== null) {
      throw new Error(
        "Ordered development deck unexpectedly produced a monster.",
      );
    }

    const result = executeCommand(
      {
        ...afterDoor,
        players: afterDoor.players.map((player) =>
          player.id === activeId
            ? { ...player, hand: player.hand.slice(0, 5) }
            : player,
        ),
      },
      { type: "END_TURN", actorId: activeId },
      { random: keepOrderRandom },
    );
    const ended = requireSuccess(result);

    expect(ended.activePlayerId).toBe(parsePlayerId("ada"));
    expect(ended.turnNumber).toBe(2);
    expect(ended.phase).toBe(GamePhase.TURN_START);
    expect(result.events.map((event) => event.type)).toEqual([
      "TURN_ENDED",
      "TURN_STARTED",
    ]);
    expect(ended.eventLog.slice(-2)).toMatchObject([
      {
        turnNumber: 1,
        phase: GamePhase.TURN_START,
        event: { type: "TURN_ENDED" },
      },
      {
        turnNumber: 2,
        phase: GamePhase.TURN_START,
        event: { type: "TURN_STARTED" },
      },
    ]);
    expect(ended.eventLog.at(-1)?.sequence).toBe(ended.eventLog.length);
  });

  it("validates card ownership for unavailable card-play commands", () => {
    const state = startedSinglePlayerGame(
      definition("other", CardType.UTILITY, DeckType.DOOR),
    );
    const result = executeCommand(
      state,
      {
        type: "PLAY_CARD",
        actorId: parsePlayerId("ada"),
        cardId: parseCardInstanceId("not-owned"),
        target: null,
      },
      { random: keepOrderRandom },
    );

    expect(result).toMatchObject({
      success: false,
      state,
      error: { code: "CARD_NOT_IN_HAND" },
    });
    expect(result.state.eventLog).toBe(state.eventLog);
  });
});
