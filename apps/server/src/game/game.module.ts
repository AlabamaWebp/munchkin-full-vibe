import { Module } from '@nestjs/common';
import { GAME_CLOCK, GameService, SYSTEM_GAME_CLOCK } from './game.service';

@Module({
  providers: [
    GameService,
    { provide: GAME_CLOCK, useValue: SYSTEM_GAME_CLOCK },
  ],
  exports: [GameService],
})
export class GameModule {}
