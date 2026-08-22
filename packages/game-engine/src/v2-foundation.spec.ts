import { describe, expect, it } from "vitest";
import {
  CardSetId,
  GameMode,
  PlayerSex,
  createDevelopmentCardSet,
  createGame,
  createSeededRandomSource,
  evaluateConditions,
  executeCommand,
  parseGameId,
  parsePlayerId,
  roleCapacity,
} from "./index.js";

describe("V2 domain foundation", () => {
  it("creates JSON-serializable schema 5 state with an immutable normalized config", () => {
    const state = createGame({
      id: parseGameId("v2-config"),
      config: { mode: GameMode.CLASSIC_CHAOS, enabledSetIds: [CardSetId.CORE] },
    });

    expect(JSON.parse(JSON.stringify(state))).toMatchObject({
      schemaVersion: 5,
      config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
      nextPendingDecisionSequence: 1,
    });
    expect(Object.isFrozen(state.config)).toBe(true);
    expect(Object.isFrozen(state.config.enabledSetIds)).toBe(true);
  });

  it("keeps only enabled card-set definitions and physical cards", () => {
    const state = createGame({ id: parseGameId("core-only") });
    expect(
      state.cardDefinitions.every((card) => card.setId === CardSetId.CORE),
    ).toBe(true);
    expect(
      state.doorDeck.every((card) =>
        state.cardDefinitions.some(
          (definition) => definition.id === card.definitionId,
        ),
      ),
    ).toBe(true);
  });

  it("projects player sex into authoritative player state and evaluates flat conditions", () => {
    const random = createSeededRandomSource(1);
    const initial = createGame({ id: parseGameId("sex-condition") });
    const result = executeCommand(
      initial,
      {
        type: "ADD_PLAYER",
        actorId: parsePlayerId("ada"),
        name: "Ada",
        sex: PlayerSex.FEMALE,
      },
      { random },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const player = result.state.players[0]!;
    expect(player.sex).toBe(PlayerSex.FEMALE);
    expect(
      evaluateConditions([{ type: "PLAYER_SEX_IS", sex: PlayerSex.FEMALE }], {
        state: result.state,
        player,
      }),
    ).toBe(true);
    expect(
      evaluateConditions([{ type: "PLAYER_SEX_IS", sex: PlayerSex.MALE }], {
        state: result.state,
        player,
      }),
    ).toBe(false);
  });

  it("keeps base role capacity at one until an explicit permission card is present", () => {
    const state = createGame({ id: parseGameId("roles") });
    const player = {
      id: parsePlayerId("ada"),
      name: "Ada",
      sex: PlayerSex.FEMALE,
      level: 1,
      hand: [],
      equipment: [],
      equipmentAttachments: [],
      classCards: [],
      raceCards: [],
      rolePermissionCards: [],
      hirelingCard: null,
      mountCard: null,
      activeEffects: [],
      isDead: false,
    } as const;
    const withPlayer = { ...state, players: [player] };
    expect(roleCapacity(withPlayer, player, "CLASS")).toBe(1);
  });

  it("keeps the migrated development catalog complete", () => {
    for (const definition of createDevelopmentCardSet().definitions) {
      expect(definition.artKey).not.toHaveLength(0);
      expect(Object.values(CardSetId)).toContain(definition.setId);
      expect(definition.tags).toBeDefined();
    }
  });
});
