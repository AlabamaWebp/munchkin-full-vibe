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

export interface LobbyPlayerView {
  readonly playerId: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly connected: boolean;
}

export interface LobbyState {
  readonly roomCode: string;
  readonly status: LobbyStatus;
  readonly hostPlayerId: string;
  readonly players: readonly LobbyPlayerView[];
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
  | "GAME_NOT_FINISHED";

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
  | "CLASS"
  | "RACE";
export type GameDeckType = "DOOR" | "TREASURE";
export type GameEquipmentSlot = "HEAD" | "BODY" | "FEET" | "HANDS";
export type GameCardPlayTiming =
  "TURN" | "ACTIVE_COMBAT" | "VICTORY_REACTION" | "WHEN_DRAWN";
export type GameCardTarget =
  | "SELF"
  | "ANY_PLAYER"
  | "COMBAT_PLAYERS"
  | "COMBAT_PLAYER"
  | "MONSTER_ENCOUNTER"
  | "HAND_MONSTER";

export interface GameCardView {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly artKey: string;
  readonly name: string;
  readonly description: string;
  readonly type: GameCardType;
  readonly deck: GameDeckType;
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
  };
  readonly monster?: {
    readonly level: number;
    readonly levelRewards: number;
    readonly treasureRewards: number;
    readonly badStuff: readonly GameBadStuffEffectView[];
  };
}

export type GameEffectView =
  | {
      readonly type:
        "COMBAT_BONUS" | "MONSTER_COMBAT_BONUS" | "GAIN_LEVEL" | "LOSE_LEVEL";
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
  readonly level: number;
  readonly handCount: number;
  readonly equipment: readonly GameCardView[];
  readonly temporaryCombatBonus: number;
  readonly equipmentCombatBonus: number;
  readonly combatPower: number;
  readonly classCard: GameCardView | null;
  readonly raceCard: GameCardView | null;
  readonly isDead: boolean;
}

export interface OwnPlayerView extends GamePlayerView {
  readonly hand: readonly GameCardView[];
}

export type AvailableGameAction =
  | "KICK_DOOR"
  | "LOOK_FOR_TROUBLE"
  | "ACCEPT_HELP"
  | "DECLARE_COMBAT_VICTORY"
  | "PASS_COMBAT_REACTION"
  | "RUN_AWAY"
  | "LOOT_ROOM"
  | "END_TURN";

export type CombatHistoryView =
  | {
      readonly type: "COMBAT_STARTED";
      readonly playerId: string;
      readonly encounterId: string;
      readonly monster: GameCardView;
    }
  | {
      readonly type: "HELP_REQUESTED" | "HELP_ACCEPTED";
      readonly playerId: string;
      readonly helperId: string;
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
  | "HELP_REQUESTED"
  | "HELP_ACCEPTED"
  | "LEVEL_GAINED"
  | "LEVEL_LOST"
  | "TREASURE_GAINED"
  | "ROOM_LOOTED"
  | "CARD_PLAYED"
  | "ITEM_EQUIPPED"
  | "ITEM_UNEQUIPPED"
  | "ROLE_PLAYED"
  | "ITEMS_SOLD"
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
  readonly card?: GameCardView;
  readonly cards?: readonly GameCardView[];
  readonly count?: number;
  readonly amount?: number;
  readonly value?: number;
  readonly newLevel?: number;
  readonly playerPower?: number;
  readonly monsterPower?: number;
  readonly roll?: number;
  readonly escaped?: boolean;
  readonly encounterId?: string;
  readonly reactionWindowId?: number;
  readonly sourceEncounterId?: string;
  readonly deck?: GameDeckType;
  readonly side?: "PLAYERS" | "MONSTER";
  readonly role?: "CLASS" | "RACE";
  readonly zone?: "HAND" | "EQUIPMENT";
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
  | { readonly type: "DISCARD_CARDS"; readonly playerId: string }
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
  readonly activePlayerId: string;
  readonly turnNumber: number;
  readonly winnerId: string | null;
  readonly players: readonly GamePlayerView[];
  readonly self: OwnPlayerView;
  readonly combat: {
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
    readonly helperContribution: number;
    readonly reactionWindow: {
      readonly windowId: number;
      readonly claimantId: string;
      readonly confirmedPlayerIds: readonly string[];
      readonly waitingPlayerIds: readonly string[];
    } | null;
    readonly history: readonly CombatHistoryView[];
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
  readonly pendingDecision: {
    readonly type: "DISCARD_CARDS";
    readonly playerId: string;
    readonly zone: "HAND" | "EQUIPMENT";
    readonly count: number;
    readonly sourceCard: GameCardView;
    readonly selectableCardIds: readonly string[];
  } | null;
  readonly gameLog: readonly GameLogEntryView[];
  readonly expectedAction: ExpectedGameActionView;
  readonly deckCounts: { readonly door: number; readonly treasure: number };
  readonly availableActions: readonly AvailableGameAction[];
  readonly lookForTroubleCardIds: readonly string[];
  readonly availableEquipmentActions: {
    readonly equipCardIds: readonly string[];
    readonly unequipCardIds: readonly string[];
  };
  readonly requestableHelperIds: readonly string[];
  readonly playableCombatCards: {
    readonly playersSideCardIds: readonly string[];
    readonly monsterSideCardIds: readonly string[];
    readonly monsterTargetActions: readonly {
      readonly cardId: string;
      readonly encounterIds: readonly string[];
    }[];
    readonly addMonsterActions: readonly {
      readonly cardId: string;
      readonly monsterCardIds: readonly string[];
    }[];
    readonly playerTargetActions: readonly {
      readonly cardId: string;
      readonly playerIds: readonly string[];
    }[];
  };
  readonly expandedRuleActions: {
    readonly playableRoleCardIds: readonly string[];
    readonly playableCurseCardIds: readonly string[];
    readonly sellableItemCardIds: readonly string[];
    readonly tradeableItemCardIds: readonly string[];
    readonly charityCardCount: number;
    readonly charityRecipientIds: readonly string[];
  };
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
      readonly combatRevision: number;
    }
  | {
      readonly type: "PASS_COMBAT_REACTION";
      readonly reactionWindowId: number;
    }
  | { readonly type: "RUN_AWAY" }
  | {
      readonly type: "PLAY_CARD";
      readonly cardId: string;
      readonly target:
        | { readonly type: "PLAYERS" }
        | { readonly type: "MONSTER"; readonly encounterId: string }
        | { readonly type: "HAND_MONSTER"; readonly monsterCardId: string };
      readonly reactionWindowId?: number;
    }
  | {
      readonly type: "PLAY_COMBAT_CURSE";
      readonly cardId: string;
      readonly targetPlayerId: string;
      readonly reactionWindowId: number;
    }
  | { readonly type: "REQUEST_HELP"; readonly helperId: string }
  | { readonly type: "ACCEPT_HELP" }
  | { readonly type: "EQUIP_ITEM"; readonly cardId: string }
  | { readonly type: "UNEQUIP_ITEM"; readonly cardId: string }
  | { readonly type: "PLAY_ROLE"; readonly cardId: string }
  | {
      readonly type: "PLAY_CURSE";
      readonly cardId: string;
      readonly targetPlayerId: string;
    }
  | { readonly type: "SELL_ITEMS"; readonly cardIds: readonly string[] }
  | {
      readonly type: "RESOLVE_CARD_DISCARD";
      readonly cardIds: readonly string[];
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
  | { readonly type: "GIVE_RANDOM_CHARITY" };
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
