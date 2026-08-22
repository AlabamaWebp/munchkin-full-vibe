import type {
  CardInstanceId,
  CombatId,
  CurseResponseId,
  EncounterId,
  HelpOfferId,
  PendingDecisionId,
  PlayerId,
} from "./identifiers.js";
import type { PlayerSex } from "./cards.js";

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
    }
  | {
      readonly type: "EQUIPMENT";
      readonly cardId: CardInstanceId;
    };

interface PlayerCommand {
  readonly actorId: PlayerId;
}

export type GameCommand =
  | (PlayerCommand & {
      readonly type: "ADD_PLAYER";
      readonly name: string;
      readonly sex: PlayerSex;
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
      readonly combatId?: CombatId;
      readonly combatRevision?: number;
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
      readonly replaceCardId?: CardInstanceId;
    })
  | (PlayerCommand & {
      readonly type: "PLAY_ROLE_PERMISSION";
      readonly cardId: CardInstanceId;
    })
  | (PlayerCommand & {
      readonly type: "DISCARD_ROLE_PERMISSION";
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
      readonly decisionId: PendingDecisionId;
      readonly cardIds: readonly CardInstanceId[];
      readonly combatId?: CombatId;
      readonly combatRevision?: number;
    })
  | (PlayerCommand & {
      readonly type: "RESOLVE_ROLE_RETENTION";
      readonly decisionId: PendingDecisionId;
      readonly keepCardId: CardInstanceId;
    })
  | (PlayerCommand & {
      readonly type: "DECLARE_COMBAT_VICTORY";
      readonly combatId: CombatId;
      readonly combatRevision: number;
    })
  | (PlayerCommand & {
      readonly type: "PASS_COMBAT_REACTION";
      readonly combatId: CombatId;
      readonly combatRevision: number;
      readonly reactionWindowId: number;
    })
  | (PlayerCommand & {
      readonly type: "RUN_AWAY";
      readonly combatId: CombatId;
      readonly combatRevision: number;
    })
  | (PlayerCommand & {
      readonly type: "PROPOSE_HELP";
      readonly helperId: PlayerId;
      readonly treasureCount: number;
      readonly combatId: CombatId;
      readonly combatRevision: number;
    })
  | (PlayerCommand & {
      readonly type: "COUNTER_HELP";
      readonly offerId: HelpOfferId;
      readonly treasureCount: number;
      readonly combatId: CombatId;
      readonly combatRevision: number;
    })
  | (PlayerCommand & {
      readonly type: "ACCEPT_HELP_OFFER";
      readonly offerId: HelpOfferId;
      readonly combatId: CombatId;
      readonly combatRevision: number;
    })
  | (PlayerCommand & {
      readonly type: "REJECT_HELP_OFFER" | "CANCEL_HELP_OFFER";
      readonly offerId: HelpOfferId;
      readonly combatId: CombatId;
      readonly combatRevision: number;
    })
  | (PlayerCommand & {
      readonly type: "RESPOND_TO_CURSE";
      readonly responseId: CurseResponseId;
      readonly response:
        | { readonly type: "DECLINE" }
        | {
            readonly type: "USE_PROTECTION";
            readonly cardId: CardInstanceId;
            readonly protectedCardId?: CardInstanceId;
          };
    })
  | (PlayerCommand & { readonly type: "SCAVENGE" })
  | (PlayerCommand & {
      readonly type: "LOOT_ROOM";
    })
  | (PlayerCommand & {
      readonly type: "END_TURN";
    });
