import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  LOBBY_MAX_PLAYERS,
  PLAYER_COLORS,
  LobbyStatus,
  ROOM_CODE_LENGTH,
  type CreateLobbyPayload,
  type JoinLobbyPayload,
  type LobbyActionFailure,
  type LobbyActionSuccess,
  type LobbyErrorCode,
  type LobbyState,
  type ResumeSessionPayload,
  type SetLobbySettingsPayload,
  type SetPlayerColorPayload,
  type SetPlayerSexPayload,
  type StartLobbyPayload,
} from '@munchkin-lan/contracts';
import { RoomCodeService } from './room-code.service';

interface LobbyPlayerRecord {
  readonly playerId: string;
  readonly name: string;
  readonly sessionToken: string;
  socketId: string | null;
  connected: boolean;
  sex: import('@munchkin-lan/contracts').PlayerSex | null;
  color: import('@munchkin-lan/contracts').PlayerColor;
}

interface LobbyRoomRecord {
  readonly roomCode: string;
  status: LobbyStatus;
  readonly hostPlayerId: string;
  readonly players: LobbyPlayerRecord[];
  settings: {
    mode: import('@munchkin-lan/contracts').GameMode;
    enabledSetIds: readonly import('@munchkin-lan/contracts').CardSetId[];
  };
}

export interface LobbyOperationSuccess {
  readonly success: true;
  readonly acknowledgement: LobbyActionSuccess;
  readonly state: LobbyState;
  readonly previousSocketId?: string;
}

export interface LobbyOperationFailure {
  readonly success: false;
  readonly acknowledgement: LobbyActionFailure;
}

export type LobbyOperationResult =
  LobbyOperationSuccess | LobbyOperationFailure;

export interface LobbyDeparture {
  readonly roomCode: string;
  readonly state: LobbyState;
}

export interface LobbyGamePlayer {
  readonly playerId: string;
  readonly name: string;
  readonly sex: import('@munchkin-lan/contracts').PlayerSex;
  readonly color: import('@munchkin-lan/contracts').PlayerColor;
}

export interface ConnectedLobbyPlayer extends LobbyGamePlayer {
  readonly socketId: string;
}

const ROOM_CODE_PATTERN = new RegExp(`^[A-Z2-9]{${ROOM_CODE_LENGTH}}$`);

function failure(code: LobbyErrorCode, message: string): LobbyOperationFailure {
  return {
    success: false,
    acknowledgement: { success: false, error: { code, message } },
  };
}

@Injectable()
export class LobbyService {
  private readonly rooms = new Map<string, LobbyRoomRecord>();
  private readonly roomCodeBySocketId = new Map<string, string>();
  private readonly roomCodeBySessionToken = new Map<string, string>();

  constructor(private readonly roomCodes: RoomCodeService) {}

  createRoom(
    socketId: string,
    payload: CreateLobbyPayload,
  ): LobbyOperationResult {
    if (this.roomCodeBySocketId.has(socketId)) {
      return failure(
        'ALREADY_IN_ROOM',
        'This connection is already in a room.',
      );
    }
    const name = this.normalizePlayerName(payload?.playerName);
    if (name === null)
      return failure('INVALID_PLAYER_NAME', 'Enter a player name.');

    const roomCode = this.generateUniqueRoomCode();
    const player = this.createPlayer(socketId, name, PLAYER_COLORS[0]);
    const room: LobbyRoomRecord = {
      roomCode,
      status: LobbyStatus.LOBBY,
      hostPlayerId: player.playerId,
      players: [player],
      settings: { mode: 'BALANCED', enabledSetIds: ['CORE'] },
    };
    this.rooms.set(roomCode, room);
    this.trackPlayer(roomCode, player);
    return this.success(room, player);
  }

