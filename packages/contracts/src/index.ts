export const APPLICATION_NAME = "Munchkin LAN";

export interface FoundationStatusResponse {
  applicationName: typeof APPLICATION_NAME;
  milestone: 12;
  engine: "domain-ready";
  serverConnection: "game-ready";
  gameplay: "game-completion-ready";
}

export const LOBBY_MIN_PLAYERS = 1;
export const LOBBY_MAX_PLAYERS = 6;
export const ROOM_CODE_LENGTH = 4;

export const LobbyStatus = { LOBBY: "LOBBY", STARTED: "STARTED" } as const;
export type LobbyStatus = (typeof LobbyStatus)[keyof typeof LobbyStatus];
export type GameMode = "BALANCED" | "CLASSIC_CHAOS";
export type PlayerSex = "MALE" | "FEMALE";
export type PlayerColor =
  "PINK" | "BLUE" | "RED" | "YELLOW" | "GREEN" | "BLACK";
export const PLAYER_COLORS: readonly PlayerColor[] = [
  "PINK",
  "BLUE",
  "RED",
  "YELLOW",
  "GREEN",
  "BLACK",
];
export type CardSetId =
  | "CORE"
  | "COMPANIONS"
  | "ARSENAL"
  | "DUAL_IDENTITY"
  | "CLASSIC_FANTASY"
  | "CLERICAL_ERRORS"
  | "STEED_HIRELINGS";

/**
 * Presentation-only metadata for stable card-set identifiers. The match config
 * keeps ids, while lobby clients use this catalog rather than showing raw ids.
 */
export interface CardSetDisplayMetadata {
  readonly id: CardSetId;
  readonly name: string;
  readonly description: string;
  readonly mandatory: boolean;
}

export const CARD_SET_DISPLAY_METADATA: readonly CardSetDisplayMetadata[] = [
  {
    id: "CORE",
    name: "Нейро 1",
    description: "Обязательная базовая колода для каждой партии.",
    mandatory: true,
  },
  {
    id: "COMPANIONS",
    name: "Спутники",
    description: "Дополнительные наёмники и ездовые спутники.",
    mandatory: false,
  },
  {
    id: "ARSENAL",
    name: "Арсенал",
    description: "Снаряжение, усилители оружия и защита.",
    mandatory: false,
  },
  {
    id: "DUAL_IDENTITY",
    name: "Двойная роль",
    description: "Дополнительные места для классов и рас.",
    mandatory: false,
  },
  {
    id: "CLASSIC_FANTASY",
    name: "Классическое фэнтези",
    description: "Оригинальные героические роли, чудовища и сокровища.",
    mandatory: false,
  },
  {
    id: "CLERICAL_ERRORS",
    name: "Ошибки духовенства",
    description: "Певчие, гномы и ловкие усилители предметов.",
    mandatory: false,
  },
  {
    id: "STEED_HIRELINGS",
    name: "Седло и свита",
    description: "Ездовые животные, наёмники и рискованные схватки.",
    mandatory: false,
  },
] as const;

export interface LobbyPlayerView {
  readonly playerId: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly connected: boolean;
  readonly sex?: PlayerSex | null;
  readonly color: PlayerColor;
}

export interface LobbyState {
  readonly roomCode: string;
  readonly status: LobbyStatus;
  readonly hostPlayerId: string;
  readonly players: readonly LobbyPlayerView[];
  readonly settings?: {
    readonly mode: GameMode;
    readonly enabledSetIds: readonly CardSetId[];
  };
}

export interface CreateLobbyPayload {
  readonly playerName: string;
}
export interface JoinLobbyPayload {
  readonly roomCode: string;
  readonly playerName: string;
}
export interface StartLobbyPayload {
  readonly roomCode: string;
  readonly playerId: string;
}
export type GameLifecyclePayload = StartLobbyPayload;
export interface ResumeSessionPayload {
  readonly roomCode: string;
  readonly sessionToken: string;
}
export interface SetPlayerSexPayload extends StartLobbyPayload {
  readonly sex: PlayerSex;
}
export interface SetPlayerColorPayload extends StartLobbyPayload {
  readonly color: PlayerColor;
}
export interface SetLobbySettingsPayload extends StartLobbyPayload {
  readonly mode: GameMode;
  readonly enabledSetIds: readonly CardSetId[];
}

export type LobbyErrorCode =
  | "ALREADY_IN_ROOM"
  | "GAME_ALREADY_STARTED"
  | "INVALID_PLAYER_NAME"
  | "INVALID_ROOM_CODE"
  | "INVALID_SESSION"
  | "NOT_HOST"
  | "PLAYER_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_NOT_FOUND"
  | "GAME_NOT_FINISHED"
  | "SEX_REQUIRED"
  | "COLOR_TAKEN"
  | "INVALID_GAME_SETTINGS";

export interface LobbyActionSuccess {
  readonly success: true;
  readonly roomCode: string;
  readonly playerId: string;
  readonly sessionToken: string;
}

