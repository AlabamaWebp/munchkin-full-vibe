import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  LobbyStatus,
  type GameCardView,
  type GamePlayerView,
  type GameView,
  type LobbyState,
} from '@munchkin-lan/contracts';
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

function playerView(overrides: Partial<GamePlayerView> = {}): GamePlayerView {
  return {
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
    ...overrides,
  };
}

function gameView(player: GamePlayerView, hand: readonly GameCardView[] = []): GameView {
  return {
    gameId: 'ABCD',
    viewerPlayerId: player.playerId,
    status: 'IN_PROGRESS',
    phase: 'TURN_START',
    activePlayerId: player.playerId,
    turnNumber: 1,
    winnerId: null,
    players: [player],
    self: { ...player, hand },
    combat: null,
    lastRunAwayResult: null,
    pendingDecision: null,
    gameLog: [],
    expectedAction: { type: 'TAKE_TURN_ACTION', playerId: player.playerId },
    deckCounts: { door: 10, treasure: 10 },
    availableActions: ['KICK_DOOR'],
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
    unavailableCardReasons: [],
  };
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

  it('enters fullscreen and reflects browser-driven fullscreen changes', async () => {
    let fullscreenElement: Element | null = null;
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('.fullscreen-button');
    if (button === null) throw new Error('Expected the fullscreen control.');

    expect(button.getAttribute('aria-label')).toBe('На весь экран');
    button.click();
    await fixture.whenStable();

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(button.getAttribute('aria-label')).toBe('Выйти из полноэкранного режима');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows authoritative combat power and equips an available selected card', async () => {
    const card = {
      instanceId: 'sword-1',
      definitionId: 'sword',
      name: 'Sword',
      description: 'A useful sword.',
      type: 'EQUIPMENT' as const,
      deck: 'TREASURE' as const,
      effects: [{ type: 'COMBAT_BONUS' as const, amount: 2 }],
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
      pendingDecision: null,
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'TURN_START',
          type: 'GAME_STARTED',
          visibility: 'PUBLIC',
          playerId: 'player-1',
        },
        {
          sequence: 2,
          turnNumber: 1,
          phase: 'TURN_START',
          type: 'ITEM_EQUIPPED',
          visibility: 'PUBLIC',
          playerId: 'player-1',
          card,
        },
      ],
      deckCounts: { door: 10, treasure: 10 },
      expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'player-1' },
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
      unavailableCardReasons: [],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Сила 1');
    expect(compiled.querySelector('.recent-events')?.textContent).toContain('Ada надел Sword.');
    const saleButton = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Продать вещи',
    );
    saleButton?.click();
    await fixture.whenStable();
    compiled.querySelector<HTMLButtonElement>('.sale-list button')?.click();
    await fixture.whenStable();
    const confirmSale = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Продать выбранные вещи',
    );
    confirmSale?.click();
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'SELL_ITEMS',
      cardIds: ['sword-1'],
    });
    compiled.querySelector<HTMLButtonElement>('.history-button')?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.history-dialog')?.textContent).toContain('История игры');
    expect(compiled.querySelector('.history-dialog')?.textContent).toContain('Ada надел Sword.');
    compiled.querySelector<HTMLButtonElement>('.game-history-list li.has-details button')?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('app-card-details-dialog')?.textContent).toContain(
      'A useful sword.',
    );
    expect(compiled.querySelector('app-card-details-dialog')?.textContent).toContain('Ход 1');
    compiled.querySelector<HTMLButtonElement>('app-card-details-dialog .close')?.click();
    await fixture.whenStable();
    compiled.querySelector<HTMLButtonElement>('.history-close')?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.history-dialog')).toBeNull();
    compiled.querySelector<HTMLButtonElement>('app-game-card button')?.click();
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

  it('shows a new public card event once and keeps it available through details', async () => {
    const card: GameCardView = {
      instanceId: 'potion-1',
      definitionId: 'potion',
      name: 'Potion',
      description: 'A visible boost.',
      type: 'TEMPORARY_BONUS',
      deck: 'TREASURE',
      effects: [{ type: 'COMBAT_BONUS', amount: 3 }],
    };
    const initial = gameView(playerView());
    lobbyClient.showGame(initial);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    lobbyClient.showGame({
      ...initial,
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'DOOR_RESOLUTION',
          type: 'CARD_PLAYED',
          visibility: 'PUBLIC',
          playerId: 'player-1',
          card,
          side: 'PLAYERS',
        },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.public-event-zone')?.textContent).toContain('Potion');
    compiled.querySelector<HTMLButtonElement>('.public-event-zone app-game-card button')?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('app-card-details-dialog')?.textContent).toContain(
      'Бонус в бою +3',
    );
    fixture.destroy();

    const reloaded = TestBed.createComponent(App);
    reloaded.detectChanges();
    await reloaded.whenStable();
    expect((reloaded.nativeElement as HTMLElement).querySelector('.public-event-zone')).toBeNull();
  });

  it('opens a public character with empty slots and a two-handed item spanning both hands', async () => {
    const greatSword: GameCardView = {
      instanceId: 'great-sword-1',
      definitionId: 'great-sword',
      name: 'Great Sword',
      description: 'It needs both hands.',
      type: 'EQUIPMENT',
      deck: 'TREASURE',
      effects: [{ type: 'COMBAT_BONUS', amount: 4 }],
      equipment: { slot: 'HANDS', hands: 2, combatBonus: 4, value: 800 },
    };
    const player = playerView({ equipment: [greatSword], equipmentCombatBonus: 4, combatPower: 5 });
    lobbyClient.showGame(gameView(player));
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('.player-card')?.click();
    await fixture.whenStable();

    expect(compiled.querySelector('.character-dialog')?.textContent).toContain('Карт в руке 0');
    expect(compiled.querySelector('.two-handed')?.textContent).toContain('Great Sword');
    expect(compiled.querySelector('.two-handed')?.textContent).toContain('Двуручный предмет');
    expect(compiled.querySelectorAll('app-equipment-layout .empty').length).toBeGreaterThanOrEqual(
      5,
    );
  });

  it('keeps an unavailable hand card visible and explains why it cannot be played', async () => {
    const card: GameCardView = {
      instanceId: 'potion-1',
      definitionId: 'potion',
      name: 'Potion',
      description: 'A combat-only boost.',
      type: 'TEMPORARY_BONUS',
      deck: 'TREASURE',
      effects: [{ type: 'COMBAT_BONUS', amount: 3 }],
    };
    const player = playerView({ handCount: 1 });
    lobbyClient.showGame({
      ...gameView(player, [card]),
      unavailableCardReasons: [{ cardId: card.instanceId, reason: 'NO_ACTIVE_COMBAT' }],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('.hand app-game-card button')?.click();
    await fixture.whenStable();

    expect(compiled.querySelector('app-card-details-dialog')?.textContent).toContain(
      'Для этой карты нужен активный бой.',
    );
    expect(lobbyClient.sendGameCommand).not.toHaveBeenCalled();
  });

  it('does not offer out-of-turn item actions and names the player ending the turn', async () => {
    const item: GameCardView = {
      instanceId: 'helmet-1',
      definitionId: 'helmet',
      name: 'Helmet',
      description: 'A sturdy helmet.',
      type: 'EQUIPMENT',
      deck: 'TREASURE',
      effects: [{ type: 'COMBAT_BONUS', amount: 1 }],
      equipment: { slot: 'HEAD', combatBonus: 1, value: 400 },
    };
    const active = playerView({ playerId: 'player-1', name: 'Ada' });
    const viewer = playerView({ playerId: 'player-2', name: 'Grace', handCount: 1 });
    lobbyClient.showGame({
      ...gameView(viewer, [item]),
      phase: 'END_TURN',
      activePlayerId: active.playerId,
      players: [active, viewer],
      expectedAction: { type: 'TAKE_TURN_ACTION', playerId: active.playerId },
      availableActions: [],
      expandedRuleActions: {
        ...gameView(viewer).expandedRuleActions,
        tradeableItemCardIds: [],
      },
      unavailableCardReasons: [{ cardId: item.instanceId, reason: 'WAITING_FOR_TURN' }],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('#turn-title')?.textContent).toContain('Ada завершает ход…');
    expect(compiled.querySelector('.action-bar')?.textContent).toContain('Ada завершает ход…');
    expect(compiled.querySelector('.hand app-game-card')?.textContent).not.toContain(
      'Можно сыграть',
    );
    const cardButton = compiled.querySelector<HTMLButtonElement>('.hand app-game-card button');
    expect(cardButton?.dataset['cardType']).toBe('EQUIPMENT');
    expect(cardButton?.dataset['cardDeck']).toBe('TREASURE');
    cardButton?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('app-card-details-dialog')?.textContent).toContain(
      'Эту карту можно использовать только в свой ход.',
    );
    expect(compiled.querySelector('app-card-details-dialog')?.textContent).not.toContain(
      'Выбрать получателя',
    );
  });

  it('highlights only valid card targets and asks for confirmation before sending', async () => {
    const curse: GameCardView = {
      instanceId: 'curse-1',
      definitionId: 'curse',
      name: 'Foggy Boots',
      description: 'A target loses one level.',
      type: 'CURSE',
      deck: 'DOOR',
      effects: [{ type: 'LOSE_LEVEL', amount: 1 }],
    };
    const self = playerView({ handCount: 1 });
    const grace = playerView({ playerId: 'player-2', name: 'Grace' });
    lobbyClient.showGame({
      ...gameView(self, [curse]),
      players: [self, grace],
      expandedRuleActions: {
        ...gameView(self).expandedRuleActions,
        playableCurseCardIds: [curse.instanceId],
      },
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('.hand app-game-card button')?.click();
    await fixture.whenStable();
    const chooseTarget = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Выбрать цель проклятия',
    );
    chooseTarget?.click();
    await fixture.whenStable();
    expect(compiled.querySelectorAll('.player-card.valid-target')).toHaveLength(2);
    const graceTarget = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.player-card.valid-target'),
    ).find((button) => button.textContent?.includes('Grace'));
    graceTarget?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('[role="alertdialog"]')?.textContent).toContain('Grace');
    expect(lobbyClient.sendGameCommand).not.toHaveBeenCalled();
    const confirm = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Подтвердить',
    );
    confirm?.click();
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'PLAY_CURSE',
      cardId: 'curse-1',
      targetPlayerId: 'player-2',
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
      pendingDecision: null,
      gameLog: [],
      deckCounts: { door: 5, treasure: 5 },
      expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'player-1' },
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
      unavailableCardReasons: [],
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
      effects: [{ type: 'COMBAT_BONUS' as const, amount: 3 }],
    };
    const monster = {
      instanceId: 'monster-1',
      definitionId: 'monster',
      name: 'Monster',
      description: 'A test monster.',
      type: 'MONSTER' as const,
      deck: 'DOOR' as const,
      effects: [],
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
      pendingDecision: null,
      gameLog: [],
      deckCounts: { door: 10, treasure: 10 },
      expectedAction: { type: 'COMBAT_DECISION', playerId: 'player-1' },
      availableActions: ['RESOLVE_COMBAT'],
      availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
      requestableHelperIds: ['player-2'],
      playableCombatCards: {
        playersSideCardIds: ['potion-1'],
        monsterSideCardIds: ['potion-1'],
      },
      expandedRuleActions: {
        playableRoleCardIds: [],
        playableCurseCardIds: [],
        sellableItemCardIds: [],
        tradeableItemCardIds: [],
        charityCardCount: 0,
        charityRecipientIds: [],
      },
      unavailableCardReasons: [],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.player-side')?.textContent).toContain('Итого 4');
    expect(compiled.querySelector('.monster-side')?.textContent).toContain('Итого 3');
    expect(compiled.textContent).toContain('История боя');
    const helpButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Позвать на помощь: Grace'),
    );
    helpButton?.click();
    compiled.querySelectorAll<HTMLButtonElement>('app-game-card button')[1]?.click();
    await fixture.whenStable();
    const playButton = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Сыграть за приключенцев',
    );
    expect(
      Array.from(compiled.querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Сыграть за монстра',
      ),
    ).toBe(true);
    playButton?.click();
    await fixture.whenStable();
    const confirmButton = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Подтвердить',
    );
    confirmButton?.click();
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
      effects: [],
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
      pendingDecision: null,
      gameLog: [],
      deckCounts: { door: 10, treasure: 10 },
      expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'player-1' },
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
      unavailableCardReasons: [],
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
