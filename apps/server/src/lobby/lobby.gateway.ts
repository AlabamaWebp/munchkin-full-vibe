import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  ClientToServerEvents,
  CreateLobbyPayload,
  JoinLobbyPayload,
  LobbyActionAck,
  ServerToClientEvents,
  StartLobbyPayload,
} from '@munchkin-lan/contracts';
import { Server, Socket } from 'socket.io';
import { LobbyService, type LobbyOperationResult } from './lobby.service';

type LobbySocket = Socket<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway({ cors: { origin: true } })
export class LobbyGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(private readonly lobbyService: LobbyService) {}

  @SubscribeMessage('lobby:create')
  async createRoom(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: CreateLobbyPayload,
  ): Promise<LobbyActionAck> {
    return this.joinAndPublish(
      client,
      this.lobbyService.createRoom(client.id, payload),
    );
  }

  @SubscribeMessage('lobby:join')
  async joinRoom(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: JoinLobbyPayload,
  ): Promise<LobbyActionAck> {
    return this.joinAndPublish(
      client,
      this.lobbyService.joinRoom(client.id, payload),
    );
  }

  @SubscribeMessage('game:start')
  startRoom(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: StartLobbyPayload,
  ): LobbyActionAck {
    const result = this.lobbyService.startRoom(client.id, payload);
    if (result.success) {
      this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    }
    return result.acknowledgement;
  }

  handleDisconnect(client: LobbySocket): void {
    const departure = this.lobbyService.disconnect(client.id);
    if (departure !== null && departure.state !== null) {
      this.server.to(departure.roomCode).emit('lobby:state', departure.state);
    }
  }

  private async joinAndPublish(
    client: LobbySocket,
    result: LobbyOperationResult,
  ): Promise<LobbyActionAck> {
    if (!result.success) {
      return result.acknowledgement;
    }
    await client.join(result.state.roomCode);
    this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    return result.acknowledgement;
  }
}
