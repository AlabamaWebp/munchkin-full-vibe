import { Module } from '@nestjs/common';
import { LobbyGateway } from './lobby.gateway';
import { LobbyService } from './lobby.service';
import { RoomCodeService } from './room-code.service';

@Module({
  providers: [LobbyGateway, LobbyService, RoomCodeService],
})
export class LobbyModule {}
