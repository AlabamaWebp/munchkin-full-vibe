import { GameService } from './game.service';
import {
  GamePhase,
  GameStatus,
  parsePlayerId,
  parsePendingDecisionId,
  type GameState,
} from '@munchkin-lan/game-engine';

describe('GameService equipment transport', () => {
  it('rejects an empty equipment card id without throwing', () => {
    const service = new GameService();
    expect(
      service.startGame('ABCD', [{ playerId: 'player-1', name: 'Ada' }]),
    ).toEqual({ success: true });

    expect(
      service.execute('ABCD', 'player-1', {
        type: 'EQUIP_ITEM',
        cardId: '   ',
      }),
    ).toEqual({
      success: false,
      error: {
        code: 'CARD_NOT_IN_HAND',
        message: 'A valid card id is required.',
      },
    });

    expect(
      service.execute('ABCD', 'player-1', {
        type: 'LOOK_FOR_TROUBLE',
        cardId: '   ',
      }),
    ).toEqual({
      success: false,
      error: {
        code: 'CARD_NOT_IN_HAND',
        message: 'A valid card id is required.',
      },
    });
  });

  it('does not replace an unfinished game with a rematch', () => {
    const service = new GameService();
    const players = [{ playerId: 'player-1', name: 'Ada' }];
    expect(service.startGame('ABCD', players)).toEqual({ success: true });

    expect(service.rematch('ABCD', players)).toEqual({
      success: false,
      error: {
        code: 'GAME_NOT_FINISHED',
        message: 'The game is not finished.',
      },
    });
  });

  it('replaces only a finished match with a fresh game for the same roster', () => {
    const service = new GameService();
    const players = [
      { playerId: 'player-1', name: 'Ada' },
      { playerId: 'player-2', name: 'Grace' },
    ];
    expect(service.startGame('REMATCH', players)).toEqual({ success: true });
    const games = (service as unknown as { games: Map<string, GameState> })
      .games;
    const finished = games.get('REMATCH')!;
    games.set('REMATCH', {
      ...finished,
      status: GameStatus.FINISHED,
      phase: GamePhase.FINISHED,
      activePlayerId: parsePlayerId('player-1'),
      winnerId: parsePlayerId('player-1'),
      players: finished.players.map((player) => ({
        ...player,
        level: player.id === parsePlayerId('player-1') ? 10 : 7,
      })),
    });

    expect(service.rematch('REMATCH', players)).toEqual({ success: true });
    const rematch = games.get('REMATCH')!;
    expect(rematch).not.toBe(finished);
    expect(rematch).toMatchObject({
      status: GameStatus.IN_PROGRESS,
      phase: GamePhase.TURN_START,
      winnerId: null,
      turnNumber: 1,
      players: [
        { id: parsePlayerId('player-1'), name: 'Ada', level: 1 },
        { id: parsePlayerId('player-2'), name: 'Grace', level: 1 },
      ],
    });
  });

  it('removes a finished game without altering the room-owned roster', () => {
    const service = new GameService();
    const players = [
      { playerId: 'player-1', name: 'Ada' },
      { playerId: 'player-2', name: 'Grace' },
    ];
    expect(service.startGame('LOBBY', players)).toEqual({ success: true });
    const games = (service as unknown as { games: Map<string, GameState> })
      .games;
    const current = games.get('LOBBY')!;
    games.set('LOBBY', {
      ...current,
      status: GameStatus.FINISHED,
      phase: GamePhase.FINISHED,
      winnerId: parsePlayerId('player-1'),
    });

    expect(service.removeFinishedGame('LOBBY')).toEqual({ success: true });
    expect(service.getView('LOBBY', 'player-1')).toBeNull();
    expect(players).toEqual([
      { playerId: 'player-1', name: 'Ada' },
      { playerId: 'player-2', name: 'Grace' },
    ]);
  });

  it('returns the same finished standings whenever a player reconnects for a view', () => {
    const service = new GameService();
    const players = [
      { playerId: 'player-1', name: 'Ada' },
      { playerId: 'player-2', name: 'Grace' },
    ];
    expect(service.startGame('RESULTS', players)).toEqual({ success: true });
    const games = (service as unknown as { games: Map<string, GameState> })
      .games;
    const started = games.get('RESULTS')!;
    games.set('RESULTS', {
      ...started,
      status: GameStatus.FINISHED,
      phase: GamePhase.FINISHED,
      activePlayerId: parsePlayerId('player-1'),
      winnerId: parsePlayerId('player-1'),
      players: started.players.map((player) => ({
        ...player,
        level: player.id === parsePlayerId('player-1') ? 10 : 8,
      })),
    });

    const firstView = service.getView('RESULTS', 'player-1');
    const reconnectView = service.getView('RESULTS', 'player-2');
    expect(firstView).toMatchObject({
      status: 'FINISHED',
      phase: 'FINISHED',
      winnerId: 'player-1',
      players: [
        { playerId: 'player-1', level: 10, combatPower: expect.any(Number) },
        { playerId: 'player-2', level: 8, combatPower: expect.any(Number) },
      ],
      availableIntents: [],
    });
    expect(reconnectView).toMatchObject({
      status: firstView?.status,
      phase: firstView?.phase,
      winnerId: firstView?.winnerId,
      players: firstView?.players,
      availableIntents: [],
    });
  });

  it('rejects malformed combat revisions before domain execution', () => {
    const service = new GameService();
    expect(
      service.startGame('ABCD', [{ playerId: 'player-1', name: 'Ada' }]),
    ).toEqual({ success: true });

    expect(
      service.execute('ABCD', 'player-1', {
        type: 'DECLARE_COMBAT_VICTORY',
        combatRevision: 0,
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'STALE_COMBAT_STATE' },
    });
    expect(
      service.execute('ABCD', 'player-1', {
        type: 'PASS_COMBAT_REACTION',
        reactionWindowId: -1,
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'STALE_COMBAT_STATE' },
    });
    expect(
      service.execute('ABCD', 'player-1', {
        type: 'PLAY_COMBAT_CURSE',
        cardId: 'curse-1',
        targetPlayerId: ' ',
        reactionWindowId: 1,
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'INVALID_RECIPIENT' },
    });
  });

  it('validates selected charity cards and recipient at the transport boundary', () => {
    const service = new GameService();
    expect(
      service.startGame('GIVE', [
        { playerId: 'player-1', name: 'Ada' },
        { playerId: 'player-2', name: 'Grace' },
      ]),
    ).toEqual({ success: true });

    expect(
      service.execute('GIVE', 'player-1', {
        type: 'GIVE_CHARITY',
        cardIds: [' '],
        recipientId: 'player-2',
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'INVALID_CARD_SELECTION' },
    });
    expect(
      service.execute('GIVE', 'player-1', {
        type: 'GIVE_CHARITY',
        cardIds: [],
        recipientId: ' ',
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'INVALID_RECIPIENT' },
    });
  });

  it('rejects malformed stable ids before parsing domain commands', () => {
    const service = new GameService();
    expect(
      service.startGame('SAFE', [{ playerId: 'player-1', name: 'Ada' }]),
    ).toEqual({ success: true });

    expect(
      service.execute('SAFE', 'player-1', {
        type: 'RESOLVE_CARD_DISCARD',
        decisionId: ' ',
        cardIds: [],
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'INVALID_CARD_SELECTION' },
    });
    expect(
      service.execute('SAFE', 'player-1', {
        type: 'ACCEPT_HELP_OFFER',
        offerId: ' ',
        combatRevision: 1,
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'INVALID_CARD_SELECTION' },
    });
    expect(
      service.execute('SAFE', 'player-1', {
        type: 'RESOLVE_ROLE_RETENTION',
        decisionId: 'decision-1',
        keepCardId: ' ',
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'INVALID_CARD_SELECTION' },
    });
  });

  it('keeps reconnect views before expiry and resolves them after expiry', () => {
    let now = 1_000;
    const service = new GameService({ now: () => now });
    expect(
      service.startGame('TIME', [{ playerId: 'player-1', name: 'Ada' }]),
    ).toEqual({ success: true });
    const games = (service as unknown as { games: Map<string, GameState> })
      .games;
    const started = games.get('TIME')!;
    const handCount = started.players[0]!.hand.length;
    const source = started.doorDeck[0]!;
    games.set('TIME', {
      ...started,
      pendingDecision: {
        decisionId: parsePendingDecisionId('decision-timeout'),
        createdAtEpochMs: 1_000,
        expiresAtEpochMs: 2_000,
        type: 'DISCARD_CARDS',
        playerId: started.players[0]!.id,
        zone: 'HAND',
        count: 1,
        sourceCardId: source.instanceId,
        sourceDefinitionId: source.definitionId,
        remainingEffects: [],
        completion: {
          type: 'CURSE',
          card: source,
          targetPlayerId: started.players[0]!.id,
          phaseAfterResolution: null,
        },
      },
    });

    now = 1_999;
    expect(service.getView('TIME', 'player-1')?.pendingDecision).not.toBeNull();
    now = 2_000;
    const reconnected = service.getView('TIME', 'player-1');
    expect(reconnected?.pendingDecision).toBeNull();
    expect(reconnected?.self.hand).toHaveLength(handCount - 1);
  });

  it('makes an old timer harmless by reading current state on wake-up', () => {
    jest.useFakeTimers();
    try {
      let now = 1_000;
      const service = new GameService({ now: () => now });
      expect(
        service.startGame('WAKE', [{ playerId: 'player-1', name: 'Ada' }]),
      ).toEqual({ success: true });
      const internals = service as unknown as {
        games: Map<string, GameState>;
        scheduleNextDeadline(roomCode: string): void;
      };
      const started = internals.games.get('WAKE')!;
      const source = started.doorDeck[0]!;
      const waiting: GameState = {
        ...started,
        pendingDecision: {
          decisionId: parsePendingDecisionId('old-timer'),
          createdAtEpochMs: 1_000,
          expiresAtEpochMs: 2_000,
          type: 'DISCARD_CARDS',
          playerId: started.players[0]!.id,
          zone: 'HAND',
          count: 1,
          sourceCardId: source.instanceId,
          sourceDefinitionId: source.definitionId,
          remainingEffects: [],
          completion: {
            type: 'CURSE',
            card: source,
            targetPlayerId: started.players[0]!.id,
            phaseAfterResolution: null,
          },
        },
      };
      internals.games.set('WAKE', waiting);
      internals.scheduleNextDeadline('WAKE');
      const newer = { ...waiting, pendingDecision: null };
      internals.games.set('WAKE', newer);
      const listener = jest.fn();
      service.setDeadlineListener(listener);
      now = 2_000;
      jest.advanceTimersByTime(1_000);
      expect(internals.games.get('WAKE')).toBe(newer);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
