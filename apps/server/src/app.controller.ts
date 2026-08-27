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
    phase: string | null;
  } {
    if (
      process.env.NODE_ENV === 'production' ||
      !DEVELOPMENT_SCENARIOS.includes(scenario as DevelopmentScenario)
    )
      throw new NotFoundException();
    let loaded = 0;
    let phase: string | null = null;
    for (const roomCode of this.gameService.developmentRoomCodes()) {
      const state = this.gameService.stateForDevelopment(roomCode);
      const replacement =
        state === null
          ? null
          : createDevelopmentScenario(state, scenario as DevelopmentScenario);
      if (
        replacement !== null &&
        this.gameService.replaceForDevelopment(roomCode, replacement)
      ) {
        loaded += 1;
        phase = replacement.phase;
      }
    }
    return { loaded, phase };
  }

  /** Room-scoped variant used by isolated browser automation. */
  @Post('development/room/:roomCode/scenario/:scenario')
  loadDevelopmentScenarioForRoom(
    @Param('roomCode') roomCode: string,
    @Param('scenario') scenario: string,
  ): { loaded: boolean; phase: string | null } {
    if (
      process.env.NODE_ENV === 'production' ||
      !DEVELOPMENT_SCENARIOS.includes(scenario as DevelopmentScenario)
    )
      throw new NotFoundException();
    const state = this.gameService.stateForDevelopment(roomCode.toUpperCase());
    if (state === null) throw new NotFoundException();
    const replacement = createDevelopmentScenario(
      state,
      scenario as DevelopmentScenario,
    );
    const loaded = this.gameService.replaceForDevelopment(
      roomCode.toUpperCase(),
      replacement,
    );
    return { loaded, phase: loaded ? replacement.phase : null };
  }
}
