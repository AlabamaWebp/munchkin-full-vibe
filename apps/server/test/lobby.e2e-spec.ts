import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  LobbyStatus,
  type ClientToServerEvents,
  type GameActionAck,
  type GameView,
  type LobbyActionAck,
  type LobbyState,
  type ServerToClientEvents,
} from '@munchkin-lan/contracts';
import { type AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from './../src/app.module';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('LobbyGateway (e2e)', () => {
  let app: INestApplication;
  let serverUrl: string;
  let clients: TestSocket[];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${address.port}`;
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    await app.close();
  });

  it('creates, joins, synchronizes, and starts a lobby over Socket.IO', async () => {
    const host = await connectClient();
    const hostCreatedState = nextLobbyState(host);
    const created = await new Promise<LobbyActionAck>((resolve) => {
      host.emit('lobby:create', { playerName: 'Ada' }, resolve);
    });
    const initialState = await hostCreatedState;

    expect(created.success).toBe(true);
    expect(initialState).toMatchObject({
      status: LobbyStatus.LOBBY,
      players: [{ name: 'Ada', isHost: true }],
    });
    expect(initialState.players[0]).not.toHaveProperty('socketId');
    if (!created.success)
      throw new Error('Expected host creation acknowledgement.');
    const hostSexState = nextLobbyState(host);
    await new Promise<LobbyActionAck>((resolve) => {
      host.emit(
        'lobby:set-sex',
        {
          roomCode: initialState.roomCode,
          playerId: created.playerId,
          sex: 'FEMALE',
        },
        resolve,
      );
    });
    await hostSexState;

    const guest = await connectClient();
    const hostJoinedState = nextLobbyState(host);
    const guestJoinedState = nextLobbyState(guest);
    const joined = await new Promise<LobbyActionAck>((resolve) => {
      guest.emit(
        'lobby:join',
        { roomCode: initialState.roomCode.toLowerCase(), playerName: 'Grace' },
        resolve,
      );
    });
    const [hostView, guestView] = await Promise.all([
      hostJoinedState,
      guestJoinedState,
    ]);

    expect(joined.success).toBe(true);
    expect(hostView).toEqual(guestView);
    expect(hostView.players.map((player) => player.name)).toEqual([
      'Ada',
      'Grace',
    ]);

    if (!joined.success)
      throw new Error('Expected guest join acknowledgement.');
    const hostSexUpdated = nextLobbyState(host);
    const guestSexUpdated = nextLobbyState(guest);
    await new Promise<LobbyActionAck>((resolve) => {
      guest.emit(
        'lobby:set-sex',
        {
          roomCode: initialState.roomCode,
          playerId: joined.playerId,
          sex: 'MALE',
        },
        resolve,
      );
    });
    await Promise.all([hostSexUpdated, guestSexUpdated]);

    const hostStartedState = nextLobbyState(host);
    const guestStartedState = nextLobbyState(guest);
    const hostGameState = nextGameState(host);
    const guestGameState = nextGameState(guest);
    const started = await new Promise<LobbyActionAck>((resolve) => {
      host.emit(
        'game:start',
        { roomCode: initialState.roomCode, playerId: created.playerId },
        resolve,
      );
    });
    const startedViews = await Promise.all([
      hostStartedState,
      guestStartedState,
    ]);

    expect(started.success).toBe(true);
    expect(
      startedViews.every((state) => state.status === LobbyStatus.STARTED),
    ).toBe(true);
    const [hostGame, guestGame] = await Promise.all([
      hostGameState,
      guestGameState,
    ]);
    expect(hostGame.self.hand).toHaveLength(8);
    expect(guestGame.self.hand).toHaveLength(8);
    expect(hostGame.viewerPlayerId).not.toBe(guestGame.viewerPlayerId);
    expect(hostGame.players[1]).not.toHaveProperty('hand');
    for (const hiddenCard of guestGame.self.hand) {
      expect(JSON.stringify(hostGame)).not.toContain(hiddenCard.instanceId);
    }

    const actingSocket =
      hostGame.activePlayerId === hostGame.viewerPlayerId ? host : guest;
    const hostAfterCommand = nextGameState(host);
    const guestAfterCommand = nextGameState(guest);
    const commandResult = await new Promise<GameActionAck>((resolve) => {
      actingSocket.emit(
        'game:command',
        { roomCode: initialState.roomCode, command: { type: 'KICK_DOOR' } },
        resolve,
      );
    });
    expect(commandResult).toEqual({ success: true });
    const [updatedHostGame, updatedGuestGame] = await Promise.all([
      hostAfterCommand,
      guestAfterCommand,
    ]);
    expect(updatedHostGame.phase).not.toBe('TURN_START');
    expect(updatedHostGame).toEqual(
      expect.objectContaining({
        phase: updatedGuestGame.phase,
        turnNumber: updatedGuestGame.turnNumber,
      }),
    );
  });

  it('keeps an offline player and resumes the game on a new socket', async () => {
    const host = await connectClient();
    const initialStatePromise = nextLobbyState(host);
    const created = await new Promise<LobbyActionAck>((resolve) => {
      host.emit('lobby:create', { playerName: 'Ada' }, resolve);
    });
    const initialState = await initialStatePromise;
    if (!created.success) throw new Error('Expected room creation to succeed.');
    const hostSexState = nextLobbyState(host);
    await new Promise<LobbyActionAck>((resolve) => {
      host.emit(
        'lobby:set-sex',
        {
          roomCode: initialState.roomCode,
          playerId: created.playerId,
          sex: 'FEMALE',
        },
        resolve,
      );
    });
    await hostSexState;

    const guest = await connectClient();
    const hostJoinState = nextLobbyState(host);
    const guestJoinState = nextLobbyState(guest);
    const joined = await new Promise<LobbyActionAck>((resolve) => {
      guest.emit(
        'lobby:join',
        { roomCode: initialState.roomCode, playerName: 'Grace' },
        resolve,
      );
    });
    await Promise.all([hostJoinState, guestJoinState]);

    if (!joined.success) throw new Error('Expected room join to succeed.');
    const hostSexUpdated = nextLobbyState(host);
    const guestSexUpdated = nextLobbyState(guest);
    await new Promise<LobbyActionAck>((resolve) => {
      guest.emit(
        'lobby:set-sex',
        {
          roomCode: initialState.roomCode,
          playerId: joined.playerId,
          sex: 'MALE',
        },
        resolve,
      );
    });
    await Promise.all([hostSexUpdated, guestSexUpdated]);

    const hostStartedState = nextLobbyState(host);
    const guestStartedState = nextLobbyState(guest);
    const hostGameState = nextGameState(host);
    const guestGameState = nextGameState(guest);
    await new Promise<LobbyActionAck>((resolve) => {
      host.emit(
        'game:start',
        { roomCode: initialState.roomCode, playerId: created.playerId },
        resolve,
      );
    });
    await Promise.all([
      hostStartedState,
      guestStartedState,
      hostGameState,
      guestGameState,
    ]);

    const departureState = nextLobbyState(guest);
    host.disconnect();
    const remaining = await departureState;

    expect(remaining.players).toEqual([
      expect.objectContaining({ name: 'Ada', isHost: true, connected: false }),
      expect.objectContaining({ name: 'Grace', connected: true }),
    ]);

    const resumedHost = await connectClient();
    const guestResumeState = nextLobbyState(guest);
    const resumedLobbyState = nextLobbyState(resumedHost);
    const resumedGameState = nextGameState(resumedHost);
    const resumed = await new Promise<LobbyActionAck>((resolve) => {
      resumedHost.emit(
        'session:resume',
        {
          roomCode: initialState.roomCode,
          sessionToken: created.sessionToken,
        },
        resolve,
      );
    });
    expect(resumed).toMatchObject({
      success: true,
      playerId: created.playerId,
    });
    const [guestView, hostView, gameView] = await Promise.all([
      guestResumeState,
      resumedLobbyState,
      resumedGameState,
    ]);
    expect(guestView.players[0]?.connected).toBe(true);
    expect(hostView).toEqual(guestView);
    expect(gameView.viewerPlayerId).toBe(created.playerId);
    expect(gameView.self.hand).toHaveLength(8);
  });

  async function connectClient(): Promise<TestSocket> {
    const client: TestSocket = io(serverUrl, {
      forceNew: true,
      transports: ['websocket'],
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }

  function nextLobbyState(client: TestSocket): Promise<LobbyState> {
    return new Promise((resolve) => client.once('lobby:state', resolve));
  }

  function nextGameState(client: TestSocket): Promise<GameView> {
    return new Promise((resolve) => client.once('game:state', resolve));
  }
});
