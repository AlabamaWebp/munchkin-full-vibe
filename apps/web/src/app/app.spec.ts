import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LobbyStatus, type GameView, type LobbyState } from '@munchkin-lan/contracts';
import { App } from './app';
import { LobbyClient, type ConnectionState, type UserFacingError } from './lobby-client';

class MockLobbyClient {
  private readonly connectionState = signal<ConnectionState>('CONNECTED');
  private readonly lobbyState = signal<LobbyState | null>(null);
  private readonly gameState = signal<GameView | null>(null);
  private readonly currentPlayerId = signal<string | null>(null);
  readonly connection = this.connectionState.asReadonly();
  readonly lobby = this.lobbyState.asReadonly();
  readonly game = this.gameState.asReadonly();
  readonly playerId = this.currentPlayerId.asReadonly();
  readonly error = signal<UserFacingError | null>(null).asReadonly();
  readonly pending = signal(false).asReadonly();
  readonly isHost = computed(() => this.lobbyState()?.hostPlayerId === this.currentPlayerId());
  readonly hasStarted = computed(() => this.lobbyState()?.status === LobbyStatus.STARTED);
  readonly createRoom = vi.fn();
  readonly joinRoom = vi.fn();
  readonly startGame = vi.fn();
  readonly setSex = vi.fn();
  readonly setSettings = vi.fn();
  readonly rematch = vi.fn();
  readonly returnToLobby = vi.fn();
  readonly sendGameCommand = vi.fn();
  showLobby(state: LobbyState, playerId: string): void {
    this.currentPlayerId.set(playerId);
    this.lobbyState.set(state);
  }
}

describe('App lobby', () => {
  let client: MockLobbyClient;
  beforeEach(async () => {
    client = new MockLobbyClient();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: LobbyClient, useValue: client }],
    }).compileComponents();
  });

  it('creates a room with the entered name', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('#player-name')!;
    input.value = 'Ada';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Создать'))!
      .click();
    expect(client.createRoom).toHaveBeenCalledWith('Ada');
  });

  it('shows lobby players and lets the host start', () => {
    client.showLobby(
      {
        roomCode: 'ABCD',
        status: LobbyStatus.LOBBY,
        hostPlayerId: 'p1',
        players: [
          { playerId: 'p1', name: 'Ada', isHost: true, connected: true },
          { playerId: 'p2', name: 'Grace', isHost: false, connected: false },
        ],
      },
      'p1',
    );
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Ada');
    expect(root.textContent).toContain('Grace');
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Начать'))!
      .click();
    expect(client.startGame).toHaveBeenCalledOnce();
  });

  it('lets only the host configure mode and optional sets before start', () => {
    client.showLobby(
      {
        roomCode: 'ABCD',
        status: LobbyStatus.LOBBY,
        hostPlayerId: 'p1',
        players: [{ playerId: 'p1', name: 'Ada', isHost: true, connected: true, sex: 'FEMALE' }],
        settings: { mode: 'BALANCED', enabledSetIds: ['CORE'] },
      },
      'p1',
    );
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Классический хаос'))!
      .click();
    expect(client.setSettings).toHaveBeenCalledWith('CLASSIC_CHAOS', ['CORE']);
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Спутники'))!
      .click();
    expect(client.setSettings).toHaveBeenCalledWith('BALANCED', ['CORE', 'COMPANIONS']);
  });
});
