import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  LobbyStatus,
  type ClientToServerEvents,
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

    if (!created.success)
      throw new Error('Expected host creation acknowledgement.');
    const hostStartedState = nextLobbyState(host);
    const guestStartedState = nextLobbyState(guest);
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
  });

  it('publishes player removal and host transfer after a disconnect', async () => {
    const host = await connectClient();
    const initialStatePromise = nextLobbyState(host);
    await new Promise<LobbyActionAck>((resolve) => {
      host.emit('lobby:create', { playerName: 'Ada' }, resolve);
    });
    const initialState = await initialStatePromise;

    const guest = await connectClient();
    const hostJoinState = nextLobbyState(host);
    const guestJoinState = nextLobbyState(guest);
    await new Promise<LobbyActionAck>((resolve) => {
      guest.emit(
        'lobby:join',
        { roomCode: initialState.roomCode, playerName: 'Grace' },
        resolve,
      );
    });
    await Promise.all([hostJoinState, guestJoinState]);

    const departureState = nextLobbyState(guest);
    host.disconnect();
    const remaining = await departureState;

    expect(remaining.players).toEqual([
      expect.objectContaining({ name: 'Grace', isHost: true }),
    ]);
    expect(remaining.hostPlayerId).toBe(remaining.players[0]?.playerId);
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
});
