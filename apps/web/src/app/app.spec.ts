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
  showGame(state: GameView): void {
    this.gameState.set(state);
  }
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
          {
            playerId: 'p1',
            name: 'Ada',
            isHost: true,
            connected: true,
            sex: 'FEMALE',
            color: 'PINK',
          },
          {
            playerId: 'p2',
            name: 'Grace',
            isHost: false,
            connected: false,
            sex: 'MALE',
            color: 'BLUE',
          },
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

  it('keeps the host from starting until every player chooses a sex', () => {
    client.showLobby(
      {
        roomCode: 'ABCD',
        status: LobbyStatus.LOBBY,
        hostPlayerId: 'p1',
        players: [
          {
            playerId: 'p1',
            name: 'Ada',
            isHost: true,
            connected: true,
            sex: 'FEMALE',
            color: 'PINK',
          },
          { playerId: 'p2', name: 'Grace', isHost: false, connected: true, color: 'BLUE' },
        ],
      },
      'p1',
    );
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    const startButton = Array.from(buttons).find((button) =>
      button.textContent?.includes('Начать'),
    ) as HTMLButtonElement;

    expect(startButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('каждый игрок должен выбрать');
    startButton.click();
    expect(client.startGame).not.toHaveBeenCalled();
  });

  it('lets only the host configure mode and optional sets before start', () => {
    client.showLobby(
      {
        roomCode: 'ABCD',
        status: LobbyStatus.LOBBY,
        hostPlayerId: 'p1',
        players: [
          {
            playerId: 'p1',
            name: 'Ada',
            isHost: true,
            connected: true,
            sex: 'FEMALE',
            color: 'PINK',
          },
        ],
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

  it('renders live combat from the GameView signal through the approved game shell', () => {
    const ada = {
      playerId: 'p1',
      name: 'Ada',
      level: 1,
      handCount: 0,
      equipment: [],
      temporaryCombatBonus: 0,
      equipmentCombatBonus: 0,
      combatPower: 1,
      classCard: null,
      raceCard: null,
      isDead: false,
    } as const;
    const monster = {
      instanceId: 'monster-1',
      definitionId: 'monster',
      artKey: 'test.monster',
      name: 'Monster',
      description: 'Test monster.',
      duration: 'ENCOUNTER_PASSIVE' as const,
      type: 'MONSTER' as const,
      deck: 'DOOR' as const,
      effects: [],
      monster: { strength: 2, levelRewards: 1, treasureRewards: 1, badStuff: [] },
    };
    client.showGame({
      gameId: 'live-game',
      viewerPlayerId: 'p1',
      status: 'IN_PROGRESS',
      phase: 'DOOR_RESOLUTION',
      activePlayerId: 'p1',
      turnNumber: 1,
      winnerId: null,
      players: [ada],
      self: { ...ada, hand: [] },
      combat: {
        combatId: 'combat-1',
        playerId: 'p1',
        revision: 1,
        monsters: [
          {
            encounterId: 'encounter-1',
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: 2,
            strengthModifier: 0,
            currentStrength: 2,
            baseLevelRewards: 1,
            baseTreasureRewards: 1,
            treasureModifier: 0,
            currentTreasures: 1,
            playedCards: [],
          },
        ],
        playerPower: 1,
        monsterPower: 2,
        requestedHelperId: null,
        helperId: null,
        helperContribution: 0,
        reactionWindow: null,
        history: [],
      },
      lastRunAwayResult: null,
      pendingDecision: null,
      curseResponse: null,
      gameLog: [],
      presentation: { blocking: null, important: [], routine: [] },
      expectedAction: { type: 'COMBAT_DECISION', playerId: 'p1' },
      deckCounts: { door: 1, treasure: 1 },
      availableIntents: [
        {
          id: 'run:1',
          kind: 'RUN_AWAY',
          reasonCode: 'COMBAT_LOSING',
          combatId: 'combat-1',
          combatRevision: 1,
        },
      ],
      unavailableCardReasons: [],
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-game-shell')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-combat-stage .combat')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Не хватает 1 силы');
  });
});