  joinRoom(socketId: string, payload: JoinLobbyPayload): LobbyOperationResult {
    if (this.roomCodeBySocketId.has(socketId)) {
      return failure(
        'ALREADY_IN_ROOM',
        'This connection is already in a room.',
      );
    }
    const roomCode = this.normalizeRoomCode(payload?.roomCode);
    if (roomCode === null) {
      return failure(
        'INVALID_ROOM_CODE',
        `Enter a ${ROOM_CODE_LENGTH}-character room code.`,
      );
    }
    const name = this.normalizePlayerName(payload?.playerName);
    if (name === null)
      return failure('INVALID_PLAYER_NAME', 'Enter a player name.');

    const room = this.rooms.get(roomCode);
    if (room === undefined)
      return failure('ROOM_NOT_FOUND', 'No room exists with that code.');
    if (room.status !== LobbyStatus.LOBBY) {
      return failure('GAME_ALREADY_STARTED', 'That game has already started.');
    }
    if (room.players.length >= LOBBY_MAX_PLAYERS) {
      return failure(
        'ROOM_FULL',
        `A room supports at most ${LOBBY_MAX_PLAYERS} players.`,
      );
    }

    const color = PLAYER_COLORS.find(
      (candidate) => !room.players.some((player) => player.color === candidate),
    );
    if (color === undefined)
      return failure(
        'ROOM_FULL',
        `A room supports at most ${LOBBY_MAX_PLAYERS} players.`,
      );
    const player = this.createPlayer(socketId, name, color);
    room.players.push(player);
    this.trackPlayer(roomCode, player);
    return this.success(room, player);
  }

  resumeSession(
    socketId: string,
    payload: ResumeSessionPayload,
  ): LobbyOperationResult {
    if (this.roomCodeBySocketId.has(socketId)) {
      return failure(
        'ALREADY_IN_ROOM',
        'This connection is already in a room.',
      );
    }
    const roomCode = this.normalizeRoomCode(payload?.roomCode);
    if (roomCode === null || typeof payload?.sessionToken !== 'string') {
      return failure('INVALID_SESSION', 'The saved session is invalid.');
    }
    if (this.roomCodeBySessionToken.get(payload.sessionToken) !== roomCode) {
      return failure(
        'INVALID_SESSION',
        'The saved session could not be resumed.',
      );
    }
    const room = this.rooms.get(roomCode);
    const player = room?.players.find(
      (candidate) => candidate.sessionToken === payload.sessionToken,
    );
    if (room === undefined || player === undefined) {
      return failure(
        'INVALID_SESSION',
        'The saved session could not be resumed.',
      );
    }

    const previousSocketId = player.socketId ?? undefined;
    if (previousSocketId !== undefined)
      this.roomCodeBySocketId.delete(previousSocketId);
    player.socketId = socketId;
    player.connected = true;
    this.roomCodeBySocketId.set(socketId, roomCode);
    return { ...this.success(room, player), previousSocketId };
  }

  startRoom(
    socketId: string,
    payload: StartLobbyPayload,
  ): LobbyOperationResult {
    const roomCode = this.normalizeRoomCode(payload?.roomCode);
    if (roomCode === null) {
      return failure(
        'INVALID_ROOM_CODE',
        `Enter a ${ROOM_CODE_LENGTH}-character room code.`,
      );
    }
    const room = this.rooms.get(roomCode);
    if (room === undefined)
      return failure('ROOM_NOT_FOUND', 'No room exists with that code.');
    const player = room.players.find(
      (candidate) =>
        candidate.socketId === socketId &&
        candidate.playerId === payload?.playerId,
    );
    if (player === undefined) {
      return failure(
        'PLAYER_NOT_FOUND',
        'This connection is not a player in that room.',
      );
    }
    if (room.hostPlayerId !== player.playerId) {
      return failure('NOT_HOST', 'Only the host can start the game.');
    }
    if (room.status !== LobbyStatus.LOBBY) {
      return failure('GAME_ALREADY_STARTED', 'The game has already started.');
    }
    if (room.players.some((candidate) => candidate.sex === null)) {
      return failure(
        'SEX_REQUIRED',
        'Every player must choose a sex before starting.',
      );
    }

    room.status = LobbyStatus.STARTED;
    return this.success(room, player);
  }

  setPlayerSex(
    socketId: string,
    payload: SetPlayerSexPayload,
  ): LobbyOperationResult {
    const roomCode = this.normalizeRoomCode(payload?.roomCode);
    const room = roomCode === null ? undefined : this.rooms.get(roomCode);
    const player = room?.players.find(
      (candidate) =>
        candidate.socketId === socketId &&
        candidate.playerId === payload?.playerId,
    );
    if (room === undefined || player === undefined)
      return failure(
        'PLAYER_NOT_FOUND',
        'This connection is not a player in that room.',
      );
    if (room.status !== LobbyStatus.LOBBY)
      return failure('GAME_ALREADY_STARTED', 'The game has already started.');
    if (payload.sex !== 'MALE' && payload.sex !== 'FEMALE')
      return failure('INVALID_GAME_SETTINGS', 'Choose a valid sex.');
    player.sex = payload.sex;
    return this.success(room, player);
  }

