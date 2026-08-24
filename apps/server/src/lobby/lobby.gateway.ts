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
  GameActionAck,
  GameCommandPayload,
  GameLifecyclePayload,
  JoinLobbyPayload,
  LobbyActionAck,
  ResumeSessionPayload,
  SetLobbySettingsPayload,
  SetPlayerColorPayload,
  SetPlayerSexPayload,
  ServerToClientEvents,
  StartLobbyPayload,
} from '@munchkin-lan/contracts';
import { Server, Socket } from 'socket.io';
import { GameService } from '../game/game.service';
import { LobbyService, type LobbyOperationResult } from './lobby.service';

type LobbySocket = Socket<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway({ cors: { origin: true } })
export class LobbyGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly lobbyService: LobbyService,
    private readonly gameService: GameService,
  ) {
    this.gameService.setDeadlineListener((roomCode) =>
      this.publishGame(roomCode),
    );
  }

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

  @SubscribeMessage('session:resume')
  async resumeSession(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: ResumeSessionPayload,
  ): Promise<LobbyActionAck> {
    const result = this.lobbyService.resumeSession(client.id, payload);
    if (!result.success) return result.acknowledgement;
    if (
      result.previousSocketId !== undefined &&
      result.previousSocketId !== client.id
    ) {
      this.server.sockets.sockets
        .get(result.previousSocketId)
        ?.disconnect(true);
    }
    await client.join(result.state.roomCode);
    this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    this.publishGameToPlayer(
      result.state.roomCode,
      result.acknowledgement.playerId,
      client.id,
    );
    return result.acknowledgement;
  }

  @SubscribeMessage('game:start')
  startRoom(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: StartLobbyPayload,
  ): LobbyActionAck {
    const result = this.lobbyService.startRoom(client.id, payload);
    if (!result.success) return result.acknowledgement;
    const started = this.gameService.startGame(
      result.state.roomCode,
      this.lobbyService.getGamePlayers(result.state.roomCode),
      this.lobbyService.getGameConfig(result.state.roomCode) ?? undefined,
    );
    if (!started.success) {
      return {
        success: false,
        error: { code: 'PLAYER_NOT_FOUND', message: started.error.message },
      };
    }
    this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    this.publishGame(result.state.roomCode);
    return result.acknowledgement;
  }

  @SubscribeMessage('lobby:set-sex')
  setPlayerSex(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: SetPlayerSexPayload,
  ): LobbyActionAck {
    const result = this.lobbyService.setPlayerSex(client.id, payload);
    if (result.success)
      this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    return result.acknowledgement;
  }

  @SubscribeMessage('lobby:set-color')
  setPlayerColor(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: SetPlayerColorPayload,
  ): LobbyActionAck {
    const result = this.lobbyService.setPlayerColor(client.id, payload);
    if (result.success)
      this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    return result.acknowledgement;
  }

  @SubscribeMessage('lobby:set-settings')
  setLobbySettings(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: SetLobbySettingsPayload,
  ): LobbyActionAck {
    const result = this.lobbyService.setSettings(client.id, payload);
    if (result.success)
      this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    return result.acknowledgement;
  }

  @SubscribeMessage('game:command')
  executeGameCommand(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: GameCommandPayload,
  ): GameActionAck {
    const player = this.lobbyService.getPlayerForSocket(
      client.id,
      payload?.roomCode,
    );
    if (player === null) {
      return {
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Resume the player session first.',
        },
      };
    }
    const result = this.gameService.execute(
      payload.roomCode,
      player.playerId,
      payload.command,
    );
    if (result.success) this.publishGame(payload.roomCode);
    return result;
  }

  @SubscribeMessage('game:rematch')
  rematch(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: GameLifecyclePayload,
  ): GameActionAck {
    const authorized = this.lobbyService.authorizeHost(client.id, payload);
    if (!authorized.success) return authorized.acknowledgement;
    const restarted = this.gameService.rematch(
      authorized.state.roomCode,
      this.lobbyService.getGamePlayers(authorized.state.roomCode),
    );
    if (!restarted.success) return { success: false, error: restarted.error };
    this.publishGame(authorized.state.roomCode);
    return { success: true };
  }

  @SubscribeMessage('game:return-to-lobby')
  returnToLobby(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: GameLifecyclePayload,
  ): GameActionAck {
    const authorized = this.lobbyService.authorizeHost(client.id, payload);
    if (!authorized.success) return authorized.acknowledgement;
    const removed = this.gameService.removeFinishedGame(
      authorized.state.roomCode,
    );
    if (!removed.success) return { success: false, error: removed.error };
    const returned = this.lobbyService.returnToLobby(client.id, payload);
    if (!returned.success) return returned.acknowledgement;
    this.server.to(returned.state.roomCode).emit('lobby:state', returned.state);
    return { success: true };
  }

  handleDisconnect(client: LobbySocket): void {
    const departure = this.lobbyService.disconnect(client.id);
    if (departure !== null) {
      this.server.to(departure.roomCode).emit('lobby:state', departure.state);
    }
  }

  private async joinAndPublish(
    client: LobbySocket,
    result: LobbyOperationResult,
  ): Promise<LobbyActionAck> {
    if (!result.success) return result.acknowledgement;
    await client.join(result.state.roomCode);
    this.server.to(result.state.roomCode).emit('lobby:state', result.state);
    return result.acknowledgement;
  }

  private publishGame(roomCode: string): void {
    for (const player of this.lobbyService.getConnectedPlayers(roomCode)) {
      this.publishGameToPlayer(roomCode, player.playerId, player.socketId);
    }
  }

  private publishGameToPlayer(
    roomCode: string,
    playerId: string,
    socketId: string,
  ): void {
    const view = this.gameService.getView(roomCode, playerId);
    if (view !== null) this.server.to(socketId).emit('game:state', view);
  }
}