export interface LobbyActionFailure {
  readonly success: false;
  readonly error: { readonly code: LobbyErrorCode; readonly message: string };
}
export type LobbyActionAck = LobbyActionSuccess | LobbyActionFailure;

export const GameStatus = {
  LOBBY: "LOBBY",
  IN_PROGRESS: "IN_PROGRESS",
  FINISHED: "FINISHED",
} as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

export const GamePhase = {
  LOBBY: "LOBBY",
  TURN_START: "TURN_START",
  KICK_DOOR: "KICK_DOOR",
  DOOR_RESOLUTION: "DOOR_RESOLUTION",
  POST_DOOR: "POST_DOOR",
  LOOT_ROOM: "LOOT_ROOM",
  END_TURN: "END_TURN",
  FINISHED: "FINISHED",
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export type GameCardType =
  | "MONSTER"
  | "CURSE"
  | "COMBAT_CURSE"
  | "EQUIPMENT"
  | "TEMPORARY_BONUS"
  | "MONSTER_MODIFIER"
  | "ADD_MONSTER"
  | "CLONE_MONSTER"
  | "OTHER"
  | "UTILITY"
  | "CLASS"
  | "RACE"
  | "HIRELING"
  | "MOUNT"
  | "ROLE_PERMISSION"
  | "ATTACHMENT";
export type GameDeckType = "DOOR" | "TREASURE";
export type GameEquipmentSlot = "HEAD" | "BODY" | "FEET" | "HANDS";
export type GameCardPlayTiming =
  "TURN" | "POST_DOOR" | "ACTIVE_COMBAT" | "VICTORY_REACTION" | "WHEN_DRAWN";
export type GameCardTarget =
  | "SELF"
  | "ANY_PLAYER"
  | "COMBAT_PLAYERS"
  | "COMBAT_PLAYER"
  | "COMBAT_SIDE"
  | "MONSTER_ENCOUNTER"
  | "HAND_MONSTER"
  | "EQUIPMENT";

export type GameConditionView =
  | { readonly type: "PLAYER_HAS_CLASS"; readonly anyOf: readonly string[] }
  | { readonly type: "PLAYER_HAS_RACE"; readonly anyOf: readonly string[] }
  | { readonly type: "PLAYER_SEX_IS"; readonly sex: PlayerSex }
  | {
      readonly type: "MONSTER_HAS_TAG";
      readonly anyOf: readonly ("BEAST" | "CONSTRUCT" | "ARCANE" | "UNDEAD")[];
    }
  | {
      readonly type: "EQUIPPED_HAS_TAG";
      readonly anyOf: readonly (
        "WEAPON" | "ARMOR" | "BLADE" | "BLUNT" | "MAGIC"
      )[];
      readonly atLeast: number;
      readonly scope: "OWNER" | "COMBAT_SIDE";
    }
  | { readonly type: "CARD_DEFINITION_IS"; readonly anyOf: readonly string[] }
  | {
      readonly type: "CURSE_MATCHES";
      readonly severities?: readonly ("EARLY" | "MID" | "LATE")[];
      readonly anyTag?: readonly ("HEX" | "TRAP")[];
    };

export type GameModifierView =
  | {
      readonly type: "COMBAT_POWER";
      readonly amount: number;
      readonly maxAmount?: number;
      readonly conditions: readonly GameConditionView[];
    }
  | {
      readonly type: "EQUIPMENT_TAG_BONUS";
      readonly amountPerCard: number;
      readonly maxCards: number;
      readonly tags: readonly (
        "WEAPON" | "ARMOR" | "BLADE" | "BLUNT" | "MAGIC"
      )[];
      readonly conditions: readonly GameConditionView[];
    }
  | {
      readonly type: "RUN_AWAY_ROLL";
      readonly amount: number;
      readonly conditions: readonly GameConditionView[];
    }
  | {
      readonly type: "AUTOMATIC_PROTECTION";
      readonly protection: "CANCEL" | "PROTECT_ONE_ITEM" | "IGNORE_BAD_STUFF";
      readonly conditions: readonly GameConditionView[];
    };

export type GameRoleAbilityView =
  | {
      readonly type: "COMBAT_BONUS";
      readonly amount: number;
      readonly target: "PLAYERS";
      readonly cost: { readonly type: "DISCARD_HAND"; readonly count: number };
      readonly usage: "ONCE_PER_COMBAT";
    }
  | {
      readonly type: "RUN_AWAY_BONUS";
      readonly amount: number;
      readonly target: "SELF";
      readonly cost: { readonly type: "DISCARD_HAND"; readonly count: number };
      readonly usage: "ONCE_PER_COMBAT";
    }
  | {
      readonly type: "DRAW_CARDS";
      readonly deck: GameDeckType;
      readonly count: number;
      readonly target: "SELF";
      readonly cost: { readonly type: "DISCARD_HAND"; readonly count: number };
      readonly usage: "ONCE_PER_TURN";
    };

export interface GameCardView {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly artKey: string;
  readonly name: string;
  readonly description: string;
  readonly duration:
    | "ONE_SHOT"
    | "END_OF_COMBAT"
    | "WHILE_EQUIPPED"
    | "WHILE_ROLE_ACTIVE"
    | "WHILE_IN_SLOT"
    | "WHILE_ATTACHED"
    | "WHILE_IN_PLAY"
    | "ENCOUNTER_PASSIVE";
  readonly type: GameCardType;
  readonly deck: GameDeckType;
  readonly setId?: CardSetId;
  readonly tags?: readonly (
    | "BEAST"
    | "CONSTRUCT"
    | "ARCANE"
    | "UNDEAD"
    | "WEAPON"
    | "ARMOR"
    | "BLADE"
    | "BLUNT"
    | "MAGIC"
    | "HEX"
    | "TRAP"
  )[];
  readonly sellable?: boolean;
  readonly tradeable?: boolean;
  readonly goldValue?: number;
  readonly play?: {
    readonly timings: readonly GameCardPlayTiming[];
    readonly target: GameCardTarget;
  };
  readonly effects: readonly GameEffectView[];
  readonly equipment?: {
    readonly slot: GameEquipmentSlot;
    readonly hands: 0 | 1 | 2;
    readonly combatBonus: number;
    readonly restrictions: readonly (
      | { readonly type: "CLASS"; readonly definitionId: string }
      | { readonly type: "RACE"; readonly definitionId: string }
    )[];
    /** @deprecated Use the card-level goldValue. */
    readonly value: number;
    readonly requiredClass?: string;
    readonly requiredRace?: string;
    readonly modifier?: GameModifierView;
  };
  readonly companion?: {
    readonly combatBonus: number;
    readonly modifier?: GameModifierView;
  };
  readonly monster?: {
    readonly strength?: number;
    readonly level?: number;
    readonly levelRewards: number;
    readonly treasureRewards: number;
    readonly badStuff: readonly GameBadStuffEffectView[];
    readonly modifiers?: readonly GameModifierView[];
  };
  readonly curse?: { readonly severity: "EARLY" | "MID" | "LATE" };
  readonly curseProtection?: {
    readonly mode: "CANCEL" | "PROTECT_ONE_ITEM";
    readonly conditions?: readonly GameConditionView[];
  };
  readonly role?: {
    readonly role: "CLASS" | "RACE";
    readonly modifier?: GameModifierView;
    readonly activeAbility?: GameRoleAbilityView;
  };
  readonly rolePermission?: {
    readonly role: "CLASS" | "RACE";
    readonly additionalSlots: 1;
  };
  readonly attachment?: {
    readonly allowedTags: readonly (
      "WEAPON" | "ARMOR" | "BLADE" | "BLUNT" | "MAGIC"
    )[];
    readonly allowedDefinitionIds?: readonly string[];
    readonly combatBonus: number;
  };
  /**
   * Present only while this Equipment card is publicly equipped. Values are
   * resolved by the server for the owning character's current game state.
   */
  readonly equipped?: {
    readonly resolvedCombatBonus: number;
    readonly attachments: readonly {
      readonly card: GameCardView;
      readonly combatBonus: number;
    }[];
  };
}

export type GameEffectView =
  | {
      readonly type:
        | "COMBAT_BONUS"
        | "COMBAT_SIDE_BONUS"
        | "MONSTER_COMBAT_BONUS"
        | "GAIN_LEVEL"
        | "LOSE_LEVEL";
      readonly amount: number;
    }
  | {
      readonly type: "MODIFY_MONSTER";
      readonly strength: number;
      readonly treasures: number;
    }
  | { readonly type: "ADD_MONSTER_TO_COMBAT" | "CLONE_COMBAT_MONSTER" }
  | {
      readonly type: "DRAW_CARDS";
      readonly deck: GameDeckType;
      readonly count: number;
    }
  | {
      readonly type: "DISCARD_RANDOM_CARDS" | "DISCARD_CHOSEN_CARDS";
      readonly count: number;
      readonly zone: "HAND" | "EQUIPMENT";
    }
  | { readonly type: "DISCARD_ROLE"; readonly role: "CLASS" | "RACE" }
  | { readonly type: "DEATH" };

export type GameBadStuffEffectView =
  | { readonly type: "LOSE_LEVEL"; readonly amount: number }
  | {
      readonly type: "DISCARD_RANDOM_CARDS" | "DISCARD_CHOSEN_CARDS";
      readonly count: number;
      readonly zone: "HAND" | "EQUIPMENT";
    }
  | { readonly type: "DISCARD_ROLE"; readonly role: "CLASS" | "RACE" }
  | { readonly type: "DEATH" };

export interface GamePlayerView {
  readonly playerId: string;
  readonly name: string;
  readonly sex?: PlayerSex;
  readonly color?: PlayerColor;
  readonly level: number;
  readonly handCount: number;
  readonly equipment: readonly GameCardView[];
  readonly equipmentAttachments?: readonly {
    readonly card: GameCardView;
    readonly attachedToCardId: string;
  }[];
  readonly temporaryCombatBonus: number;
  readonly equipmentCombatBonus: number;
  readonly combatPower: number;
  readonly combatPowerBreakdown?: readonly {
    readonly source:
      | "LEVEL"
      | "EQUIPMENT"
      | "ROLE"
      | "COMPANION"
      | "ACTIVE_EFFECT"
      | "MAKESHIFT_TOOLS";
    readonly sourceDefinitionId?: string;
    readonly amount: number;
  }[];
  readonly classCard: GameCardView | null;
  readonly raceCard: GameCardView | null;
  readonly classCards?: readonly GameCardView[];
  readonly raceCards?: readonly GameCardView[];
  readonly rolePermissionCards?: readonly GameCardView[];
  readonly hirelingCard?: GameCardView | null;
  readonly mountCard?: GameCardView | null;
  readonly isDead: boolean;
}

export interface OwnPlayerView extends GamePlayerView {
  readonly hand: readonly GameCardView[];
}

export type AvailableGameAction =
  | "KICK_DOOR"
  | "LOOK_FOR_TROUBLE"
  | "SCAVENGE"
  | "PROPOSE_HELP"
  | "ACCEPT_HELP_OFFER"
  | "REJECT_HELP_OFFER"
  | "CANCEL_HELP_OFFER"
  | "DECLARE_COMBAT_VICTORY"
  | "PASS_COMBAT_REACTION"
  | "RUN_AWAY"
  | "LOOT_ROOM"
  | "END_TURN";

export type IntentReasonCode =
  | "PRIMARY_TURN_ACTION"
  | "OPTIONAL_CARD_PLAY"
  | "COMBAT_WINNING"
  | "COMBAT_LOSING"
  | "BLOCKING_RESPONSE"
  | "HAND_LIMIT"
  | "ECONOMY";

interface AvailableIntentBase {
  readonly id: string;
  readonly reasonCode: IntentReasonCode;
}

interface CombatIntentAddress {
  readonly combatId: string;
  readonly combatRevision: number;
}

export type AvailableIntentView =
  | (AvailableIntentBase & {
      readonly kind: "KICK_DOOR" | "LOOT_ROOM" | "SCAVENGE" | "END_TURN";
    })
  | (AvailableIntentBase & {
      readonly kind:
        | "LOOK_FOR_TROUBLE"
        | "EQUIP_ITEM"
        | "UNEQUIP_ITEM"
        | "PLAY_ROLE"
        | "DISCARD_ROLE"
        | "PLAY_ROLE_PERMISSION"
        | "DISCARD_ROLE_PERMISSION";
      readonly cardId: string;
      readonly replaceCardId?: string;
    })
  | (AvailableIntentBase &
      CombatIntentAddress & {
        readonly kind: "PLAY_CARD";
        readonly cardId: string;
        readonly target:
          | { readonly type: "PLAYERS" }
          | { readonly type: "MONSTER"; readonly encounterId: string }
          | { readonly type: "HAND_MONSTER"; readonly monsterCardId: string }
          | { readonly type: "PLAYER"; readonly playerId: string };
        readonly reactionWindowId?: number;
      })
  | (AvailableIntentBase &
      CombatIntentAddress & {
        readonly kind: "USE_ROLE_ABILITY";
        readonly roleCardId: string;
        readonly abilityType: "COMBAT_BONUS" | "RUN_AWAY_BONUS";
        readonly cost: {
          readonly count: number;
          readonly eligibleCardIds: readonly string[];
        };
        readonly target:
          { readonly type: "PLAYERS" } | { readonly type: "SELF" };
        readonly reactionWindowId?: number;
      })
  | (AvailableIntentBase & {
      readonly kind: "USE_ROLE_ABILITY";
      readonly roleCardId: string;
      readonly abilityType: "DRAW_CARDS";
      readonly cost: {
        readonly count: number;
        readonly eligibleCardIds: readonly string[];
      };
      readonly target: { readonly type: "SELF" };
    })
  | (AvailableIntentBase & {
      readonly kind: "PLAY_CARD";
      readonly cardId: string;
      readonly target:
        | { readonly type: "SELF" }
        | { readonly type: "PLAYER"; readonly playerId: string }
        | { readonly type: "EQUIPMENT"; readonly cardId: string };
    })
  | (AvailableIntentBase &
      CombatIntentAddress & {
        readonly kind: "DECLARE_COMBAT_VICTORY" | "RUN_AWAY";
      })
  | (AvailableIntentBase &
      CombatIntentAddress & {
        readonly kind: "PASS_COMBAT_REACTION";
        readonly reactionWindowId: number;
        readonly expiresAtEpochMs: number;
      })
  | (AvailableIntentBase &
      CombatIntentAddress & {
        readonly kind: "PROPOSE_HELP";
        readonly helperIds: readonly string[];
        readonly minTreasures: number;
        readonly maxTreasures: number;
      })
  | (AvailableIntentBase &
      CombatIntentAddress & {
        readonly kind:
          "ACCEPT_HELP_OFFER" | "REJECT_HELP_OFFER" | "CANCEL_HELP_OFFER";
        readonly offerId: string;
        readonly expiresAtEpochMs: number;
      })
  | (AvailableIntentBase & {
      readonly kind: "SELL_CARDS";
      readonly cardIds: readonly string[];
      readonly minimumValue: number;
    })
  | (AvailableIntentBase & {
      readonly kind: "TRADE_CARD";
      readonly cardId: string;
      readonly recipientIds: readonly string[];
    })
  | (AvailableIntentBase & {
      readonly kind: "GIVE_CHARITY";
      readonly cardIds: readonly string[];
      readonly count: number;
      readonly recipientIds: readonly string[];
      readonly randomDefault: boolean;
    })
  | (AvailableIntentBase & {
      readonly kind: "RESOLVE_CARD_DISCARD";
      readonly decisionId: string;
      readonly cardIds: readonly string[];
      readonly count: number;
      readonly expiresAtEpochMs: number;
      readonly combatId?: string;
      readonly combatRevision?: number;
    })
  | (AvailableIntentBase & {
      readonly kind: "RESOLVE_ROLE_RETENTION";
      readonly decisionId: string;
      readonly cardIds: readonly string[];
      readonly expiresAtEpochMs: number;
    })
  | (AvailableIntentBase & {
      readonly kind: "RESPOND_TO_CURSE";
      readonly responseId: string;
      readonly expiresAtEpochMs: number;
      readonly responses: readonly (
        | { readonly type: "DECLINE" }
        | { readonly type: "CANCEL"; readonly cardId: string }
        | {
            readonly type: "PROTECT_ONE_ITEM";
            readonly cardId: string;
            readonly protectedCardIds: readonly string[];
          }
      )[];
    });

export type CombatHistoryView =
  | {
      readonly type: "COMBAT_STARTED";
      readonly playerId: string;
      readonly encounterId: string;
      readonly monster: GameCardView;
    }
  | {
      readonly type: "HELP_OFFERED" | "HELP_OFFER_ACCEPTED";
      readonly playerId: string;
      readonly helperId: string;
      readonly offerId: string;
      readonly treasureCount: number;
    }
  | {
      readonly type: "CARD_PLAYED";
      readonly playerId: string;
      readonly card: GameCardView;
      readonly side: "PLAYERS" | "MONSTER";
      readonly encounterId?: string;
      readonly targetPlayerId?: string;
    }
  | {
      readonly type: "ROLE_ABILITY_USED";
      readonly playerId: string;
      readonly roleCard: GameCardView;
      readonly abilityType: "COMBAT_BONUS" | "RUN_AWAY_BONUS";
      readonly side: "PLAYERS";
      readonly amount: number;
    }
  | {
      readonly type: "MONSTER_ADDED";
      readonly playerId: string;
      readonly encounterId: string;
      readonly monster: GameCardView;
      readonly card: GameCardView;
    }
  | {
      readonly type: "MONSTER_CLONED";
      readonly playerId: string;
      readonly encounterId: string;
      readonly sourceEncounterId: string;
      readonly monster: GameCardView;
      readonly card: GameCardView;
    };

export type GameLogEventType =
  | "PLAYER_ADDED"
  | "GAME_STARTED"
  | "CARDS_DEALT"
  | "TURN_STARTED"
  | "DOOR_KICKED"
  | "DECK_RESHUFFLED"
  | "LOOKED_FOR_TROUBLE"
  | "CARD_DRAWN"
  | "CARD_ADDED_TO_HAND"
  | "CARDS_DISCARDED"
  | "CARDS_DISCARDED_SUMMARY"
  | "CARD_DISCARD_REQUIRED"
  | "CURSE_RESOLVED"
  | "CURSE_RESPONSE_REQUIRED"
  | "CURSE_RESPONSE_RESOLVED"
  | "CURSE_PROTECTION_USED"
  | "DECISION_AUTO_RESOLVED"
  | "COMBAT_STARTED"
  | "MONSTER_ADDED"
  | "MONSTER_CLONED"
  | "COMBAT_UPDATED"
  | "COMBAT_VICTORY_DECLARED"
  | "COMBAT_REACTION_PASSED"
  | "COMBAT_REACTIONS_RESET"
  | "COMBAT_VICTORY_CANCELLED"
  | "COMBAT_WON"
  | "RUN_AWAY_ATTEMPTED"
  | "BAD_STUFF_APPLIED"
  | "HELP_OFFERED"
  | "HELP_OFFER_ACCEPTED"
  | "HELP_OFFER_REJECTED"
  | "HELP_OFFER_CANCELLED"
  | "LEVEL_GAINED"
  | "LEVEL_LOST"
  | "TREASURE_GAINED"
  | "COMBAT_REWARD_CARDS"
  | "SCAVENGED"
  | "SCAVENGED_CARD"
  | "ROOM_LOOTED"
  | "CARD_PLAYED"
  | "ROLE_ABILITY_USED"
  | "ITEM_EQUIPPED"
  | "ITEM_UNEQUIPPED"
  | "ROLE_PLAYED"
  | "ROLE_DISCARDED"
  | "CARDS_SOLD"
  | "ROLE_PERMISSION_PLAYED"
  | "ROLE_PERMISSION_DISCARDED"
  | "ROLE_RETENTION_REQUIRED"
  | "ROLE_RETAINED"
  | "ITEM_TRADED"
  | "CHARITY_RESOLVED"
  | "CHARITY_CARDS_REVEALED"
  | "PLAYER_DIED"
  | "PLAYER_REVIVED"
  | "TURN_ENDED"
  | "GAME_FINISHED";

export interface GameLogEntryView {
  readonly sequence: number;
  readonly turnNumber: number;
  readonly phase: GamePhase;
  readonly type: GameLogEventType;
  readonly visibility: "PUBLIC" | "PRIVATE";
  readonly playerId?: string;
  readonly targetPlayerId?: string;
  readonly protectedCardId?: string;
  readonly card?: GameCardView;
  readonly cards?: readonly GameCardView[];
  /** A deliberately identity-free private draw, shown only to other players. */
  readonly hiddenCard?: {
    readonly deck: GameDeckType;
    readonly count: number;
  };
  readonly count?: number;
  readonly totalTreasureCount?: number;
  readonly amount?: number;
  readonly value?: number;
  readonly newLevel?: number;
  readonly playerPower?: number;
  readonly monsterPower?: number;
  readonly roll?: number;
  readonly escaped?: boolean;
  readonly encounterId?: string;
  readonly reactionWindowId?: number;
  readonly combatId?: string;
  readonly combatRevision?: number;
  readonly offerId?: string;
  readonly decisionId?: string;
  readonly responseId?: string;
  readonly expiresAtEpochMs?: number;
  readonly outcome?: string;
  readonly sourceEncounterId?: string;
  readonly deck?: GameDeckType;
  readonly side?: "PLAYERS" | "MONSTER";
  readonly role?: "CLASS" | "RACE";
  readonly abilityType?: "COMBAT_BONUS" | "RUN_AWAY_BONUS" | "DRAW_CARDS";
  readonly zone?: "HAND" | "EQUIPMENT";
}

export interface PresentedGameEventView extends GameLogEntryView {
  readonly priority: "BLOCKING" | "IMPORTANT" | "ROUTINE";
  readonly summaryCode: string;
  readonly requiresViewerAction: boolean;
}

export type GameCardUnavailableReason =
  | "GAME_FINISHED"
  | "PENDING_DECISION"
  | "REACTION_WINDOW_ACTIVE"
  | "REACTION_ALREADY_CONFIRMED"
  | "WAITING_FOR_TURN"
  | "COMBAT_ACTIVE"
  | "NO_ACTIVE_COMBAT"
  | "WRONG_PHASE"
  | "SLOT_OCCUPIED"
  | "NOT_ENOUGH_FREE_HANDS"
  | "CLASS_REQUIRED"
  | "RACE_REQUIRED"
  | "NO_AVAILABLE_ACTION";

export type ExpectedGameActionView =
  | { readonly type: "CURSE_RESPONSE"; readonly playerId: string }
  | { readonly type: "DISCARD_CARDS"; readonly playerId: string }
  | { readonly type: "RESOLVE_ROLE_RETENTION"; readonly playerId: string }
  | { readonly type: "RESPOND_TO_HELP"; readonly playerId: string }
  | { readonly type: "COMBAT_DECISION"; readonly playerId: string }
  | {
      readonly type: "COMBAT_REACTIONS";
      readonly playerId: string;
      readonly waitingPlayerIds: readonly string[];
    }
  | { readonly type: "TAKE_TURN_ACTION"; readonly playerId: string };

export interface GameView {
  readonly gameId: string;
  readonly viewerPlayerId: string;
  readonly status: GameStatus;
  readonly phase: GamePhase;
  readonly config?: {
    readonly mode: GameMode;
    readonly enabledSetIds: readonly CardSetId[];
  };
  readonly activePlayerId: string;
  readonly turnNumber: number;
  readonly winnerId: string | null;
  readonly players: readonly GamePlayerView[];
  readonly self: OwnPlayerView;
  readonly combat: {
    readonly combatId: string;
    readonly playerId: string;
    readonly revision: number;
    readonly monsters: readonly {
      readonly encounterId: string;
      readonly monster: GameCardView;
      readonly sourceCard: GameCardView;
      readonly clonedFromEncounterId: string | null;
      readonly baseStrength: number;
      readonly strengthModifier: number;
      readonly currentStrength: number;
      readonly baseLevelRewards: number;
      readonly baseTreasureRewards: number;
      readonly treasureModifier: number;
      readonly currentTreasures: number;
      readonly playedCards: readonly {
        readonly card: GameCardView;
        readonly playerId: string;
        readonly strengthModifier: number;
        readonly treasureModifier: number;
        readonly purpose: "MODIFIER" | "ADD_MONSTER" | "CLONE_MONSTER";
      }[];
    }[];
    readonly playerPower: number;
    readonly monsterPower: number;
    readonly requestedHelperId: string | null;
    readonly helperId: string | null;
    readonly helpOffer?: {
      readonly offerId: string;
      readonly helperId: string;
      readonly proposedBy: "ACTIVE" | "HELPER";
      readonly treasureCount: number;
      readonly expiresAtEpochMs: number;
    } | null;
    readonly helpAgreement?: {
      readonly helperId: string;
      readonly promisedTreasures: number;
      readonly acceptedOfferId: string;
      readonly agreedAtCombatRevision: number;
    } | null;
    readonly helperContribution: number;
    readonly reactionWindow: {
      readonly windowId: number;
      readonly claimantId: string;
      readonly confirmedPlayerIds: readonly string[];
      readonly waitingPlayerIds: readonly string[];
      readonly expiresAtEpochMs: number;
    } | null;
    readonly history: readonly CombatHistoryView[];
    readonly runAway?: {
      readonly currentCombatantId: string | null;
      readonly currentEncounterId: string | null;
      readonly attempts: readonly {
        readonly combatantId: string;
        readonly encounterId: string;
        readonly roll: number | null;
        readonly outcome: "ESCAPED" | "FAILED" | "SKIPPED_DEAD";
        readonly badStuffApplied: boolean;
      }[];
    } | null;
  } | null;
  readonly lastRunAwayResult: {
    readonly playerId: string;
    readonly attempts: readonly {
      readonly encounterId: string;
      readonly monster: GameCardView;
      readonly roll: number;
      readonly escaped: boolean;
      readonly badStuffApplied: boolean;
    }[];
  } | null;
  readonly pendingDecision:
    | {
        readonly decisionId: string;
        readonly type: "DISCARD_CARDS";
        readonly playerId: string;
        readonly zone: "HAND" | "EQUIPMENT";
        readonly count: number;
        readonly sourceCard: GameCardView;
        readonly selectableCardIds: readonly string[];
        /** Full presentation is deliberately projected only to the decision owner. */
        readonly selectableCards?: readonly GameCardView[];
        readonly expiresAtEpochMs: number;
      }
    | {
        readonly decisionId: string;
        readonly type: "CHOOSE_ROLE_TO_KEEP";
        readonly playerId: string;
        readonly role: "CLASS" | "RACE";
        readonly selectableCardIds: readonly string[];
        /** Full presentation is deliberately projected only to the decision owner. */
        readonly selectableCards?: readonly GameCardView[];
        readonly expiresAtEpochMs: number;
      }
    | null;
  readonly curseResponse: {
    readonly responseId: string;
    readonly playerId: string;
    readonly curseCard: GameCardView;
    readonly expiresAtEpochMs: number;
    readonly cancelCardIds: readonly string[];
    readonly itemGuardCardIds: readonly string[];
    readonly protectableItemIds: readonly string[];
  } | null;
  readonly gameLog: readonly GameLogEntryView[];
  readonly presentation: {
    readonly blocking: PresentedGameEventView | null;
    readonly important: readonly PresentedGameEventView[];
    readonly routine: readonly PresentedGameEventView[];
  };
  readonly expectedAction: ExpectedGameActionView;
  readonly deckCounts: { readonly door: number; readonly treasure: number };
  readonly availableIntents: readonly AvailableIntentView[];
  readonly unavailableCardReasons: readonly {
    readonly cardId: string;
    readonly reason: GameCardUnavailableReason;
  }[];
}

export type GameClientCommand =
  | { readonly type: "KICK_DOOR" }
  | { readonly type: "LOOK_FOR_TROUBLE"; readonly cardId: string }
  | { readonly type: "LOOT_ROOM" }
  | { readonly type: "END_TURN" }
  | {
      readonly type: "DECLARE_COMBAT_VICTORY";
      readonly combatId: string;
      readonly combatRevision: number;
    }
  | {
      readonly type: "PASS_COMBAT_REACTION";
      readonly combatId: string;
      readonly combatRevision: number;
      readonly reactionWindowId: number;
    }
  | {
      readonly type: "RUN_AWAY";
      readonly combatId: string;
      readonly combatRevision: number;
    }
  | {
      readonly type: "PLAY_CARD";
      readonly cardId: string;
      readonly target:
        | { readonly type: "SELF" }
        | { readonly type: "PLAYERS" }
        | { readonly type: "MONSTER"; readonly encounterId: string }
        | { readonly type: "HAND_MONSTER"; readonly monsterCardId: string }
        | { readonly type: "EQUIPMENT"; readonly cardId: string };
      readonly reactionWindowId?: number;
      readonly combatId?: string;
      readonly combatRevision?: number;
    }
  | {
      readonly type: "USE_ROLE_ABILITY";
      readonly roleCardId: string;
      readonly costCardIds: readonly string[];
      readonly target: { readonly type: "SELF" } | { readonly type: "PLAYERS" };
      readonly reactionWindowId?: number;
      readonly combatId?: string;
      readonly combatRevision?: number;
    }
  | {
      readonly type: "PLAY_COMBAT_CURSE";
      readonly cardId: string;
      readonly targetPlayerId: string;
      readonly reactionWindowId: number;
      readonly combatId: string;
      readonly combatRevision: number;
    }
  | {
      readonly type: "PROPOSE_HELP";
      readonly helperId: string;
      readonly treasureCount: number;
      readonly combatId: string;
      readonly combatRevision: number;
    }
  | {
      readonly type:
        "ACCEPT_HELP_OFFER" | "REJECT_HELP_OFFER" | "CANCEL_HELP_OFFER";
      readonly offerId: string;
      readonly combatId: string;
      readonly combatRevision: number;
    }
  | { readonly type: "SCAVENGE" }
  | { readonly type: "EQUIP_ITEM"; readonly cardId: string }
  | { readonly type: "UNEQUIP_ITEM"; readonly cardId: string }
  | {
      readonly type: "PLAY_ROLE";
      readonly cardId: string;
      readonly replaceCardId?: string;
    }
  | { readonly type: "DISCARD_ROLE"; readonly cardId: string }
  | { readonly type: "PLAY_ROLE_PERMISSION"; readonly cardId: string }
  | { readonly type: "DISCARD_ROLE_PERMISSION"; readonly cardId: string }
  | {
      readonly type: "PLAY_CURSE";
      readonly cardId: string;
      readonly targetPlayerId: string;
    }
  | { readonly type: "SELL_ITEMS"; readonly cardIds: readonly string[] }
  | {
      readonly type: "RESOLVE_CARD_DISCARD";
      readonly decisionId: string;
      readonly cardIds: readonly string[];
      readonly combatId?: string;
      readonly combatRevision?: number;
    }
  | {
      readonly type: "RESOLVE_ROLE_RETENTION";
      readonly decisionId: string;
      readonly keepCardId: string;
    }
  | {
      readonly type: "TRADE_ITEM";
      readonly cardId: string;
      readonly recipientId: string;
    }
  | {
      readonly type: "GIVE_CHARITY";
      readonly cardIds: readonly string[];
      readonly recipientId: string | null;
    }
  | { readonly type: "GIVE_RANDOM_CHARITY" }
  | {
      readonly type: "RESPOND_TO_CURSE";
      readonly responseId: string;
      readonly response:
        | { readonly type: "DECLINE" }
        | {
            readonly type: "USE_PROTECTION";
            readonly cardId: string;
            readonly protectedCardId?: string;
          };
    };
export interface GameCommandPayload {
  readonly roomCode: string;
  readonly command: GameClientCommand;
}
export type GameActionAck =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly error: { readonly code: string; readonly message: string };
    };

