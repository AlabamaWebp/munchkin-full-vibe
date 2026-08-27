import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameService } from './game/game.service';

describe('AppController', () => {
  let appController: AppController;
  const gameService = {
    developmentRoomCodes: jest.fn<() => readonly string[]>(),
    stateForDevelopment: jest.fn(),
    replaceForDevelopment: jest.fn(),
  };

  beforeEach(async () => {
    gameService.developmentRoomCodes.mockReturnValue([]);
    gameService.stateForDevelopment.mockReturnValue(null);
    gameService.replaceForDevelopment.mockReturnValue(false);
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: GameService,
          useValue: gameService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('status', () => {
    it('reports that synchronized gameplay is ready', () => {
      expect(appController.getStatus()).toEqual({
        applicationName: 'Munchkin LAN',
        milestone: 12,
        engine: 'domain-ready',
        serverConnection: 'game-ready',
        gameplay: 'game-completion-ready',
      });
    });
  });

  describe('development scenarios', () => {
    it('keeps the room-scoped loader unavailable without a matching game', () => {
      expect(() =>
        appController.loadDevelopmentScenarioForRoom('abcd', 'reaction'),
      ).toThrow();
      expect(gameService.stateForDevelopment).toHaveBeenCalledWith('ABCD');
    });
  });
});
