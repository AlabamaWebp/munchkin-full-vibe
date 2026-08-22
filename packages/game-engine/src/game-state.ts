import type {
  CardDefinition,
  CardEffect,
  CardInstance,
  GameMode,
  PlayerSex,
  CardSetId,
  CardTier,
  MonsterTag,
} from "./cards.js";
import type {
  CardDefinitionId,
  CardInstanceId,
  CombatId,
  CurseResponseId,
  EncounterId,
  GameId,
  HelpOfferId,
  PendingDecisionId,
  PlayerId,
} from "./identifiers.js";
import type { GameEvent } from "./events.js";

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

export interface GameConfig {
  readonly mode: GameMode;
  readonly enabledSetIds: readonly CardSetId[];
}

export type ActiveEffect =
  | {
      readonly type: "COMBAT_POWER";
      readonly sourceDefinitionId: CardDefinitionId;
      readonly amount: number;
      readonly expires: "END_OF_COMBAT" | "END_OF_TARGET_NEXT_TURN";
      readonly targetTurnNumber?: number;
    }
  | {
      readonly type: "RUN_AWAY_ROLL";
      readonly sourceDefinitionId: CardDefinitionId;
      readonly amount: number;
      readonly expires: "END_OF_TARGET_NEXT_TURN";
      readonly targetTurnNumber: number;
    }
  | {
      readonly type: "SLOT_LOCK";
      readonly sourceDefinitionId: CardDefinitionId;
      readonly slot: import("./cards.js").EquipmentSlot;
      readonly expires: "END_OF_TARGET_NEXT_TURN";
      readonly targetTurnNumber: number;
    };

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly sex: PlayerSex;
  readonly level: number;
  readonly hand: readonly CardInstance[];
  readonly equipment: readonly CardInstance[];
  readonly equipmentAttachments: readonly {
    readonly card: CardInstance;
    readonly attachedToCardId: CardInstanceId;
  }[];
  readonly classCards: readonly CardInstance[];
  readonly raceCards: readonly CardInstance[];
  readonly rolePermissionCards: readonly CardInstance[];
  readonly hirelingCard: CardInstance | null;
  readonly mountCard: CardInstance | null;
  readonly isDead: boolean;
  readonly activeEffects: readonly ActiveEffect[];
}

export interface CombatState {
  readonly combatId: CombatId;
  readonly playerId: PlayerId;
  readonly revision: number;
  readonly monsters: readonly CombatMonsterState[];
  readonly nextEncounterSequence: number;
  readonly nextHelpOfferSequence: number;
  readonly nextReactionWindowSequence: number;
  readonly reactionWindow: CombatReactionWindow | null;
  readonly helpOffer: HelpOfferState | null;
  readonly helpAgreement: HelpAgreement | null;
  readonly history: readonly CombatHistoryEntry[];
  readonly runAway: RunAwaySequenceState | null;
}

export interface CombatReactionWindow {
  readonly windowId: number;
  readonly declaredAtRevision: number;
  readonly claimantId: PlayerId;
  readonly confirmedPlayerIds: readonly PlayerId[];
  readonly eligiblePlayerIds: readonly PlayerId[];
  readonly expiresAtEpochMs: number;
}

export interface HelpOfferState {
  readonly offerId: HelpOfferId;
  readonly helperId: PlayerId;
  readonly proposedBy: "ACTIVE" | "HELPER";
  readonly treasureCount: number;
  readonly expiresAtEpochMs: number;
}

export interface HelpAgreement {
  readonly helperId: PlayerId;
  readonly promisedTreasures: number;
  readonly acceptedOfferId: HelpOfferId;
  readonly agreedAtCombatRevision: number;
}

export interface CombatMonsterPlayedCard {
  readonly card: CardInstance;
  readonly playerId: PlayerId;
  readonly strengthModifier: number;
  readonly treasureModifier: number;
  readonly purpose: "MODIFIER" | "ADD_MONSTER" | "CLONE_MONSTER";
}

export interface CombatMonsterState {
  readonly encounterId: EncounterId;
  readonly monster: CardInstance;
  readonly sourceCard: CardInstance;
  readonly clonedFromEncounterId: EncounterId | null;
  readonly baseStrength: number;
  readonly baseLevelRewards: number;
  readonly baseTreasureRewards: number;
  readonly tier: CardTier;
  readonly tags: readonly MonsterTag[];
  readonly badStuff: readonly import("./cards.js").BadStuffEffect[];
  readonly strengthModifier: number;
  readonly treasureModifier: number;
  readonly playedCards: readonly CombatMonsterPlayedCard[];
}

export interface RunAwayAttemptState {
  readonly encounterId: EncounterId;
  readonly monsterCardId: CardInstanceId;
  readonly monsterDefinitionId: CardDefinitionId;
  readonly combatantId: PlayerId;
  readonly roll: number | null;
  readonly outcome: "ESCAPED" | "FAILED" | "SKIPPED_DEAD";
  readonly badStuffApplied: boolean;
}

