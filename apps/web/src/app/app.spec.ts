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
    lookForTroubleCardIds: [],
    availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
    requestableHelperIds: [],
    playableCombatCards: {
      playersSideCardIds: [],
      monsterSideCardIds: [],
      monsterTargetActions: [],
      addMonsterActions: [],
      playerTargetActions: [],
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
      artKey: 'test.sword',
      name: 'Sword',
      description: 'A useful sword.',
      type: 'EQUIPMENT' as const,
      deck: 'TREASURE' as const,
      goldValue: 1000,
      effects: [{ type: 'COMBAT_BONUS' as const, amount: 2 }],
      equipment: {
        slot: 'HANDS' as const,
        hands: 1 as const,
        combatBonus: 2,
        restrictions: [],
        value: 1000,
      },
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
      lookForTroubleCardIds: [],
      availableEquipmentActions: { equipCardIds: ['sword-1'], unequipCardIds: [] },
      requestableHelperIds: [],
      playableCombatCards: {
        playersSideCardIds: [],
        monsterSideCardIds: [],
        monsterTargetActions: [],
        addMonsterActions: [],
        playerTargetActions: [],
      },
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
    const eventDetailsButton = compiled.querySelector<HTMLButtonElement>(
      '.game-history-list li.has-details .event-details-button',
    );
    expect(eventDetailsButton?.textContent?.trim()).toBe('');
    expect(eventDetailsButton?.getAttribute('aria-label')).toContain(
      'Открыть подробности события: Ada надел Sword.',
    );
    eventDetailsButton?.click();
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
      artKey: 'test.potion',
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

  it('combines the expected action with only the three latest public events', async () => {
    const player = playerView();
    lobbyClient.showGame({
      ...gameView(player),
      gameLog: (['PLAYER_ADDED', 'GAME_STARTED', 'TURN_STARTED', 'TURN_ENDED'] as const).map(
        (type, index) => ({
          sequence: index + 1,
          turnNumber: index + 1,
          phase: 'TURN_START' as const,
          type,
          visibility: 'PUBLIC' as const,
          playerId: player.playerId,
        }),
      ),
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const overview = (fixture.nativeElement as HTMLElement).querySelector('.game-overview');

    expect(overview?.querySelector('.expected-action')?.textContent).toContain(
      'Ждём действия от игрока: Ada',
    );
    expect(overview?.querySelectorAll('.recent-events li').length).toBe(3);
    expect(overview?.textContent).not.toContain('присоединился к игре');
    expect(overview?.textContent).toContain('завершил ход');
  });

  it('opens a scrollable public character with every slot filled and long names', async () => {
    const equipment = (
      instanceId: string,
      slot: 'HEAD' | 'BODY' | 'FEET' | 'HANDS',
      name: string,
    ): GameCardView => ({
      instanceId,
      definitionId: instanceId,
      artKey: `test.${instanceId}`,
      name,
      description: 'Filled equipment slot.',
      type: 'EQUIPMENT',
      deck: 'TREASURE',
      effects: [{ type: 'COMBAT_BONUS', amount: 1 }],
      equipment: {
        slot,
        hands: slot === 'HANDS' ? 1 : 0,
        combatBonus: 1,
        restrictions: [],
        value: 400,
      },
    });
    const classCard: GameCardView = {
      instanceId: 'class-1',
      definitionId: 'class-1',
      artKey: 'test.class',
      name: 'Extremely Long Adventuring Guild Specialist',
      description: 'A class.',
      type: 'CLASS',
      deck: 'DOOR',
      effects: [],
    };
    const raceCard: GameCardView = {
      ...classCard,
      instanceId: 'race-1',
      definitionId: 'race-1',
      artKey: 'test.race',
      name: 'Remarkably Long Forest-Dwelling People',
      type: 'RACE',
    };
    const filledEquipment = [
      equipment('head-1', 'HEAD', 'Unreasonably Elaborate Ceremonial Helmet'),
      equipment('body-1', 'BODY', 'Impossibly Long Reinforced Traveling Coat'),
      equipment('feet-1', 'FEET', 'Extraordinary Boots of Unending Expeditions'),
      equipment('left-1', 'HANDS', 'Left-Handed Instrument of Considerable Length'),
      equipment('right-1', 'HANDS', 'Right-Handed Implement with a Very Long Name'),
    ];
    const player = playerView({
      name: 'Ada with a Surprisingly Long Character Name',
      equipment: filledEquipment,
      equipmentCombatBonus: 5,
      combatPower: 6,
      classCard,
      raceCard,
    });
    lobbyClient.showGame(gameView(player));
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('.player-card')?.click();
    await fixture.whenStable();

    const dialog = compiled.querySelector('.character-dialog');
    expect(dialog?.textContent).toContain('Ada with a Surprisingly Long Character Name');
    expect(dialog?.querySelector('.character-scroll')).not.toBeNull();
    expect(dialog?.querySelector('header .history-close')).not.toBeNull();
    expect(dialog?.textContent).toContain('Unreasonably Elaborate Ceremonial Helmet');
    expect(dialog?.textContent).toContain('Right-Handed Implement with a Very Long Name');
    expect(dialog?.textContent).toContain('Extremely Long Adventuring Guild Specialist');
    expect(dialog?.textContent).toContain('Remarkably Long Forest-Dwelling People');
    expect(dialog?.querySelectorAll('app-equipment-layout .empty').length).toBe(0);
  });

  it('keeps an unavailable hand card visible and explains why it cannot be played', async () => {
    const card: GameCardView = {
      instanceId: 'potion-1',
      definitionId: 'potion',
      artKey: 'test.potion',
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

  it('renders complete Monster, weapon, modifier, and Curse metadata on shared card faces', async () => {
    const cards: readonly GameCardView[] = [
      {
        instanceId: 'monster-long-1',
        definitionId: 'monster-long',
        artKey: 'door.monster.long',
        name: 'A Monster Name Long Enough to Wrap Across Several Lines',
        description: 'A long Monster description.',
        type: 'MONSTER',
        deck: 'DOOR',
        effects: [],
        monster: {
          level: 14,
          levelRewards: 2,
          treasureRewards: 4,
          badStuff: [{ type: 'DISCARD_CHOSEN_CARDS', zone: 'EQUIPMENT', count: 2 }],
        },
      },
      {
        instanceId: 'weapon-1',
        definitionId: 'guild-weapon',
        artKey: 'treasure.equipment.guild-weapon',
        name: 'Exceptionally Long Two-Handed Guild Weapon',
        description: 'A restricted weapon.',
        type: 'EQUIPMENT',
        deck: 'TREASURE',
        goldValue: 900,
        play: { timings: ['TURN'], target: 'SELF' },
        effects: [],
        equipment: {
          slot: 'HANDS',
          hands: 2,
          combatBonus: 5,
          restrictions: [{ type: 'CLASS', definitionId: 'guild-of-echoes' }],
          value: 900,
        },
      },
      {
        instanceId: 'modifier-1',
        definitionId: 'modifier',
        artKey: 'treasure.modifier.reward-change',
        name: 'Executive Monster Promotion with a Very Long Contract',
        description: 'Changes strength and treasure.',
        type: 'MONSTER_MODIFIER',
        deck: 'TREASURE',
        goldValue: 500,
        play: {
          timings: ['ACTIVE_COMBAT', 'VICTORY_REACTION'],
          target: 'MONSTER_ENCOUNTER',
        },
        effects: [{ type: 'MODIFY_MONSTER', strength: 5, treasures: 2 }],
      },
      {
        instanceId: 'curse-1',
        definitionId: 'curse',
        artKey: 'door.curse.long',
        name: 'Curse with an Unreasonably Detailed Application Window',
        description: 'Requires an exact target and timing.',
        type: 'CURSE',
        deck: 'DOOR',
        play: { timings: ['WHEN_DRAWN', 'TURN'], target: 'ANY_PLAYER' },
        effects: [{ type: 'DISCARD_CHOSEN_CARDS', zone: 'HAND', count: 2 }],
      },
    ];
    const player = playerView({ handCount: cards.length });
    lobbyClient.showGame(gameView(player, cards));
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const handText = compiled.querySelector('.hand')?.textContent ?? '';

    expect(handText).toContain('Уровень: 14');
    expect(handText).toContain('Награда уровнями: 2');
    expect(handText).toContain('Сокровища: 4');
    expect(handText).toContain('Непотребство: Выбрать надетые предметы для сброса: 2');
    expect(handText).toContain('Занято рук: 2');
    expect(handText).toContain('Бонус снаряжения: +5');
    expect(handText).toContain('Ограничения: Класс: Гильдия эха');
    expect(handText).toContain('Цена: 900');
    expect(handText).toContain('Сила монстра +5, сокровищ +2');
    expect(handText).toContain('Цель: один монстр в бою');
    expect(handText).toContain('Выбрать карты для сброса 2 · Ваши карты');
    expect(handText).toContain('Время применения: при открытии, в свой ход');
    expect(compiled.querySelectorAll('.hand [data-art-key]')).toHaveLength(cards.length);

    compiled.querySelector<HTMLButtonElement>('.hand app-game-card:last-child button')?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.card-dialog .dialog-scroll')).not.toBeNull();
    expect(compiled.querySelector('.card-dialog')?.textContent).toContain('Цель: любой игрок');
    expect(compiled.querySelectorAll('[data-art-key="door.curse.long"]')).toHaveLength(2);
  });

  it('does not offer out-of-turn item actions and names the player ending the turn', async () => {
    const item: GameCardView = {
      instanceId: 'helmet-1',
      definitionId: 'helmet',
      artKey: 'test.helmet',
      name: 'Helmet',
      description: 'A sturdy helmet.',
      type: 'EQUIPMENT',
      deck: 'TREASURE',
      effects: [{ type: 'COMBAT_BONUS', amount: 1 }],
      equipment: {
        slot: 'HEAD',
        hands: 0,
        combatBonus: 1,
        restrictions: [],
        value: 400,
      },
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
      artKey: 'test.curse',
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

  it('chooses exactly one hand Monster before sending LOOK_FOR_TROUBLE', async () => {
    const monster: GameCardView = {
      instanceId: 'trouble-monster-1',
      definitionId: 'trouble-monster',
      artKey: 'test.trouble-monster',
      name: 'Trouble Monster',
      description: 'Waiting in the adventurer hand.',
      type: 'MONSTER',
      deck: 'DOOR',
      effects: [],
      monster: { level: 3, levelRewards: 1, treasureRewards: 1, badStuff: [] },
    };
    const self = playerView({ handCount: 1 });
    lobbyClient.showGame({
      ...gameView(self, [monster]),
      phase: 'POST_DOOR',
      availableActions: ['LOOK_FOR_TROUBLE', 'LOOT_ROOM', 'END_TURN'],
      lookForTroubleCardIds: [monster.instanceId],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const action = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.action-bar button'),
    ).find((button) => button.textContent?.trim() === 'Искать неприятности');

    action?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('[role="dialog"]')?.textContent).toContain(
      'Выберите ровно одного монстра с руки',
    );
    expect(lobbyClient.sendGameCommand).not.toHaveBeenCalled();

    compiled.querySelector<HTMLButtonElement>('.selection-list button')?.click();
    await fixture.whenStable();
    const confirm = Array.from(compiled.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Сразиться с выбранным монстром',
    );
    expect(confirm?.disabled).toBe(false);
    confirm?.click();

    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'LOOK_FOR_TROUBLE',
      cardId: monster.instanceId,
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
      lookForTroubleCardIds: [],
      availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
      requestableHelperIds: [],
      playableCombatCards: {
        playersSideCardIds: [],
        monsterSideCardIds: [],
        monsterTargetActions: [],
        addMonsterActions: [],
        playerTargetActions: [],
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
      artKey: 'test.potion',
      name: 'Potion',
      description: 'A quick boost.',
      type: 'TEMPORARY_BONUS' as const,
      deck: 'TREASURE' as const,
      effects: [{ type: 'COMBAT_BONUS' as const, amount: 3 }],
    };
    const monster = {
      instanceId: 'monster-1',
      definitionId: 'monster',
      artKey: 'test.monster',
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
        revision: 3,
        monsters: [
          {
            encounterId: 'encounter-1',
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: 3,
            strengthModifier: 5,
            currentStrength: 8,
            baseLevelRewards: 1,
            baseTreasureRewards: 2,
            treasureModifier: 2,
            currentTreasures: 4,
            playedCards: [],
          },
          {
            encounterId: 'encounter-2',
            monster,
            sourceCard: monster,
            clonedFromEncounterId: 'encounter-1',
            baseStrength: 3,
            strengthModifier: 0,
            currentStrength: 3,
            baseLevelRewards: 1,
            baseTreasureRewards: 2,
            treasureModifier: 0,
            currentTreasures: 2,
            playedCards: [],
          },
        ],
        playerPower: 4,
        monsterPower: 11,
        requestedHelperId: null,
        helperId: null,
        helperContribution: 0,
        reactionWindow: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId: 'player-1',
            encounterId: 'encounter-1',
            monster,
          },
        ],
      },
      lastRunAwayResult: null,
      pendingDecision: null,
      gameLog: [],
      deckCounts: { door: 10, treasure: 10 },
      expectedAction: { type: 'COMBAT_DECISION', playerId: 'player-1' },
      availableActions: ['DECLARE_COMBAT_VICTORY'],
      lookForTroubleCardIds: [],
      availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
      requestableHelperIds: ['player-2'],
      playableCombatCards: {
        playersSideCardIds: ['potion-1'],
        monsterSideCardIds: ['potion-1'],
        monsterTargetActions: [
          { cardId: 'potion-1', encounterIds: ['encounter-1', 'encounter-2'] },
        ],
        addMonsterActions: [],
        playerTargetActions: [],
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
    expect(compiled.querySelector('.monster-side')?.textContent).toContain('Итого 11');
    expect(compiled.querySelectorAll('.monster-combatant')).toHaveLength(2);
    expect(compiled.querySelector('.monster-combatant app-game-card')?.textContent).toContain(
      'Уровень: 3 · Текущий уровень: 8',
    );
    expect(compiled.textContent).toContain('История боя');
    compiled.querySelector<HTMLButtonElement>('.monster-combatant app-game-card button')?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.card-dialog')?.textContent).toContain(
      'Уровень: 3 · Текущий уровень: 8',
    );
    expect(compiled.querySelector('.card-dialog')?.textContent).toContain('Сокровища: 2 → 4');
    compiled.querySelector<HTMLButtonElement>('.card-dialog .close')?.click();
    await fixture.whenStable();
    const helpButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Позвать на помощь: Grace'),
    );
    helpButton?.click();
    compiled.querySelector<HTMLButtonElement>('.hand app-game-card button')?.click();
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
      target: { type: 'PLAYERS' },
    });
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'DECLARE_COMBAT_VICTORY',
      combatRevision: 3,
    });
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'REQUEST_HELP',
      helperId: 'player-2',
    });
  });

  it('uses the mobile charity dialog for exact selection and keeps a random option', async () => {
    const hand = Array.from({ length: 7 }, (_, index): GameCardView => ({
      instanceId: `charity-card-${index}`,
      definitionId: `charity-definition-${index}`,
      artKey: `test.charity-${index}`,
      name: `Charity ${index + 1}`,
      description: 'A test card.',
      type: 'EQUIPMENT',
      deck: 'TREASURE',
      effects: [],
      equipment: {
        slot: 'HANDS',
        hands: 1,
        combatBonus: 0,
        restrictions: [],
        value: 100,
      },
    }));
    const ada = playerView({ playerId: 'player-1', name: 'Ada', level: 3, handCount: 7 });
    const grace = playerView({ playerId: 'player-2', name: 'Grace', level: 1 });
    const linus = playerView({ playerId: 'player-3', name: 'Linus', level: 1 });
    lobbyClient.showGame({
      ...gameView(ada, hand),
      phase: 'END_TURN',
      players: [ada, grace, linus],
      expandedRuleActions: {
        ...gameView(ada).expandedRuleActions,
        charityCardCount: 2,
        charityRecipientIds: ['player-2', 'player-3'],
      },
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const handGrid = compiled.querySelector<HTMLElement>('.hand');
    expect(handGrid).not.toBeNull();
    expect(handGrid!.querySelectorAll('app-game-card')).toHaveLength(7);
    expect(getComputedStyle(handGrid!).display).toBe('grid');
    expect(getComputedStyle(handGrid!).overflowX).not.toBe('auto');
    expect(getComputedStyle(handGrid!).gridTemplateColumns).toContain('repeat(2');
    expect(
      getComputedStyle(handGrid!.querySelector<HTMLButtonElement>('app-game-card button')!)
        .minWidth,
    ).toBe('9.25rem');
    const charityButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Милостыня'),
    );
    charityButton?.click();
    fixture.detectChanges();

    const dialog = compiled
      .querySelector<HTMLElement>('#charity-title')
      ?.closest('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const cardButtons = Array.from(
      dialog!.querySelectorAll<HTMLButtonElement>('.selection-list button'),
    );
    cardButtons[0]!.click();
    cardButtons[1]!.click();
    const graceRadio = dialog!.querySelector<HTMLInputElement>('input[name="charity-recipient"]');
    expect(graceRadio).not.toBeNull();
    graceRadio!.click();
    graceRadio!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const confirm = Array.from(
      dialog!.querySelectorAll<HTMLButtonElement>('.charity-actions button'),
    ).find((button) => button.textContent?.includes('Подтвердить'));
    expect(confirm?.disabled).toBe(false);
    confirm!.click();
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'GIVE_CHARITY',
      cardIds: ['charity-card-0', 'charity-card-1'],
      recipientId: 'player-2',
    });

    charityButton?.click();
    fixture.detectChanges();
    const randomButton = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.charity-actions button'),
    ).find((button) => button.textContent?.includes('случайно'));
    randomButton!.click();
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({ type: 'GIVE_RANDOM_CHARITY' });
  });

  it('shows reconnect-safe reaction status and dispatches the versioned pass', async () => {
    const monster: GameCardView = {
      instanceId: 'reaction-monster-1',
      definitionId: 'reaction-monster',
      artKey: 'test.reaction-monster',
      name: 'Reaction Monster',
      description: 'Waits for every response.',
      type: 'MONSTER',
      deck: 'DOOR',
      effects: [],
      monster: { level: 3, levelRewards: 1, treasureRewards: 0, badStuff: [] },
    };
    const combatCurse: GameCardView = {
      instanceId: 'combat-curse-1',
      definitionId: 'combat-curse',
      artKey: 'test.combat-curse',
      name: 'Combat Curse',
      description: 'Reduces a combat participant power.',
      type: 'COMBAT_CURSE',
      deck: 'DOOR',
      effects: [{ type: 'COMBAT_BONUS', amount: -3 }],
    };
    const claimant = playerView({
      playerId: 'player-1',
      name: 'Ada',
      level: 6,
      combatPower: 6,
    });
    const viewer = playerView({
      playerId: 'player-2',
      name: 'Grace',
      handCount: 1,
    });
    const offline = playerView({ playerId: 'player-3', name: 'Lin' });
    lobbyClient.showGame({
      ...gameView(viewer, [combatCurse]),
      phase: 'DOOR_RESOLUTION',
      activePlayerId: claimant.playerId,
      players: [claimant, viewer, offline],
      combat: {
        playerId: claimant.playerId,
        revision: 4,
        monsters: [
          {
            encounterId: 'encounter-1',
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: 3,
            strengthModifier: 0,
            currentStrength: 3,
            baseLevelRewards: 1,
            baseTreasureRewards: 0,
            treasureModifier: 0,
            currentTreasures: 0,
            playedCards: [],
          },
        ],
        playerPower: 6,
        monsterPower: 3,
        requestedHelperId: null,
        helperId: null,
        helperContribution: 0,
        reactionWindow: {
          windowId: 7,
          claimantId: claimant.playerId,
          confirmedPlayerIds: [claimant.playerId],
          waitingPlayerIds: [viewer.playerId, offline.playerId],
        },
        history: [],
      },
      expectedAction: {
        type: 'COMBAT_REACTIONS',
        playerId: claimant.playerId,
        waitingPlayerIds: [viewer.playerId, offline.playerId],
      },
      availableActions: ['PASS_COMBAT_REACTION'],
      playableCombatCards: {
        playersSideCardIds: [],
        monsterSideCardIds: [],
        monsterTargetActions: [],
        addMonsterActions: [],
        playerTargetActions: [{ cardId: combatCurse.instanceId, playerIds: [claimant.playerId] }],
      },
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const reaction = compiled.querySelector('.combat-reaction-window');
    expect(reaction?.textContent).toContain('Победа заявлена');
    expect(reaction?.textContent).toContain('Ada');
    expect(reaction?.textContent).toContain('Grace');
    expect(reaction?.textContent).toContain('Lin');
    expect(reaction?.textContent).toContain('Combat Curse');

    const pass = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.action-bar button'),
    ).find((button) => button.textContent?.trim() === 'Не вмешиваюсь');
    pass?.click();
    expect(lobbyClient.sendGameCommand).toHaveBeenCalledWith({
      type: 'PASS_COMBAT_REACTION',
      reactionWindowId: 7,
    });
  });

  it('shows a failed escape result and its applied bad stuff', async () => {
    const monster = {
      instanceId: 'monster-1',
      definitionId: 'monster',
      artKey: 'test.monster',
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
        attempts: [
          {
            encounterId: 'encounter-1',
            monster,
            roll: 2,
            escaped: false,
            badStuffApplied: true,
          },
        ],
      },
      pendingDecision: null,
      gameLog: [],
      deckCounts: { door: 10, treasure: 10 },
      expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'player-1' },
      availableActions: ['END_TURN'],
      lookForTroubleCardIds: [],
      availableEquipmentActions: { equipCardIds: [], unequipCardIds: [] },
      requestableHelperIds: [],
      playableCombatCards: {
        playersSideCardIds: [],
        monsterSideCardIds: [],
        monsterTargetActions: [],
        addMonsterActions: [],
        playerTargetActions: [],
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
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('Побег не удался');
    expect(text).toContain('Бросок кубика: 2');
    expect(text).toContain('Непотребство монстра применено.');
  });
});
