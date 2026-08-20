import type { CardInstanceId, EncounterId, PlayerId } from "./identifiers.js";

export type CardTarget =
  | {
      readonly type: "PLAYER";
      readonly playerId: PlayerId;
    }
  | {
      readonly type: "COMBAT";
      readonly side: "PLAYERS";
    }
  | {
      readonly type: "COMBAT";
      readonly side: "MONSTER";
      readonly encounterId: EncounterId;
    }
  | {
      readonly type: "HAND_MONSTER";
      readonly cardId: CardInstanceId;
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
      readonly type: "LOOK_FOR_TROUBLE";
      readonly cardId: CardInstanceId;
    })
  | (PlayerCommand & {
      readonly type: "PLAY_CARD";
      readonly cardId: CardInstanceId;
      readonly target: CardTarget | null;
      readonly reactionWindowId?: number;
    })
  | (PlayerCommand & {
      readonly type: "EQUIP_ITEM";
      readonly cardId: CardInstanceId;
    })
  | (PlayerCommand & {
      readonly type: "UNEQUIP_ITEM";
      readonly cardId: CardInstanceId;
    })
  | (PlayerCommand & {
      readonly type: "PLAY_ROLE";
      readonly cardId: CardInstanceId;
    })
  | (PlayerCommand & {
      readonly type: "SELL_ITEMS";
      readonly cardIds: readonly CardInstanceId[];
    })
  | (PlayerCommand & {
      readonly type: "TRADE_ITEM";
      readonly cardId: CardInstanceId;
      readonly recipientId: PlayerId;
    })
  | (PlayerCommand & {
      readonly type: "GIVE_CHARITY";
      readonly cardIds: readonly CardInstanceId[];
      readonly recipientId: PlayerId | null;
    })
  | (PlayerCommand & {
      readonly type: "GIVE_RANDOM_CHARITY";
    })
  | (PlayerCommand & {
      readonly type: "RESOLVE_CARD_DISCARD";
      readonly cardIds: readonly CardInstanceId[];
    })
  | (PlayerCommand & {
      readonly type: "DECLARE_COMBAT_VICTORY";
      readonly combatRevision: number;
    })
  | (PlayerCommand & {
      readonly type: "PASS_COMBAT_REACTION";
      readonly reactionWindowId: number;
    })
  | (PlayerCommand & {
      readonly type: "RUN_AWAY";
    })
  | (PlayerCommand & {
      readonly type: "REQUEST_HELP";
      readonly helperId: PlayerId;
    })
  | (PlayerCommand & {
      readonly type: "ACCEPT_HELP";
    })
  | (PlayerCommand & {
      readonly type: "LOOT_ROOM";
    })
  | (PlayerCommand & {
      readonly type: "END_TURN";
    });
