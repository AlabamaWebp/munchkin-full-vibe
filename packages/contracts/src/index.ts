export const APPLICATION_NAME = "Munchkin LAN";

export interface FoundationStatusResponse {
  applicationName: typeof APPLICATION_NAME;
  milestone: 3;
  engine: "domain-ready";
  serverConnection: "lobby-ready";
  gameplay: "not-implemented";
}

export const LOBBY_MIN_PLAYERS = 1;
export const LOBBY_MAX_PLAYERS = 6;
export const ROOM_CODE_LENGTH = 4;

export const LobbyStatus = {
  LOBBY: "LOBBY",
  STARTED: "STARTED",
} as const;

export type LobbyStatus = (typeof LobbyStatus)[keyof typeof LobbyStatus];

export interface LobbyPlayerView {
  readonly playerId: string;
  readonly name: string;
  readonly isHost: boolean;
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

export type LobbyErrorCode =
  | "ALREADY_IN_ROOM"
  | "GAME_ALREADY_STARTED"
  | "INVALID_PLAYER_NAME"
  | "INVALID_ROOM_CODE"
  | "NOT_HOST"
  | "PLAYER_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_NOT_FOUND";

export interface LobbyActionSuccess {
  readonly success: true;
  readonly roomCode: string;
  readonly playerId: string;
}

export interface LobbyActionFailure {
  readonly success: false;
  readonly error: {
    readonly code: LobbyErrorCode;
    readonly message: string;
  };
}

export type LobbyActionAck = LobbyActionSuccess | LobbyActionFailure;

export interface ClientToServerEvents {
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
}

export interface ServerToClientEvents {
  "lobby:state": (state: LobbyState) => void;
}
