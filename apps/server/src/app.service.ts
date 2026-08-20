import { Injectable } from '@nestjs/common';
import {
  APPLICATION_NAME,
  type FoundationStatusResponse,
} from '@munchkin-lan/contracts';
import { getGameEngineStatus } from '@munchkin-lan/game-engine';

@Injectable()
export class AppService {
  getStatus(): FoundationStatusResponse {
    return {
      applicationName: APPLICATION_NAME,
      milestone: 12,
      engine: getGameEngineStatus(),
      serverConnection: 'game-ready',
      gameplay: 'game-completion-ready',
    };
  }
}