export interface ClientToServerEvents {
  "game:rematch": (
    payload: GameLifecyclePayload,
    acknowledge: (response: GameActionAck) => void,
  ) => void;
  "game:return-to-lobby": (
    payload: GameLifecyclePayload,
    acknowledge: (response: GameActionAck) => void,
  ) => void;
  "game:command": (
    payload: GameCommandPayload,
    acknowledge: (response: GameActionAck) => void,
  ) => void;
  "game:start": (
    payload: StartLobbyPayload,
    acknowledge: (response: LobbyActionAck) => void,
  ) => void;
  "lobby:set-sex": (
    payload: SetPlayerSexPayload,
    acknowledge: (response: LobbyActionAck) => void,
  ) => void;
  "lobby:set-color": (
    payload: SetPlayerColorPayload,
    acknowledge: (response: LobbyActionAck) => void,
  ) => void;
  "lobby:set-settings": (
    payload: SetLobbySettingsPayload,
    acknowledge: (response: LobbyActionAck) => void,
  ) => void;
  "lobby:create": (
    payload: CreateLobbyPayload,
    acknowledge: (response: LobbyActionAck) => void,
  ) => void;
  "lobby:join": (
    payload: JoinLobbyPayload,
    acknowledge: (response: LobbyActionAck) => void,
  ) => void;
  "session:resume": (
    payload: ResumeSessionPayload,
    acknowledge: (response: LobbyActionAck) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "game:state": (state: GameView) => void;
  "lobby:state": (state: LobbyState) => void;
}
