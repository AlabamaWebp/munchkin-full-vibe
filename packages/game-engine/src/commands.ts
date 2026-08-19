import type { CardInstanceId, PlayerId } from "./identifiers.js";

export type CardTarget =
  | {
      readonly type: "PLAYER";
      readonly playerId: PlayerId;
    }
  | {
      readonly type: "COMBAT";
    };

interface PlayerCommand {
  readonly actorId: PlayerId;
}

export type GameCommand =
  | (PlayerCommand & {
      readonly type: "ADD_PLAYER";
      readonly name: string;
    })
  | (PlayerCommand & {
      readonly type: "START_GAME";
    })
  | (PlayerCommand & {
      readonly type: "KICK_DOOR";
    })
  | (PlayerCommand & {
      readonly type: "PLAY_CARD";
      readonly cardId: CardInstanceId;
      readonly target: CardTarget | null;
    })
  | (PlayerCommand & {
      readonly type: "LOOT_ROOM";
    })
  | (PlayerCommand & {
      readonly type: "END_TURN";
    });
