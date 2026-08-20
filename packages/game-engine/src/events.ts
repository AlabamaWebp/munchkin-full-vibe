import type { CardTarget } from "./commands.js";
import type { DeckType } from "./cards.js";
import type {
  CardDefinitionId,
  CardInstanceId,
  EncounterId,
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
  | (PublicEvent & {
      readonly type: "DECK_RESHUFFLED";
      readonly deck: DeckType;
    })
  | (PublicEvent & {
      readonly type: "LOOKED_FOR_TROUBLE";
      readonly playerId: PlayerId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
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
      readonly type: "CARDS_DISCARDED_SUMMARY";
      readonly playerId: PlayerId;
      readonly count: number;
      readonly zone: "HAND" | "EQUIPMENT";
    })
  | (PublicEvent & {
      readonly type: "CARD_DISCARD_REQUIRED";
      readonly playerId: PlayerId;
      readonly count: number;
      readonly zone: "HAND" | "EQUIPMENT";
      readonly sourceCardId: CardInstanceId;
      readonly sourceDefinitionId: CardDefinitionId;
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
      readonly encounterId: EncounterId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "MONSTER_ADDED";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
      readonly cardId: CardInstanceId;
    })
  | (PublicEvent & {
      readonly type: "MONSTER_CLONED";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly sourceEncounterId: EncounterId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
      readonly cardId: CardInstanceId;
    })
  | (PublicEvent & {
      readonly type: "COMBAT_UPDATED";
      readonly playerId: PlayerId;
      readonly playerPower: number;
      readonly monsterPower: number;
    })
  | (PublicEvent & {
      readonly type: "COMBAT_VICTORY_DECLARED";
      readonly playerId: PlayerId;
      readonly reactionWindowId: number;
    })
  | (PublicEvent & {
      readonly type: "COMBAT_REACTION_PASSED";
      readonly playerId: PlayerId;
      readonly reactionWindowId: number;
    })
  | (PublicEvent & {
      readonly type: "COMBAT_REACTIONS_RESET";
      readonly playerId: PlayerId;
      readonly reactionWindowId: number;
    })
  | (PublicEvent & {
      readonly type: "COMBAT_VICTORY_CANCELLED";
      readonly playerId: PlayerId;
    })
  | (PublicEvent & {
      readonly type: "COMBAT_WON";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "RUN_AWAY_ATTEMPTED";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
      readonly roll: number;
      readonly escaped: boolean;
    })
  | (PublicEvent & {
      readonly type: "BAD_STUFF_APPLIED";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly monsterCardId: CardInstanceId;
      readonly monsterDefinitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "HELP_REQUESTED";
      readonly playerId: PlayerId;
      readonly helperId: PlayerId;
    })
  | (PublicEvent & {
      readonly type: "HELP_ACCEPTED";
      readonly playerId: PlayerId;
      readonly helperId: PlayerId;
    })
  | (PublicEvent & {
      readonly type: "LEVEL_GAINED";
      readonly playerId: PlayerId;
      readonly amount: number;
      readonly newLevel: number;
    })
  | (PublicEvent & {
      readonly type: "LEVEL_LOST";
      readonly playerId: PlayerId;
      readonly amount: number;
      readonly newLevel: number;
    })
  | (PublicEvent & {
      readonly type: "TREASURE_GAINED";
      readonly playerId: PlayerId;
      readonly count: number;
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
      readonly type: "ITEM_EQUIPPED";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "ITEM_UNEQUIPPED";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "ROLE_PLAYED";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
      readonly role: "CLASS" | "RACE";
    })
  | (PublicEvent & {
      readonly type: "ITEMS_SOLD";
      readonly playerId: PlayerId;
      readonly cardIds: readonly CardInstanceId[];
      readonly value: number;
      readonly levelsGained: number;
    })
  | (PublicEvent & {
      readonly type: "ITEM_TRADED";
      readonly playerId: PlayerId;
      readonly recipientId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    })
  | (PublicEvent & {
      readonly type: "CHARITY_RESOLVED";
      readonly playerId: PlayerId;
      readonly recipientId: PlayerId | null;
      readonly count: number;
    })
  | (PublicEvent & {
      readonly type: "PLAYER_DIED" | "PLAYER_REVIVED";
      readonly playerId: PlayerId;
    })
  | (PublicEvent & {
      readonly type: "TURN_ENDED";
      readonly playerId: PlayerId;
      readonly turnNumber: number;
    })
  | (PublicEvent & {
      readonly type: "GAME_FINISHED";
      readonly winnerId: PlayerId;
      readonly winningLevel: number;
    });
