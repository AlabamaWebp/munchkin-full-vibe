import { describe, expect, it } from "vitest";
import { CardType, DeckType, type CardDefinition } from "./cards.js";
import type { GameCommand } from "./commands.js";
import { executeCommand } from "./engine.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
} from "./identifiers.js";
import { createSeededRandomSource } from "./random-source.js";

const gameId = parseGameId("game-1");
const playerId = parsePlayerId("player-1");
const definitionId = parseCardDefinitionId("lucky-charm");
const cardId = parseCardInstanceId("lucky-charm-1");

const definition: CardDefinition = {
  id: definitionId,
  name: "Lucky Charm",
  description: "A small temporary combat boost.",
  type: CardType.TEMPORARY_BONUS,
  deck: DeckType.TREASURE,
  effects: [{ type: "COMBAT_BONUS", amount: 2 }],
};

const state: GameState = {
  schemaVersion: 1,
  id: gameId,
  status: GameStatus.LOBBY,
  phase: GamePhase.LOBBY,
  players: [
    {
      id: playerId,
      name: "Ada",
      level: 1,
      hand: [{ instanceId: cardId, definitionId }],
      equipment: [],
      temporaryCombatBonus: 0,
    },
  ],
  activePlayerId: null,
  cardDefinitions: [definition],
  doorDeck: [],
  treasureDeck: [],
  doorDiscard: [],
  treasureDiscard: [],
  combat: null,
  turnNumber: 0,
  winnerId: null,
};

describe("domain model", () => {
  it("round-trips complete game state through JSON", () => {
    const serialized = JSON.stringify(state);
    const deserialized: unknown = JSON.parse(serialized);

    expect(deserialized).toEqual(state);
    expect(serialized).not.toContain("function");
  });

  it("represents card effects as serializable discriminated data", () => {
    const drawDefinition: CardDefinition = {
      id: parseCardDefinitionId("draw-two-doors"),
      name: "Drafty Passage",
      description: "Draw two Door cards.",
      type: CardType.CURSE,
      deck: DeckType.DOOR,
      effects: [{ type: "DRAW_CARDS", deck: DeckType.DOOR, count: 2 }],
    };

    expect(JSON.parse(JSON.stringify(drawDefinition))).toEqual(drawDefinition);
  });
});

describe("command failures", () => {
  const commands: readonly GameCommand[] = [
    { type: "KICK_DOOR", actorId: playerId },
    {
      type: "PLAY_CARD",
      actorId: playerId,
      cardId,
      target: { type: "PLAYER", playerId },
    },
    { type: "LOOT_ROOM", actorId: playerId },
    { type: "END_TURN", actorId: playerId },
  ];

  it.each(commands)(
    "rejects invalid $type without mutating state",
    (command) => {
      const result = executeCommand(state, command, {
        random: createSeededRandomSource(7),
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
      expect(result).toMatchObject({
        error: { code: expect.any(String) },
      });
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    },
  );
});
