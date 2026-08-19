import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  LOBBY_MAX_PLAYERS,
  LobbyStatus,
  ROOM_CODE_LENGTH,
  type CreateLobbyPayload,
  type JoinLobbyPayload,
  type LobbyActionFailure,
  type LobbyActionSuccess,
  type LobbyErrorCode,
  type LobbyState,
  type StartLobbyPayload,
} from '@munchkin-lan/contracts';
import { RoomCodeService } from './room-code.service';

interface LobbyPlayerRecord {
  readonly playerId: string;
  readonly name: string;
  readonly socketId: string;
}

interface LobbyRoomRecord {
  readonly roomCode: string;
  status: LobbyStatus;
  hostPlayerId: string;
  readonly players: LobbyPlayerRecord[];
}

export interface LobbyOperationSuccess {
  readonly success: true;
  readonly acknowledgement: LobbyActionSuccess;
  readonly state: LobbyState;
}

export interface LobbyOperationFailure {
  readonly success: false;
  readonly acknowledgement: LobbyActionFailure;
}

export type LobbyOperationResult =
  LobbyOperationSuccess | LobbyOperationFailure;

export interface LobbyDeparture {
  readonly roomCode: string;
  readonly state: LobbyState | null;
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
    if (name === null) {
      return failure('INVALID_PLAYER_NAME', 'Enter a player name.');
    }

    const roomCode = this.generateUniqueRoomCode();
    const player = this.createPlayer(socketId, name);
    const room: LobbyRoomRecord = {
      roomCode,
      status: LobbyStatus.LOBBY,
      hostPlayerId: player.playerId,
      players: [player],
    };
    this.rooms.set(roomCode, room);
    this.roomCodeBySocketId.set(socketId, roomCode);

    return this.success(room, player.playerId);
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
    if (name === null) {
      return failure('INVALID_PLAYER_NAME', 'Enter a player name.');
    }

    const room = this.rooms.get(roomCode);
    if (room === undefined) {
      return failure('ROOM_NOT_FOUND', 'No room exists with that code.');
    }
    if (room.status !== LobbyStatus.LOBBY) {
      return failure('GAME_ALREADY_STARTED', 'That game has already started.');
    }
    if (room.players.length >= LOBBY_MAX_PLAYERS) {
      return failure(
        'ROOM_FULL',
        `A room supports at most ${LOBBY_MAX_PLAYERS} players.`,
      );
    }

    const player = this.createPlayer(socketId, name);
    room.players.push(player);
    this.roomCodeBySocketId.set(socketId, roomCode);

    return this.success(room, player.playerId);
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
    if (room === undefined) {
      return failure('ROOM_NOT_FOUND', 'No room exists with that code.');
    }
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

    room.status = LobbyStatus.STARTED;
    return this.success(room, player.playerId);
  }

  disconnect(socketId: string): LobbyDeparture | null {
    const roomCode = this.roomCodeBySocketId.get(socketId);
    if (roomCode === undefined) {
      return null;
    }

    this.roomCodeBySocketId.delete(socketId);
    const room = this.rooms.get(roomCode);
    if (room === undefined) {
      return null;
    }

    const departingPlayer = room.players.find(
      (player) => player.socketId === socketId,
    );
    const index = room.players.findIndex(
      (player) => player.socketId === socketId,
    );
    if (index >= 0) {
      room.players.splice(index, 1);
    }
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      return { roomCode, state: null };
    }
    if (departingPlayer?.playerId === room.hostPlayerId) {
      const nextHost = room.players[0];
      if (nextHost !== undefined) {
        room.hostPlayerId = nextHost.playerId;
      }
    }

    return { roomCode, state: this.toState(room) };
  }

  private normalizePlayerName(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const name = value.trim();
    return name.length > 0 ? name : null;
  }

  private normalizeRoomCode(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const roomCode = value.trim().toUpperCase();
    return ROOM_CODE_PATTERN.test(roomCode) ? roomCode : null;
  }

  private generateUniqueRoomCode(): string {
    let roomCode = this.roomCodes.generate();
    while (this.rooms.has(roomCode)) {
      roomCode = this.roomCodes.generate();
    }
    return roomCode;
  }

  private createPlayer(socketId: string, name: string): LobbyPlayerRecord {
    return { playerId: randomUUID(), name, socketId };
  }

  private success(
    room: LobbyRoomRecord,
    playerId: string,
  ): LobbyOperationSuccess {
    return {
      success: true,
      acknowledgement: { success: true, roomCode: room.roomCode, playerId },
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
      })),
    };
  }
}