export interface RunAwaySequenceState {
  readonly combatantIds: readonly PlayerId[];
  readonly cursor: {
    readonly encounterIndex: number;
    readonly combatantIndex: number;
  };
  readonly attempts: readonly RunAwayAttemptState[];
  readonly sharedBadStuffResolvedEncounterIds: readonly EncounterId[];
  readonly sharedBadStuffCursor: {
    readonly encounterIndex: number;
    readonly nextCombatantIndex: number;
  } | null;
}

export interface RunAwayResultState {
  readonly playerId: PlayerId;
  readonly attempts: readonly RunAwayAttemptState[];
}

export type CombatHistoryEntry =
  | {
      readonly type: "COMBAT_STARTED";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly monsterDefinitionId: CardDefinitionId;
    }
  | {
      readonly type: "HELP_OFFERED" | "HELP_COUNTERED";
      readonly playerId: PlayerId;
      readonly helperId: PlayerId;
      readonly offerId: HelpOfferId;
      readonly treasureCount: number;
    }
  | {
      readonly type: "HELP_OFFER_ACCEPTED";
      readonly playerId: PlayerId;
      readonly helperId: PlayerId;
      readonly offerId: HelpOfferId;
      readonly treasureCount: number;
    }
  | {
      readonly type: "CARD_PLAYED";
      readonly playerId: PlayerId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
      readonly side: "PLAYERS" | "MONSTER";
      readonly encounterId?: EncounterId;
      readonly targetPlayerId?: PlayerId;
    }
  | {
      readonly type: "MONSTER_ADDED";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly monsterDefinitionId: CardDefinitionId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    }
  | {
      readonly type: "MONSTER_CLONED";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly sourceEncounterId: EncounterId;
      readonly monsterDefinitionId: CardDefinitionId;
      readonly cardId: CardInstanceId;
      readonly definitionId: CardDefinitionId;
    };

export interface GameLogEntry {
  readonly sequence: number;
  readonly turnNumber: number;
  readonly phase: GamePhase;
  readonly event: GameEvent;
}

export type PendingEffectCompletion =
  | {
      readonly type: "CURSE";
      readonly card: CardInstance;
      readonly targetPlayerId: PlayerId;
      readonly phaseAfterResolution: "POST_DOOR" | null;
    }
  | {
      readonly type: "RUN_AWAY";
      readonly playerId: PlayerId;
      readonly encounterId: EncounterId;
      readonly combatId: CombatId;
      readonly combatRevision: number;
    };

interface PendingDecisionBase {
  readonly decisionId: PendingDecisionId;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface PendingCardDiscardDecision extends PendingDecisionBase {
  readonly type: "DISCARD_CARDS";
  readonly playerId: PlayerId;
  readonly zone: "HAND" | "EQUIPMENT";
  readonly count: number;
  readonly sourceCardId: CardInstanceId;
  readonly sourceDefinitionId: CardDefinitionId;
  readonly remainingEffects: readonly CardEffect[];
  readonly completion: PendingEffectCompletion;
  readonly protectedCardId?: CardInstanceId;
}

export interface PendingRoleRetentionDecision extends PendingDecisionBase {
  readonly type: "CHOOSE_ROLE_TO_KEEP";
  readonly playerId: PlayerId;
  readonly role: "CLASS" | "RACE";
  readonly candidateCardIds: readonly CardInstanceId[];
}

export type PendingDecision =
  PendingCardDiscardDecision | PendingRoleRetentionDecision;

export interface CurseResponseState {
  readonly responseId: CurseResponseId;
  readonly targetPlayerId: PlayerId;
  readonly sourcePlayerId: PlayerId | null;
  readonly curseCard: CardInstance;
  readonly remainingEffects: readonly CardEffect[];
  readonly phaseAfterResolution: "POST_DOOR" | null;
  readonly cancelCardIds: readonly CardInstanceId[];
  readonly itemGuardCardIds: readonly CardInstanceId[];
  readonly protectableItemIds: readonly CardInstanceId[];
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface GameState {
  readonly schemaVersion: 5;
  readonly config: GameConfig;
  readonly id: GameId;
  readonly status: GameStatus;
  readonly phase: GamePhase;
  readonly players: readonly PlayerState[];
  readonly activePlayerId: PlayerId | null;
  readonly cardDefinitions: readonly CardDefinition[];
  readonly doorDeck: readonly CardInstance[];
  readonly treasureDeck: readonly CardInstance[];
  readonly doorDiscard: readonly CardInstance[];
  readonly treasureDiscard: readonly CardInstance[];
  readonly combat: CombatState | null;
  readonly nextCombatSequence: number;
  readonly lastRunAwayResult: RunAwayResultState | null;
  readonly pendingDecision: PendingDecision | null;
  readonly curseResponse: CurseResponseState | null;
  readonly nextCurseResponseSequence: number;
  readonly nextPendingDecisionSequence: number;
  readonly eventLog: readonly GameLogEntry[];
  readonly turnNumber: number;
  readonly winnerId: PlayerId | null;
}
