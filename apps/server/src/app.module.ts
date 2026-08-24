import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { LobbyModule } from './lobby/lobby.module';

@Module({
  imports: [LobbyModule, GameModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
