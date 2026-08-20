import type { CardDefinition, CardEffect, CardInstance } from "./cards.js";
import type {
  CardDefinitionId,
  CardInstanceId,
  EncounterId,
  GameId,
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

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly level: number;
  readonly hand: readonly CardInstance[];
  readonly equipment: readonly CardInstance[];
  readonly classCard: CardInstance | null;
  readonly raceCard: CardInstance | null;
  readonly isDead: boolean;
  readonly temporaryCombatBonus: number;
}

export interface CombatState {
  readonly playerId: PlayerId;
  readonly revision: number;
  readonly monsters: readonly CombatMonsterState[];
  readonly nextEncounterSequence: number;
  readonly nextReactionWindowSequence: number;
  readonly reactionWindow: CombatReactionWindow | null;
  readonly requestedHelperId: PlayerId | null;
  readonly helperId: PlayerId | null;
  readonly history: readonly CombatHistoryEntry[];
  readonly runAway: RunAwaySequenceState | null;
}

export interface CombatReactionWindow {
  readonly windowId: number;
  readonly declaredAtRevision: number;
  readonly claimantId: PlayerId;
  readonly confirmedPlayerIds: readonly PlayerId[];
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
  readonly badStuff: readonly import("./cards.js").BadStuffEffect[];
  readonly strengthModifier: number;
  readonly treasureModifier: number;
  readonly playedCards: readonly CombatMonsterPlayedCard[];
}

export interface RunAwayAttemptState {
  readonly encounterId: EncounterId;
  readonly monsterCardId: CardInstanceId;
  readonly monsterDefinitionId: CardDefinitionId;
  readonly roll: number;
  readonly escaped: boolean;
  readonly badStuffApplied: boolean;
}

export interface RunAwaySequenceState {
  readonly nextMonsterIndex: number;
  readonly attempts: readonly RunAwayAttemptState[];
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
      readonly type: "HELP_REQUESTED";
      readonly playerId: PlayerId;
      readonly helperId: PlayerId;
    }
  | {
      readonly type: "HELP_ACCEPTED";
      readonly playerId: PlayerId;
      readonly helperId: PlayerId;
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
    };

export interface PendingCardDiscardDecision {
  readonly type: "DISCARD_CARDS";
  readonly playerId: PlayerId;
  readonly zone: "HAND" | "EQUIPMENT";
  readonly count: number;
  readonly sourceCardId: CardInstanceId;
  readonly sourceDefinitionId: CardDefinitionId;
  readonly remainingEffects: readonly CardEffect[];
  readonly completion: PendingEffectCompletion;
}

export interface GameState {
  readonly schemaVersion: 4;
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
  readonly lastRunAwayResult: RunAwayResultState | null;
  readonly pendingDecision: PendingCardDiscardDecision | null;
  readonly eventLog: readonly GameLogEntry[];
  readonly turnNumber: number;
  readonly winnerId: PlayerId | null;
}
