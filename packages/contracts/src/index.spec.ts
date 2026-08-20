import { describe, expect, it } from "vitest";
import {
  APPLICATION_NAME,
  LobbyStatus,
  ROOM_CODE_LENGTH,
  type LobbyState,
  type GameCardView,
  type GameLogEntryView,
} from "./index.js";

describe("shared contracts", () => {
  it("exposes the application identity", () => {
    expect(APPLICATION_NAME).toBe("Munchkin LAN");
  });

  it("represents a public lobby without transport identities", () => {
    const state: LobbyState = {
      roomCode: "ABCD",
      status: LobbyStatus.LOBBY,
      hostPlayerId: "player-1",
      players: [
        {
          playerId: "player-1",
          name: "Ada",
          isHost: true,
          connected: true,
        },
      ],
    };

    expect(state.roomCode).toHaveLength(ROOM_CODE_LENGTH);
    expect(state.players[0]).not.toHaveProperty("socketId");
  });

  it("represents public card details and phase-aware log entries without hidden zones", () => {
    const card: GameCardView = {
      instanceId: "potion-1",
      definitionId: "potion",
      artKey: "test.potion",
      name: "Pocket Tonic",
      description: "A brief burst of courage.",
      type: "TEMPORARY_BONUS",
      deck: "TREASURE",
      effects: [{ type: "COMBAT_BONUS", amount: 3 }],
    };
    const entry: GameLogEntryView = {
      sequence: 4,
      turnNumber: 2,
      phase: "DOOR_RESOLUTION",
      type: "CARD_PLAYED",
      visibility: "PUBLIC",
      playerId: "player-1",
      card,
      side: "PLAYERS",
    };

    expect(entry.card?.effects).toEqual([{ type: "COMBAT_BONUS", amount: 3 }]);
    expect(entry.card?.artKey).toBe("test.potion");
    expect(entry).not.toHaveProperty("hand");
  });
});
