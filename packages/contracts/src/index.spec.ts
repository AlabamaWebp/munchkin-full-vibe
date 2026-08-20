import { describe, expect, it } from "vitest";
import {
  APPLICATION_NAME,
  LobbyStatus,
  ROOM_CODE_LENGTH,
  type LobbyState,
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
});
