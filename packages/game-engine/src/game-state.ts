import type { CardDefinition, CardInstance } from "./cards.js";
import type { GameId, PlayerId } from "./identifiers.js";

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
  readonly temporaryCombatBonus: number;
}

export interface CombatState {
  readonly playerId: PlayerId;
  readonly monster: CardInstance;
}

export interface GameState {
  readonly schemaVersion: 1;
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
  readonly turnNumber: number;
  readonly winnerId: PlayerId | null;
}