  setPlayerColor(
    socketId: string,
    payload: SetPlayerColorPayload,
  ): LobbyOperationResult {
    const roomCode = this.normalizeRoomCode(payload?.roomCode);
    const room = roomCode === null ? undefined : this.rooms.get(roomCode);
    const player = room?.players.find(
      (candidate) =>
        candidate.socketId === socketId &&
        candidate.playerId === payload?.playerId,
    );
    if (room === undefined || player === undefined)
      return failure(
        'PLAYER_NOT_FOUND',
        'This connection is not a player in that room.',
      );
    if (room.status !== LobbyStatus.LOBBY)
      return failure('GAME_ALREADY_STARTED', 'The game has already started.');
    if (!PLAYER_COLORS.includes(payload.color))
      return failure('INVALID_GAME_SETTINGS', 'Choose a valid player color.');
    if (
      room.players.some(
        (candidate) =>
          candidate !== player && candidate.color === payload.color,
      )
    )
      return failure('COLOR_TAKEN', 'That player color is already taken.');
    player.color = payload.color;
    return this.success(room, player);
  }

  setSettings(
    socketId: string,
    payload: SetLobbySettingsPayload,
  ): LobbyOperationResult {
    const roomCode = this.normalizeRoomCode(payload?.roomCode);
    const room = roomCode === null ? undefined : this.rooms.get(roomCode);
    const player = room?.players.find(
      (candidate) =>
        candidate.socketId === socketId &&
        candidate.playerId === payload?.playerId,
    );
    if (room === undefined || player === undefined)
      return failure(
        'PLAYER_NOT_FOUND',
        'This connection is not a player in that room.',
      );
    if (room.hostPlayerId !== player.playerId)
      return failure('NOT_HOST', 'Only the host can change game settings.');
    if (room.status !== LobbyStatus.LOBBY)
      return failure('GAME_ALREADY_STARTED', 'The game has already started.');
    if (
      (payload.mode !== 'BALANCED' && payload.mode !== 'CLASSIC_CHAOS') ||
      !Array.isArray(payload.enabledSetIds)
    )
      return failure('INVALID_GAME_SETTINGS', 'Choose valid game settings.');
    const valid = new Set(['CORE', 'COMPANIONS', 'ARSENAL', 'DUAL_IDENTITY']);
    const ids = payload.enabledSetIds;
    if (
      !ids.includes('CORE') ||
      ids.length !== new Set(ids).size ||
      ids.some((id) => !valid.has(id))
    )
      return failure(
        'INVALID_GAME_SETTINGS',
        'CORE must be enabled and card sets must be unique.',
      );
    room.settings = { mode: payload.mode, enabledSetIds: [...ids] };
    return this.success(room, player);
  }

  authorizeHost(
    socketId: string,
    payload: StartLobbyPayload,
  ): LobbyOperationResult {
    const authorized = this.findHost(socketId, payload);
    return authorized.success
      ? this.success(authorized.room, authorized.player)
      : authorized.result;
  }

  returnToLobby(
    socketId: string,
    payload: StartLobbyPayload,
  ): LobbyOperationResult {
    const authorized = this.findHost(socketId, payload);
    if (!authorized.success) return authorized.result;
    authorized.room.status = LobbyStatus.LOBBY;
    return this.success(authorized.room, authorized.player);
  }

  disconnect(socketId: string): LobbyDeparture | null {
    const roomCode = this.roomCodeBySocketId.get(socketId);
    if (roomCode === undefined) return null;
    this.roomCodeBySocketId.delete(socketId);
    const room = this.rooms.get(roomCode);
    const player = room?.players.find(
      (candidate) => candidate.socketId === socketId,
    );
    if (room === undefined || player === undefined) return null;
    player.socketId = null;
    player.connected = false;
    return { roomCode, state: this.toState(room) };
  }

  getGamePlayers(roomCode: string): readonly LobbyGamePlayer[] {
    return (
      this.rooms
        .get(roomCode)
        ?.players.flatMap(({ playerId, name, sex, color }) =>
          sex === null ? [] : [{ playerId, name, sex, color }],
        ) ?? []
    );
  }

