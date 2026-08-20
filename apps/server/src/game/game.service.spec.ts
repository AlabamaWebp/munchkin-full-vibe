import { GameService } from './game.service';

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
});
