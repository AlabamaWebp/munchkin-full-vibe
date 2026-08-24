import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type { FoundationStatusResponse } from '@munchkin-lan/contracts';
import { AppService } from './app.service';
import {
  DEVELOPMENT_SCENARIOS,
  createDevelopmentScenario,
  type DevelopmentScenario,
} from './game/development-scenarios';
import { GameService } from './game/game.service';

@Controller('api')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly gameService: GameService,
  ) {}

  @Get('status')
  getStatus(): FoundationStatusResponse {
    return this.appService.getStatus();
  }

  /** Disposable browser-QA state loader. This route is unavailable in production. */
  @Post('development/scenario/:scenario')
  loadDevelopmentScenario(@Param('scenario') scenario: string): {
    loaded: number;
  } {
    if (
      process.env.NODE_ENV === 'production' ||
      !DEVELOPMENT_SCENARIOS.includes(scenario as DevelopmentScenario)
    )
      throw new NotFoundException();
    let loaded = 0;
    for (const roomCode of this.gameService.developmentRoomCodes()) {
      const state = this.gameService.stateForDevelopment(roomCode);
      if (
        state !== null &&
        this.gameService.replaceForDevelopment(
          roomCode,
          createDevelopmentScenario(state, scenario as DevelopmentScenario),
        )
      )
        loaded += 1;
    }
    return { loaded };
  }
}
