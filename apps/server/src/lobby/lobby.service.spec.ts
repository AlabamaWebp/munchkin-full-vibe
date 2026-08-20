import { LOBBY_MAX_PLAYERS, LobbyStatus } from '@munchkin-lan/contracts';
import { LobbyService } from './lobby.service';
import { RoomCodeService } from './room-code.service';

describe('LobbyService', () => {
  let roomCodes: jest.Mocked<RoomCodeService>;
  let service: LobbyService;

  beforeEach(() => {
    roomCodes = { generate: jest.fn().mockReturnValue('ABCD') };
    service = new LobbyService(roomCodes);
  });

  it('creates a room with a normalized host and no exposed socket identity', () => {
    const result = service.createRoom('socket-host', { playerName: '  Ada  ' });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected room creation to succeed.');
    expect(result.acknowledgement).toMatchObject({
      success: true,
      roomCode: 'ABCD',
    });
    expect(result.state).toMatchObject({
      roomCode: 'ABCD',
      status: LobbyStatus.LOBBY,
      players: [{ name: 'Ada', isHost: true }],
    });
    expect(result.state.players[0]).not.toHaveProperty('socketId');
  });

  it('rejects an empty player name without creating a room', () => {
    const invalid = service.createRoom('socket-host', { playerName: '  ' });
    const valid = service.createRoom('socket-host', { playerName: 'Ada' });

    expect(invalid).toEqual({
      success: false,
      acknowledgement: {
        success: false,
        error: { code: 'INVALID_PLAYER_NAME', message: 'Enter a player name.' },
      },
    });
    expect(valid.success).toBe(true);
  });

  it('joins a room using a trimmed, case-insensitive code and synchronizes its view', () => {
    expect(
      service.createRoom('socket-host', { playerName: 'Ada' }).success,
    ).toBe(true);

    const joined = service.joinRoom('socket-guest', {
      roomCode: ' abcd ',
      playerName: 'Grace',
    });

    expect(joined.success).toBe(true);
    if (!joined.success) throw new Error('Expected room join to succeed.');
    expect(joined.state.players.map((player) => player.name)).toEqual([
      'Ada',
      'Grace',
    ]);
    expect(
      new Set(joined.state.players.map((player) => player.playerId)).size,
    ).toBe(2);
  });

  it('rejects invalid and unknown room codes consistently', () => {
    expect(
      service.joinRoom('socket-guest', {
        roomCode: 'bad',
        playerName: 'Grace',
      }),
    ).toMatchObject({
      acknowledgement: { error: { code: 'INVALID_ROOM_CODE' } },
    });
    expect(
      service.joinRoom('socket-guest', {
        roomCode: 'WXYZ',
        playerName: 'Grace',
      }),
    ).toMatchObject({ acknowledgement: { error: { code: 'ROOM_NOT_FOUND' } } });
  });

  it('enforces the six-player development room limit', () => {
    service.createRoom('socket-0', { playerName: 'Player 0' });
    for (let index = 1; index < LOBBY_MAX_PLAYERS; index += 1) {
      expect(
        service.joinRoom(`socket-${index}`, {
          roomCode: 'ABCD',
          playerName: `Player ${index}`,
        }).success,
      ).toBe(true);
    }

    expect(
      service.joinRoom('socket-overflow', {
        roomCode: 'ABCD',
        playerName: 'Overflow',
      }),
    ).toMatchObject({ acknowledgement: { error: { code: 'ROOM_FULL' } } });
  });

  it('allows the host to start a one-player game and closes the room to joins', () => {
    const created = service.createRoom('socket-host', { playerName: 'Ada' });
    if (!created.success) throw new Error('Expected room creation to succeed.');

    const started = service.startRoom('socket-host', {
      roomCode: 'ABCD',
      playerId: created.acknowledgement.playerId,
    });

    expect(started.success).toBe(true);
    if (!started.success) throw new Error('Expected room start to succeed.');
    expect(started.state.status).toBe(LobbyStatus.STARTED);
    expect(
      service.joinRoom('socket-guest', {
        roomCode: 'ABCD',
        playerName: 'Grace',
      }),
    ).toMatchObject({
      acknowledgement: { error: { code: 'GAME_ALREADY_STARTED' } },
    });
  });

  it('rejects start attempts from a non-host or a forged player identity', () => {
    const created = service.createRoom('socket-host', { playerName: 'Ada' });
    const joined = service.joinRoom('socket-guest', {
      roomCode: 'ABCD',
      playerName: 'Grace',
    });
    if (!created.success || !joined.success)
      throw new Error('Expected room setup to succeed.');

    expect(
      service.startRoom('socket-guest', {
        roomCode: 'ABCD',
        playerId: joined.acknowledgement.playerId,
      }),
    ).toMatchObject({ acknowledgement: { error: { code: 'NOT_HOST' } } });
    expect(
      service.startRoom('socket-guest', {
        roomCode: 'ABCD',
        playerId: created.acknowledgement.playerId,
      }),
    ).toMatchObject({
      acknowledgement: { error: { code: 'PLAYER_NOT_FOUND' } },
    });
  });

  it('allows only the host of a started room to return the same roster to the lobby', () => {
    const created = service.createRoom('socket-host', { playerName: 'Ada' });
    const joined = service.joinRoom('socket-guest', {
      roomCode: 'ABCD',
      playerName: 'Grace',
    });
    if (!created.success || !joined.success)
      throw new Error('Expected room setup to succeed.');
    service.startRoom('socket-host', {
      roomCode: 'ABCD',
      playerId: created.acknowledgement.playerId,
    });

    expect(
      service.returnToLobby('socket-guest', {
        roomCode: 'ABCD',
        playerId: joined.acknowledgement.playerId,
      }),
    ).toMatchObject({ acknowledgement: { error: { code: 'NOT_HOST' } } });

    const returned = service.returnToLobby('socket-host', {
      roomCode: 'ABCD',
      playerId: created.acknowledgement.playerId,
    });
    expect(returned).toMatchObject({
      success: true,
      state: {
        status: LobbyStatus.LOBBY,
        players: [{ name: 'Ada' }, { name: 'Grace' }],
      },
    });
  });

  it('keeps a disconnected player and resumes the same identity on a new socket', () => {
    const created = service.createRoom('socket-host', { playerName: 'Ada' });
    const joined = service.joinRoom('socket-guest', {
      roomCode: 'ABCD',
      playerName: 'Grace',
    });
    if (!created.success || !joined.success)
      throw new Error('Expected room setup to succeed.');

    const departure = service.disconnect('socket-host');

    expect(departure?.state).toMatchObject({
      hostPlayerId: created.acknowledgement.playerId,
      players: [
        { name: 'Ada', isHost: true, connected: false },
        { name: 'Grace', isHost: false, connected: true },
      ],
    });
    const resumed = service.resumeSession('socket-host-new', {
      roomCode: 'ABCD',
      sessionToken: created.acknowledgement.sessionToken,
    });
    expect(resumed).toMatchObject({
      success: true,
      acknowledgement: { playerId: created.acknowledgement.playerId },
    });
    if (!resumed.success)
      throw new Error('Expected session resume to succeed.');
    expect(resumed.state.players[0]).toMatchObject({
      name: 'Ada',
      connected: true,
    });
    expect(service.getPlayerForSocket('socket-host-new', 'ABCD')).toMatchObject(
      { playerId: created.acknowledgement.playerId },
    );
    expect(joined.acknowledgement.sessionToken).not.toBe(
      created.acknowledgement.sessionToken,
    );
  });

  it('rejects an unknown reconnect credential', () => {
    service.createRoom('socket-host', { playerName: 'Ada' });
    expect(
      service.resumeSession('socket-new', {
        roomCode: 'ABCD',
        sessionToken: 'wrong-token',
      }),
    ).toMatchObject({
      acknowledgement: { error: { code: 'INVALID_SESSION' } },
    });
  });

  it('keeps transport connections and player identities separate', () => {
    const created = service.createRoom('same-value', { playerName: 'Ada' });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error('Expected room creation to succeed.');

    expect(created.acknowledgement.playerId).not.toBe('same-value');
    expect(
      service.createRoom('same-value', { playerName: 'Grace' }),
    ).toMatchObject({
      acknowledgement: { error: { code: 'ALREADY_IN_ROOM' } },
    });
  });
});
