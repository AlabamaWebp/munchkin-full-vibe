import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LobbyStatus, type LobbyState } from '@munchkin-lan/contracts';
import { App } from './app';
import { LobbyClient, type ConnectionState } from './lobby-client';

class MockLobbyClient {
  private readonly connectionState = signal<ConnectionState>('CONNECTED');
  private readonly lobbyState = signal<LobbyState | null>(null);
  private readonly currentPlayerId = signal<string | null>(null);

  readonly connection = this.connectionState.asReadonly();
  readonly lobby = this.lobbyState.asReadonly();
  readonly playerId = this.currentPlayerId.asReadonly();
  readonly error = signal<string | null>(null).asReadonly();
  readonly pending = signal(false).asReadonly();
  readonly isHost = computed(() => this.lobbyState()?.hostPlayerId === this.currentPlayerId());
  readonly hasStarted = computed(() => this.lobbyState()?.status === LobbyStatus.STARTED);

  readonly createRoom = vi.fn();
  readonly joinRoom = vi.fn();
  readonly startGame = vi.fn();

  showLobby(state: LobbyState, playerId: string): void {
    this.currentPlayerId.set(playerId);
    this.lobbyState.set(state);
  }
}

describe('App', () => {
  let lobbyClient: MockLobbyClient;

  beforeEach(async () => {
    lobbyClient = new MockLobbyClient();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: LobbyClient, useValue: lobbyClient }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the home screen and creates a room with the entered name', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Munchkin LAN');
    expect(compiled.textContent).toContain('Adventure is better together.');

    const nameInput = compiled.querySelector<HTMLInputElement>('#player-name');
    const createButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create room'),
    );
    if (nameInput === null || createButton === undefined) {
      throw new Error('Expected the create-room controls to render.');
    }
    nameInput.value = 'Ada';
    nameInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    createButton.click();

    expect(lobbyClient.createRoom).toHaveBeenCalledWith('Ada');
  });

  it('renders synchronized players and lets only the host start', async () => {
    lobbyClient.showLobby(
      {
        roomCode: 'ABCD',
        status: LobbyStatus.LOBBY,
        hostPlayerId: 'player-1',
        players: [
          { playerId: 'player-1', name: 'Ada', isHost: true },
          { playerId: 'player-2', name: 'Grace', isHost: false },
        ],
      },
      'player-1',
    );
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h2')?.textContent).toContain('ABCD');
    expect(compiled.textContent).toContain('Ada');
    expect(compiled.textContent).toContain('Grace');

    const startButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Start game'),
    );
    if (startButton === undefined) throw new Error('Expected host start button.');
    startButton.click();
    expect(lobbyClient.startGame).toHaveBeenCalledOnce();
  });
});
