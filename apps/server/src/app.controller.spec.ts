import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameService } from './game/game.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: GameService,
          useValue: {
            developmentRoomCodes: () => [],
            stateForDevelopment: () => null,
            replaceForDevelopment: () => false,
          },
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
});
