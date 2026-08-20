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
  readonly rematch = vi.fn();
  readonly returnToLobby = vi.fn();
  readonly sendGameCommand = vi.fn();

  showLobby(state: LobbyState, playerId: string): void {
    this.currentPlayerId.set(playerId);
    this.lobbyState.set(state);
  }

  showGame(state: GameView): void {
    this.currentPlayerId.set(state.viewerPlayerId);
    this.gameState.set(state);
  }
}

describe('App', () => {
  let lobbyClient: MockLobbyClient;

  beforeEach(async () => {
    window.localStorage.clear();
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
    expect(compiled.textContent).toContain('Вместе приключаться веселее.');

    const nameInput = compiled.querySelector<HTMLInputElement>('#player-name');
    const createButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Создать комнату'),
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
          {
            playerId: 'player-1',
            name: 'Ada',
            isHost: true,
            connected: true,
          },
          {
            playerId: 'player-2',
            name: 'Grace',
            isHost: false,
            connected: true,
          },
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
      button.textContent?.includes('Начать игру'),
    );
    if (startButton === undefined) throw new Error('Expected host start button.');
    startButton.click();
    expect(lobbyClient.startGame).toHaveBeenCalledOnce();
  });

  it('switches the whole interface to English and remembers the choice', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const englishButton = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'EN',
    );
    if (englishButton === undefined) throw new Error('Expected the language switcher.');

    englishButton.click();
    await fixture.whenStable();

    expect(compiled.textContent).toContain('Adventure is better together.');
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('munchkin-lan.locale')).toBe('en');
  });

  it('shows authoritative combat power and equips an available selected card', async () => {
    const card = {
      instanceId: 'sword-1',
      definitionId: 'sword',
      name: 'Sword',
      description: 'A useful sword.',
      type: 'EQUIPMENT' as const,
      deck: 'TREASURE' as const,
      equipment: { slot: 'HANDS' as const, hands: 1 as const, combatBonus: 2, value: 1000 },
    };
    const player = {
      playerId: 'player-1',
      name: 'Ada',
      level: 1,
      handCount: 1,
      equipment: [],
      temporaryCombatBonus: 0,
      equipmentCombatBonus: 0,
      combatPower: 1,
      classCard: null,
      raceCard: null,
      isDead: false,
    };
    lobbyClient.showGame({
      gameId: 'ABCD',
      viewerPlayerId: 'player-1',
      status: 'IN_PROGRESS',
      phase: 'TURN_START',
      activePlayerId: 'player-1',
      turnNumber: 1,
      winnerId: null,
      players: [player],
      self: { ...player, hand: [card] },
      combat: null,
      lastRunAwayResult: null,
      deckCounts: { door: 10, treasure: 10 },
      availableActions: ['KICK_DOOR'],
      availableEquipmentActions: { equipCardIds: ['sword-1'], unequipCardIds: [] },
      requestableHelperIds: [],
      playableCombatCards: { playersSideCardIds: [], monsterSideCardIds: [] },
      expandedRuleActions: {
        playableRoleCardIds: [],
        playableCurseCardIds: [],
        sellableItemCardIds: ['sword-1'],
        tradeableItemCardIds: ['sword-1'],
        charityCardCount: 0,
        charityRecipientIds: [],
      },
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Сила 1');
    compiled.querySelector<HTMLButtonElement>('.hand-card')?.click();
    await fixture.whenStable();
    const equipButton = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Надеть',
    );
    if (equipButton === undefined) throw new Error('Expected an equip action.');
    equipButton.click();

    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'EQUIP_ITEM',
      cardId: 'sword-1',
    });
  });

  it('shows the winner and gives the host rematch and lobby actions', async () => {
    const player = {
      playerId: 'player-1',
      name: 'Ada',
      level: 10,
      handCount: 0,
      equipment: [],
      temporaryCombatBonus: 0,
      equipmentCombatBonus: 0,
      combatPower: 10,
      classCard: null,
      raceCard: null,
      isDead: false,
    };
    lobbyClient.showLobby(
      {
        roomCode: 'ABCD',
        status: LobbyStatus.STARTED,
        hostPlayerId: 'player-1',
        players: [
          {
            playerId: 'player-1',
            name: 'Ada',
            isHost: true,
            connected: true,
          },
        ],
      },
      'player-1',
    );
    lobbyClient.showGame({
      gameId: 'ABCD',
      viewerPlayerId: 'player-1',
      status: 'FINISHED',
      phase: 'FINISHED',
      activePlayerId: 'player-1',
      turnNumber: 8,
      winnerId: 'player-1',
      players: [player],
      self: { ...player, hand: [] },
      combat: null,
      lastRunAwayResult: null,
      deckCounts: { door: 5, treasure: 5 },
      availableActions: [],
      availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
      requestableHelperIds: [],
      playableCombatCards: { playersSideCardIds: [], monsterSideCardIds: [] },
      expandedRuleActions: {
        playableRoleCardIds: [],
        playableCurseCardIds: [],
        sellableItemCardIds: [],
        tradeableItemCardIds: [],
        charityCardCount: 0,
        charityRecipientIds: [],
      },
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.victory-panel')?.textContent).toContain('Ada');

    const buttons = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.victory-actions button'),
    );
    buttons[0]?.click();
    buttons[1]?.click();
    expect(lobbyClient.rematch).toHaveBeenCalledOnce();
    expect(lobbyClient.returnToLobby).toHaveBeenCalledOnce();
  });

  it('shows combat scores and dispatches temporary bonus and resolution intentions', async () => {
    const bonus = {
      instanceId: 'potion-1',
      definitionId: 'potion',
      name: 'Potion',
      description: 'A quick boost.',
      type: 'TEMPORARY_BONUS' as const,
      deck: 'TREASURE' as const,
    };
    const monster = {
      instanceId: 'monster-1',
      definitionId: 'monster',
      name: 'Monster',
      description: 'A test monster.',
      type: 'MONSTER' as const,
      deck: 'DOOR' as const,
      monster: { level: 3, levelRewards: 1, treasureRewards: 2, badStuff: [] },
    };
    const player = {
      playerId: 'player-1',
      name: 'Ada',
      level: 2,
      handCount: 1,
      equipment: [],
      temporaryCombatBonus: 2,
      equipmentCombatBonus: 0,
      combatPower: 4,
      classCard: null,
      raceCard: null,
      isDead: false,
    };
    const helper = {
      playerId: 'player-2',
      name: 'Grace',
      level: 3,
      handCount: 0,
      equipment: [],
      temporaryCombatBonus: 0,
      equipmentCombatBonus: 0,
      combatPower: 3,
      classCard: null,
      raceCard: null,
      isDead: false,
    };
    lobbyClient.showGame({
      gameId: 'ABCD',
      viewerPlayerId: 'player-1',
      status: 'IN_PROGRESS',
      phase: 'DOOR_RESOLUTION',
      activePlayerId: 'player-1',
      turnNumber: 1,
      winnerId: null,
      players: [player, helper],
      self: { ...player, hand: [bonus] },
      combat: {
        playerId: 'player-1',
        monster,
        playerPower: 4,
        monsterPower: 3,
        monsterBonus: 0,
        requestedHelperId: null,
        helperId: null,
        helperContribution: 0,
        history: [{ type: 'COMBAT_STARTED', playerId: 'player-1', monster }],
      },
      lastRunAwayResult: null,
      deckCounts: { door: 10, treasure: 10 },
      availableActions: ['RESOLVE_COMBAT'],
      availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
      requestableHelperIds: ['player-2'],
      playableCombatCards: {
        playersSideCardIds: ['potion-1'],
        monsterSideCardIds: [],
      },
      expandedRuleActions: {
        playableRoleCardIds: [],
        playableCurseCardIds: [],
        sellableItemCardIds: [],
        tradeableItemCardIds: [],
        charityCardCount: 0,
        charityRecipientIds: [],
      },
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Ваша сила 4');
    expect(compiled.textContent).toContain('Сила монстра 3');
    expect(compiled.textContent).toContain('История боя');
    const helpButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Позвать на помощь: Grace'),
    );
    helpButton?.click();
    compiled.querySelector<HTMLButtonElement>('.hand-card')?.click();
    await fixture.whenStable();
    const playButton = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Сыграть за приключенцев',
    );
    playButton?.click();
    const resolveButton = Array.from(compiled.querySelectorAll('.action-bar button')).find(
      (button) => button.textContent?.trim() === 'Заявить победу',
    );
    resolveButton?.dispatchEvent(new MouseEvent('click'));

    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'PLAY_CARD',
      cardId: 'potion-1',
      targetSide: 'PLAYERS',
    });
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({ type: 'RESOLVE_COMBAT' });
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'REQUEST_HELP',
      helperId: 'player-2',
    });
  });

  it('shows a failed escape result and its applied bad stuff', async () => {
    const monster = {
      instanceId: 'monster-1',
      definitionId: 'monster',
      name: 'Monster',
      description: 'A test monster.',
      type: 'MONSTER' as const,
      deck: 'DOOR' as const,
      monster: {
        level: 3,
        levelRewards: 1,
        treasureRewards: 1,
        badStuff: [{ type: 'LOSE_LEVEL' as const, amount: 1 }],
      },
    };
    const player = {
      playerId: 'player-1',
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
    };
    lobbyClient.showGame({
      gameId: 'ABCD',
      viewerPlayerId: 'player-1',
      status: 'IN_PROGRESS',
      phase: 'END_TURN',
      activePlayerId: 'player-1',
      turnNumber: 1,
      winnerId: null,
      players: [player],
      self: { ...player, hand: [] },
      combat: null,
      lastRunAwayResult: {
        playerId: 'player-1',
        monster,
        roll: 2,
        escaped: false,
        badStuffApplied: true,
      },
      deckCounts: { door: 10, treasure: 10 },
      availableActions: ['END_TURN'],
      availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
      requestableHelperIds: [],
      playableCombatCards: { playersSideCardIds: [], monsterSideCardIds: [] },
      expandedRuleActions: {
        playableRoleCardIds: [],
        playableCurseCardIds: [],
        sellableItemCardIds: [],
        tradeableItemCardIds: [],
        charityCardCount: 0,
        charityRecipientIds: [],
      },
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('Побег не удался');
    expect(text).toContain('Бросок кубика: 2');
    expect(text).toContain('Непотребство монстра применено.');
  });
});
