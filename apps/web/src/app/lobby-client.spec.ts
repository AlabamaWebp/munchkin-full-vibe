import { readSavedSession, resolveSocketUrl } from './lobby-client';

describe('resolveSocketUrl', () => {
  it('targets the Nest port when Angular runs on its development port', () => {
    expect(
      resolveSocketUrl({
        hostname: '192.168.1.20',
        origin: 'http://192.168.1.20:4200',
        port: '4200',
        protocol: 'http:',
      }),
    ).toBe('http://192.168.1.20:3000');
  });

  it('uses the same origin outside the Angular development server', () => {
    expect(
      resolveSocketUrl({
        hostname: 'game-pc',
        origin: 'http://game-pc:3000',
        port: '3000',
        protocol: 'http:',
      }),
    ).toBe('http://game-pc:3000');
  });
});

describe('readSavedSession', () => {
  it('restores only a complete stored player session', () => {
    expect(
      readSavedSession({
        getItem: () =>
          JSON.stringify({
            roomCode: 'ABCD',
            playerId: 'player-1',
            sessionToken: 'secret',
          }),
      }),
    ).toEqual({
      roomCode: 'ABCD',
      playerId: 'player-1',
      sessionToken: 'secret',
    });
    expect(readSavedSession({ getItem: () => '{bad json' })).toBeNull();
  });
});
