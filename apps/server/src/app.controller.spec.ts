import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('status', () => {
    it('reports that the multiplayer lobby is ready', () => {
      expect(appController.getStatus()).toEqual({
        applicationName: 'Munchkin LAN',
        milestone: 3,
        engine: 'domain-ready',
        serverConnection: 'lobby-ready',
        gameplay: 'not-implemented',
      });
    });
  });
});
