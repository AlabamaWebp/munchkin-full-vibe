import { computed, Injectable, signal } from '@angular/core';
import {
  type ClientToServerEvents,
  LobbyStatus,
  type LobbyActionAck,
  type LobbyState,
  type ServerToClientEvents,
} from '@munchkin-lan/contracts';
import { io, type Socket } from 'socket.io-client';

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function resolveSocketUrl(
  location: Pick<Location, 'hostname' | 'origin' | 'port' | 'protocol'>,
): string {
  return location.port === '4200'
    ? `${location.protocol}//${location.hostname}:3000`
    : location.origin;
}

@Injectable({ providedIn: 'root' })
export class LobbyClient {
  private readonly socket: LobbySocket = io(resolveSocketUrl(window.location));
  private readonly connectionState = signal<ConnectionState>('CONNECTING');
  private readonly currentLobby = signal<LobbyState | null>(null);
  private readonly currentPlayerId = signal<string | null>(null);
  private readonly currentError = signal<string | null>(null);
  private readonly requestPending = signal(false);

  readonly connection = this.connectionState.asReadonly();
  readonly lobby = this.currentLobby.asReadonly();
  readonly playerId = this.currentPlayerId.asReadonly();
  readonly error = this.currentError.asReadonly();
  readonly pending = this.requestPending.asReadonly();
  readonly isHost = computed(() => this.currentLobby()?.hostPlayerId === this.currentPlayerId());
  readonly hasStarted = computed(() => this.currentLobby()?.status === LobbyStatus.STARTED);

  constructor() {
    this.socket.on('connect', () => {
      this.connectionState.set('CONNECTED');
      if (this.currentLobby() === null) {
        this.currentError.set(null);
      }
    });
    this.socket.on('disconnect', () => {
      this.connectionState.set('DISCONNECTED');
      this.requestPending.set(false);
      this.currentLobby.set(null);
      this.currentPlayerId.set(null);
      this.currentError.set('Connection to the game server was lost.');
    });
    this.socket.on('connect_error', () => {
      this.connectionState.set('DISCONNECTED');
      this.requestPending.set(false);
      this.currentError.set('Cannot reach the game server.');
    });
    this.socket.on('lobby:state', (state) => {
      this.currentLobby.set(state);
    });
  }

  createRoom(playerName: string): void {
    this.beginRequest();
    this.socket.emit('lobby:create', { playerName }, (response) => {
      this.handleAcknowledgement(response);
    });
  }

  joinRoom(playerName: string, roomCode: string): void {
    this.beginRequest();
    this.socket.emit('lobby:join', { playerName, roomCode }, (response) => {
      this.handleAcknowledgement(response);
    });
  }

  startGame(): void {
    const lobby = this.currentLobby();
    const playerId = this.currentPlayerId();
    if (lobby === null || playerId === null) {
      return;
    }

    this.beginRequest();
    this.socket.emit('game:start', { roomCode: lobby.roomCode, playerId }, (response) =>
      this.handleAcknowledgement(response),
    );
  }

  private beginRequest(): void {
    this.requestPending.set(true);
    this.currentError.set(null);
  }

  private handleAcknowledgement(response: LobbyActionAck): void {
    this.requestPending.set(false);
    if (response.success) {
      this.currentPlayerId.set(response.playerId);
      return;
    }
    this.currentError.set(response.error.message);
  }
}