  getGameConfig(roomCode: string): LobbyRoomRecord['settings'] | null {
    return this.rooms.get(roomCode)?.settings ?? null;
  }

  getConnectedPlayers(roomCode: string): readonly ConnectedLobbyPlayer[] {
    return (
      this.rooms.get(roomCode)?.players.flatMap((player) =>
        player.connected && player.socketId !== null
          ? [
              {
                playerId: player.playerId,
                name: player.name,
                sex: player.sex ?? 'MALE',
                color: player.color,
                socketId: player.socketId,
              },
            ]
          : [],
      ) ?? []
    );
  }

  getPlayerForSocket(
    socketId: string,
    roomCode: string,
  ): LobbyGamePlayer | null {
    const normalizedRoomCode = this.normalizeRoomCode(roomCode);
    if (
      normalizedRoomCode === null ||
      this.roomCodeBySocketId.get(socketId) !== normalizedRoomCode
    ) {
      return null;
    }
    const player = this.rooms
      .get(normalizedRoomCode)
      ?.players.find((candidate) => candidate.socketId === socketId);
    return player === undefined
      ? null
      : player.sex === null
        ? null
        : {
            playerId: player.playerId,
            name: player.name,
            sex: player.sex,
            color: player.color,
          };
  }

  private findHost(
    socketId: string,
    payload: StartLobbyPayload,
  ):
    | {
        readonly success: true;
        readonly room: LobbyRoomRecord;
        readonly player: LobbyPlayerRecord;
      }
    | { readonly success: false; readonly result: LobbyOperationFailure } {
    const roomCode = this.normalizeRoomCode(payload?.roomCode);
    if (roomCode === null) {
      return {
        success: false,
        result: failure(
          'INVALID_ROOM_CODE',
          `Enter a ${ROOM_CODE_LENGTH}-character room code.`,
        ),
      };
    }
    const room = this.rooms.get(roomCode);
    if (room === undefined)
      return {
        success: false,
        result: failure('ROOM_NOT_FOUND', 'No room exists with that code.'),
      };
    const player = room.players.find(
      (candidate) =>
        candidate.socketId === socketId &&
        candidate.playerId === payload?.playerId,
    );
    if (player === undefined)
      return {
        success: false,
        result: failure(
          'PLAYER_NOT_FOUND',
          'This connection is not a player in that room.',
        ),
      };
    if (room.hostPlayerId !== player.playerId)
      return {
        success: false,
        result: failure('NOT_HOST', 'Only the host can perform this action.'),
      };
    if (room.status !== LobbyStatus.STARTED)
      return {
        success: false,
        result: failure(
          'GAME_NOT_FINISHED',
          'There is no finished game in this room.',
        ),
      };
    return { success: true, room, player };
  }

  private normalizePlayerName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name.length > 0 ? name : null;
  }

  private normalizeRoomCode(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const roomCode = value.trim().toUpperCase();
    return ROOM_CODE_PATTERN.test(roomCode) ? roomCode : null;
  }

  private generateUniqueRoomCode(): string {
    let roomCode = this.roomCodes.generate();
    while (this.rooms.has(roomCode)) roomCode = this.roomCodes.generate();
    return roomCode;
  }

  private createPlayer(
    socketId: string,
    name: string,
    color: import('@munchkin-lan/contracts').PlayerColor,
  ): LobbyPlayerRecord {
    return {
      playerId: randomUUID(),
      name,
      sessionToken: randomUUID(),
      socketId,
      connected: true,
      sex: null,
      color,
    };
  }

  private trackPlayer(roomCode: string, player: LobbyPlayerRecord): void {
    this.roomCodeBySocketId.set(player.socketId as string, roomCode);
    this.roomCodeBySessionToken.set(player.sessionToken, roomCode);
  }

  private success(
    room: LobbyRoomRecord,
    player: LobbyPlayerRecord,
  ): LobbyOperationSuccess {
    return {
      success: true,
      acknowledgement: {
        success: true,
        roomCode: room.roomCode,
        playerId: player.playerId,
        sessionToken: player.sessionToken,
      },
      state: this.toState(room),
    };
  }

  private toState(room: LobbyRoomRecord): LobbyState {
    return {
      roomCode: room.roomCode,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      players: room.players.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        isHost: player.playerId === room.hostPlayerId,
        connected: player.connected,
        sex: player.sex,
        color: player.color,
      })),
      settings: room.settings,
    };
  }
}
