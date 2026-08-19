import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { APPLICATION_NAME } from '@munchkin-lan/contracts';
import { LobbyClient } from './lobby-client';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly lobbyClient = inject(LobbyClient);

  protected readonly title = APPLICATION_NAME;
  protected readonly playerName = signal('');
  protected readonly roomCode = signal('');

  protected readonly connection = this.lobbyClient.connection;
  protected readonly lobby = this.lobbyClient.lobby;
  protected readonly playerId = this.lobbyClient.playerId;
  protected readonly error = this.lobbyClient.error;
  protected readonly pending = this.lobbyClient.pending;
  protected readonly isHost = this.lobbyClient.isHost;
  protected readonly hasStarted = this.lobbyClient.hasStarted;

  protected createRoom(): void {
    this.lobbyClient.createRoom(this.playerName());
  }

  protected joinRoom(): void {
    this.lobbyClient.joinRoom(this.playerName(), this.roomCode());
  }

  protected startGame(): void {
    this.lobbyClient.startGame();
  }

  protected normalizeRoomCode(value: string): void {
    this.roomCode.set(value.toUpperCase());
  }
}
