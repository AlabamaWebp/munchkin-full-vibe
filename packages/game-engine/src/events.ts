import type { CardTarget } from "./commands.js";
import type { DeckType } from "./cards.js";
import type {
  CardDefinitionId,
  CardInstanceId,
  PlayerId,
} from "./identifiers.js";

export type PublicEvent = { readonly visibility: "PUBLIC" };
export type PrivateEvent = {
  readonly visibility: "PRIVATE";
  readonly recipientPlayerId: PlayerId;
};

export type GameEvent =
  | (PublicEvent & {
      readonly type: "PLAYER_ADDED";
      readonly playerId: PlayerId;
      readonly name: string;
    })
  | (PublicEvent & {
      readonly type: "GAME_STARTED";
      readonly activePlayerId: PlayerId;
    })
  | (PrivateEvent & {
      readonly type: "CARDS_DEALT";
      readonly playerId: PlayerId;
      readonly doorCardIds: readonly CardInstanceId[];
      readonly treasureCardIds: readonly CardInstanceId[];
    })
  | (PublicEvent & {
      readonly type: "TURN_STARTED";
      readonly playerId: PlayerId;
      readonly turnNumber: number;
    })
  | (PublicEvent & {
      readonly type: "DOOR_KICKED";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    })
  | (PrivateEvent & {
      readonly type: "CARD_DRAWN";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
      readonly deck: DeckType;
    })
  | (PublicEvent & {
      readonly type: "CARD_ADDED_TO_HAND";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    })
  | (PrivateEvent & {
      readonly type: "CARDS_DISCARDED";
      readonly playerId: PlayerId;
      readonly cardIds: readonly CardInstanceId[];
    })
  | (PublicEvent & {
      readonly type: "CURSE_RESOLVED";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "COMBAT_STARTED";
      readonly playerId: PlayerId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "ROOM_LOOTED";
      readonly playerId: PlayerId;
    })
  | (PublicEvent & {
      readonly type: "CARD_PLAYED";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly target: CardTarget | null;
    })
  | (PublicEvent & {
      readonly type: "TURN_ENDED";
      readonly playerId: PlayerId;
      readonly turnNumber: number;
    });
