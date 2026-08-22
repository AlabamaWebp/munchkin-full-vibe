import { computed, Injectable, signal } from '@angular/core';
import {
  LobbyStatus,
  type ClientToServerEvents,
  type GameClientCommand,
  type CardSetId,
  type GameMode,
  type GameView,
  type LobbyActionAck,
  type LobbyState,
  type ServerToClientEvents,
} from '@munchkin-lan/contracts';
import { io, type Socket } from 'socket.io-client';

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
export interface UserFacingError {
  readonly code: string;
  readonly message: string;
}
type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SavedSession {
  readonly roomCode: string;
  readonly playerId: string;
  readonly sessionToken: string;
}

const SESSION_STORAGE_KEY = 'munchkin-lan.session';

export function resolveSocketUrl(
  location: Pick<Location, 'hostname' | 'origin' | 'port' | 'protocol'>,
): string {
  return location.port === '4200'
    ? `${location.protocol}//${location.hostname}:3000`
    : location.origin;
}

export function readSavedSession(storage: Pick<Storage, 'getItem'>): SavedSession | null {
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'roomCode' in value &&
      typeof value.roomCode === 'string' &&
      'playerId' in value &&
      typeof value.playerId === 'string' &&
      'sessionToken' in value &&
      typeof value.sessionToken === 'string'
    ) {
      return value as SavedSession;
    }
  } catch {
    // Invalid local data is treated as no resumable session.
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class LobbyClient {
  private currentSession = readSavedSession(window.localStorage);
  private readonly socket: LobbySocket = io(resolveSocketUrl(window.location));
  private readonly connectionState = signal<ConnectionState>('CONNECTING');
  private readonly currentLobby = signal<LobbyState | null>(null);
  private readonly currentGame = signal<GameView | null>(null);
  private readonly currentPlayerId = signal<string | null>(this.currentSession?.playerId ?? null);
  private readonly currentError = signal<UserFacingError | null>(null);
  private readonly requestPending = signal(false);

  readonly connection = this.connectionState.asReadonly();
  readonly lobby = this.currentLobby.asReadonly();
  readonly game = this.currentGame.asReadonly();
  readonly playerId = this.currentPlayerId.asReadonly();
  readonly error = this.currentError.asReadonly();
  readonly pending = this.requestPending.asReadonly();
  readonly isHost = computed(() => this.currentLobby()?.hostPlayerId === this.currentPlayerId());
  readonly hasStarted = computed(() => this.currentLobby()?.status === LobbyStatus.STARTED);

  constructor() {
    this.socket.on('connect', () => {
      this.connectionState.set('CONNECTED');
      this.currentError.set(null);
      if (this.currentSession !== null) this.resume(this.currentSession);
    });
    this.socket.on('disconnect', () => {
      this.connectionState.set('DISCONNECTED');
      this.requestPending.set(false);
      this.currentError.set({ code: 'CONNECTION_LOST', message: 'Connection lost. Reconnecting…' });
    });
    this.socket.on('connect_error', () => {
      this.connectionState.set('DISCONNECTED');
      this.requestPending.set(false);
      this.currentError.set({
        code: 'SERVER_UNAVAILABLE',
        message: 'Cannot reach the game server. Retrying…',
      });
    });
    this.socket.on('lobby:state', (state) => {
      this.currentLobby.set(state);
      if (state.status === LobbyStatus.LOBBY) this.currentGame.set(null);
    });
    this.socket.on('game:state', (state) => this.currentGame.set(state));
  }

  createRoom(playerName: string): void {
    this.beginRequest();
    this.socket.emit('lobby:create', { playerName }, (response) =>
      this.handleAcknowledgement(response),
    );
  }

  joinRoom(playerName: string, roomCode: string): void {
    this.beginRequest();
    this.socket.emit('lobby:join', { playerName, roomCode }, (response) =>
      this.handleAcknowledgement(response),
    );
  }

  startGame(): void {
    const lobby = this.currentLobby();
    const playerId = this.currentPlayerId();
    if (lobby === null || playerId === null) return;
    this.beginRequest();
    this.socket.emit('game:start', { roomCode: lobby.roomCode, playerId }, (response) =>
      this.handleAcknowledgement(response),
    );
  }

  setSex(sex: 'MALE' | 'FEMALE'): void {
    const lobby = this.currentLobby();
    const playerId = this.currentPlayerId();
    if (lobby === null || playerId === null) return;
    this.beginRequest();
    this.socket.emit('lobby:set-sex', { roomCode: lobby.roomCode, playerId, sex }, (response) =>
      this.handleAcknowledgement(response),
    );
  }

  setSettings(mode: GameMode, enabledSetIds: readonly CardSetId[]): void {
    const lobby = this.currentLobby();
    const playerId = this.currentPlayerId();
    if (lobby === null || playerId === null) return;
    this.beginRequest();
    this.socket.emit(
      'lobby:set-settings',
      { roomCode: lobby.roomCode, playerId, mode, enabledSetIds: [...enabledSetIds] },
      (response) => this.handleAcknowledgement(response),
    );
  }

  rematch(): void {
    this.sendLifecycleAction('game:rematch');
  }

  returnToLobby(): void {
    this.sendLifecycleAction('game:return-to-lobby');
  }

  sendGameCommand(command: GameClientCommand): void {
    const lobby = this.currentLobby();
    if (lobby === null) return;
    this.beginRequest();
    this.socket.emit('game:command', { roomCode: lobby.roomCode, command }, (response) => {
      this.requestPending.set(false);
      if (!response.success) this.currentError.set(response.error);
    });
  }

  private resume(session: SavedSession): void {
    this.requestPending.set(true);
    this.socket.emit(
      'session:resume',
      { roomCode: session.roomCode, sessionToken: session.sessionToken },
      (response) => {
        this.requestPending.set(false);
        if (response.success) {
          this.saveSession(response);
        } else {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          this.currentSession = null;
          this.currentPlayerId.set(null);
          this.currentLobby.set(null);
          this.currentGame.set(null);
          this.currentError.set(response.error);
        }
      },
    );
  }

  private sendLifecycleAction(event: 'game:rematch' | 'game:return-to-lobby'): void {
    const lobby = this.currentLobby();
    const playerId = this.currentPlayerId();
    if (lobby === null || playerId === null) return;
    this.beginRequest();
    this.socket.emit(event, { roomCode: lobby.roomCode, playerId }, (response) => {
      this.requestPending.set(false);
      if (!response.success) this.currentError.set(response.error);
    });
  }

  private beginRequest(): void {
    this.requestPending.set(true);
    this.currentError.set(null);
  }

  private handleAcknowledgement(response: LobbyActionAck): void {
    this.requestPending.set(false);
    if (response.success) {
      this.saveSession(response);
    } else {
      this.currentError.set(response.error);
    }
  }

  private saveSession(response: Extract<LobbyActionAck, { readonly success: true }>): void {
    this.currentSession = {
      roomCode: response.roomCode,
      playerId: response.playerId,
      sessionToken: response.sessionToken,
    };
    this.currentPlayerId.set(response.playerId);
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.currentSession));
  }
}
