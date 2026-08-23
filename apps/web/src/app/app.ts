import { Component, HostListener, effect, inject, isDevMode, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  APPLICATION_NAME,
  type CardSetId,
  type GameMode,
  type PlayerSex,
} from '@munchkin-lan/contracts';
import { GameShellComponent } from './game-shell.component';
import { DevCombatComponent } from './dev-combat.component';
import { LobbyClient } from './lobby-client';
import { LocalizationService, type AppLocale } from './localization';

@Component({
  selector: 'app-root',
  imports: [FormsModule, GameShellComponent, DevCombatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly lobbyClient = inject(LobbyClient);
  private readonly localization = inject(LocalizationService);
  protected readonly title = APPLICATION_NAME;
  protected readonly playerName = signal('');
  protected readonly roomCode = signal('');
  protected readonly isFullscreen = signal(document.fullscreenElement !== null);
  protected readonly fullscreenSupported =
    typeof document.documentElement.requestFullscreen === 'function';
  protected readonly locale = this.localization.locale;
  protected readonly t = this.localization.translate.bind(this.localization);
  protected readonly errorMessage = this.localization.errorMessage.bind(this.localization);
  protected readonly connection = this.lobbyClient.connection;
  protected readonly lobby = this.lobbyClient.lobby;
  protected readonly game = this.lobbyClient.game;
  protected readonly playerId = this.lobbyClient.playerId;
  protected readonly error = this.lobbyClient.error;
  protected readonly pending = this.lobbyClient.pending;
  protected readonly isHost = this.lobbyClient.isHost;
  protected readonly hasStarted = this.lobbyClient.hasStarted;
  protected readonly optionalSets = ['COMPANIONS', 'ARSENAL', 'DUAL_IDENTITY'] as const;
  protected readonly isDevCombatRoute = isDevMode() && window.location.pathname === '/dev/ui/combat';

  constructor() {
    effect((onCleanup) => {
      document.documentElement.classList.toggle(
        'game-active',
        this.game() !== null || this.isDevCombatRoute,
      );
      onCleanup(() => document.documentElement.classList.remove('game-active'));
    });
  }

  protected createRoom(): void {
    this.lobbyClient.createRoom(this.playerName());
  }
  protected joinRoom(): void {
    this.lobbyClient.joinRoom(this.playerName(), this.roomCode());
  }
  protected startGame(): void {
    this.lobbyClient.startGame();
  }
  protected setSex(sex: PlayerSex): void {
    this.lobbyClient.setSex(sex);
  }
  protected setMode(mode: GameMode): void {
    const settings = this.lobby()?.settings;
    this.lobbyClient.setSettings(mode, settings?.enabledSetIds ?? ['CORE']);
  }
  protected toggleSet(setId: Exclude<CardSetId, 'CORE'>): void {
    const settings = this.lobby()?.settings;
    const enabled = new Set<CardSetId>(settings?.enabledSetIds ?? ['CORE']);
    if (enabled.has(setId)) enabled.delete(setId);
    else enabled.add(setId);
    this.lobbyClient.setSettings(settings?.mode ?? 'BALANCED', [...enabled]);
  }
  protected setLocale(locale: AppLocale): void {
    this.localization.setLocale(locale);
  }
  protected normalizeRoomCode(value: string): void {
    this.roomCode.set(value.toUpperCase());
  }

  @HostListener('document:fullscreenchange')
  protected synchronizeFullscreenState(): void {
    this.isFullscreen.set(document.fullscreenElement !== null);
  }

  protected async toggleFullscreen(): Promise<void> {
    if (!this.fullscreenSupported) return;
    if (document.fullscreenElement === null) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }
}
