import { Controller, Get } from '@nestjs/common';
import type { FoundationStatusResponse } from '@munchkin-lan/contracts';
import { AppService } from './app.service';

@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('status')
  getStatus(): FoundationStatusResponse {
    return this.appService.getStatus();
  }
}
