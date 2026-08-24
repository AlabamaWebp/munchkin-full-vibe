import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GameCardView, GamePlayerView, GameView } from '@munchkin-lan/contracts';
import { GameShellComponent } from './game-shell.component';
import { LobbyClient, type ConnectionState } from './lobby-client';

class MockLobbyClient {
  readonly connection = signal<ConnectionState>('CONNECTED').asReadonly();
  readonly isHost = signal(false).asReadonly();
  readonly sendGameCommand = vi.fn();
  readonly sendGameCommands = vi.fn();
  readonly rematch = vi.fn();
  readonly returnToLobby = vi.fn();
}

const player = (overrides: Partial<GamePlayerView> = {}): GamePlayerView => ({
  playerId: 'p1',
  name: 'Ada',
  level: 2,
  handCount: 0,
  equipment: [],
  temporaryCombatBonus: 0,
  equipmentCombatBonus: 0,
  combatPower: 2,
  combatPowerBreakdown: [{ source: 'LEVEL', amount: 2 }],
  classCard: null,
  raceCard: null,
  isDead: false,
  ...overrides,
});
const card = (overrides: Partial<GameCardView> = {}): GameCardView => ({
  instanceId: 'c1',
  definitionId: 'card',
  artKey: 'test.card',
  name: 'Useful Card',
  description: 'A useful effect.',
  duration: 'END_OF_COMBAT',
  type: 'TEMPORARY_BONUS',
  deck: 'TREASURE',
  effects: [{ type: 'COMBAT_BONUS', amount: 3 }],
  ...overrides,
});
const monster = card({
  instanceId: 'm1',
  definitionId: 'monster',
  artKey: 'test.monster',
  name: 'Archive Dragon',
  description: 'A terrible dragon.',
  type: 'MONSTER',
  deck: 'DOOR',
  effects: [],
  monster: {
    strength: 17,
    levelRewards: 2,
    treasureRewards: 5,
    badStuff: [{ type: 'LOSE_LEVEL', amount: 1 }],
  },
});
const base = (overrides: Partial<GameView> = {}): GameView => {
  const ada = player();
  return {
    gameId: 'G',
    viewerPlayerId: 'p1',
    status: 'IN_PROGRESS',
    phase: 'TURN_START',
    activePlayerId: 'p1',
    turnNumber: 1,
    winnerId: null,
    players: [ada],
    self: { ...ada, hand: [] },
    combat: null,
    lastRunAwayResult: null,
    pendingDecision: null,
    curseResponse: null,
    gameLog: [],
    presentation: { blocking: null, important: [], routine: [] },
    expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'p1' },
    deckCounts: { door: 10, treasure: 10 },
    availableIntents: [{ id: 'kick:1', kind: 'KICK_DOOR', reasonCode: 'PRIMARY_TURN_ACTION' }],
    unavailableCardReasons: [],
    ...overrides,
  };
};
const encounter = (id = 'e1', strength = 17) => ({
  encounterId: id,
  monster,
  sourceCard: monster,
  clonedFromEncounterId: null,
  baseStrength: 17,
  strengthModifier: strength - 17,
  currentStrength: strength,
  baseLevelRewards: 2,
  baseTreasureRewards: 5,
  treasureModifier: 0,
  currentTreasures: 5,
  playedCards: [],
});
const combat = (
  overrides: Partial<NonNullable<GameView['combat']>> = {},
): NonNullable<GameView['combat']> => ({
  combatId: 'combat-1',
  playerId: 'p1',
  revision: 4,
  monsters: [encounter()],
  playerPower: 19,
  monsterPower: 17,
  requestedHelperId: null,
  helperId: null,
  helperContribution: 0,
  reactionWindow: null,
  history: [],
  ...overrides,
});

describe('GameShellComponent', () => {
  let client: MockLobbyClient;
  beforeEach(async () => {
    client = new MockLobbyClient();
    await TestBed.configureTestingModule({
      imports: [GameShellComponent],
      providers: [{ provide: LobbyClient, useValue: client }],
    }).compileComponents();
  });
  const render = (game: GameView) => {
    const fixture = TestBed.createComponent(GameShellComponent);
    fixture.componentRef.setInput('game', game);
    fixture.detectChanges();
    return fixture;
  };

  it('renders own turn and other-player turn in the fixed shell', () => {
    const own = render(base());
    expect(
      (own.nativeElement as HTMLElement).querySelector('[data-stage="TURN_READY"]')?.textContent,
    ).toContain('Ваш ход');
    expect((own.nativeElement as HTMLElement).querySelector('.game-shell')).not.toBeNull();
    const grace = player({ playerId: 'p2', name: 'Grace' });
    const other = render(
      base({
        activePlayerId: 'p2',
        players: [base().self, grace],
        expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'p2' },
        availableIntents: [],
      }),
    );
    expect((other.nativeElement as HTMLElement).textContent).toContain('Ходит Grace');
    expect(
      (other.nativeElement as HTMLElement).querySelector('.turn-line strong')?.textContent,
    ).toContain('Ходит Grace');
  });

  it('keeps an empty action dock silent on the viewer’s turn', () => {
    const own = render(base({ availableIntents: [] })).nativeElement as HTMLElement;
    expect(own.querySelector('app-action-dock p')).toBeNull();

    const grace = player({ playerId: 'p2', name: 'Grace' });
    const other = render(
      base({
        activePlayerId: 'p2',
        players: [base().self, grace],
        expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'p2' },
        availableIntents: [],
      }),
    ).nativeElement as HTMLElement;
    expect(other.querySelector('app-action-dock p')?.textContent).toContain(
      'Ожидаем действие другого игрока',
    );
  });

  it('requires an explicit Monster selection before looking for trouble', () => {
    const fixture = render(
      base({
        phase: 'POST_DOOR',
        self: { ...player({ handCount: 1 }), hand: [monster] },
        availableIntents: [
          {
            id: 'look-for-trouble:m1',
            kind: 'LOOK_FOR_TROUBLE',
            reasonCode: 'PRIMARY_TURN_ACTION',
            cardId: 'm1',
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;

    Array.from(root.querySelectorAll<HTMLButtonElement>('app-action-dock button'))
      .find((button) => button.textContent?.includes('Искать неприятности'))!
      .click();
    fixture.detectChanges();

    expect(root.querySelector('#target-title')?.textContent).toContain('Выберите монстра');
    expect(client.sendGameCommand).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('.option-list button')!.click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'LOOK_FOR_TROUBLE', cardId: 'm1' });
  });

  it('shows the character sex below the nickname', () => {
    const fixture = render(base({ self: { ...player({ sex: 'FEMALE' }), hand: [] } }));

    expect(fixture.nativeElement.querySelector('.summary-sex')?.textContent).toContain('женский');
  });

  it('keeps six player chips in a horizontal rail', () => {
    const players = Array.from({ length: 6 }, (_, index) =>
      player({ playerId: `p${index + 1}`, name: `Very Long Player ${index + 1}` }),
    );
    const root = render(base({ players, self: { ...players[0]!, hand: [] } }))
      .nativeElement as HTMLElement;
    expect(root.querySelectorAll('.player')).toHaveLength(6);
    expect(root.querySelector('.players')?.classList.contains('players')).toBe(true);
  });

  it('renders empty equipment, no class, and empty or full hands from the projected player view', () => {
    const empty = render(base()).nativeElement as HTMLElement;
    expect(empty.textContent).toContain('Рука пуста');

    const fiveCards = Array.from({ length: 5 }, (_, index) =>
      card({ instanceId: `card-${index}`, name: `Very long card name ${index}` }),
    );
    const self = player({
      name: 'Extremely long player name that must remain contained',
      handCount: 5,
    });
    const fixture = render(
      base({
        players: [self, player({ playerId: 'p2', name: 'Another very long player name' })],
        self: { ...self, hand: fiveCards },
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent?.replace(/\s+/gu, ' ').trim()).toContain('Рука 5/5');
    root.querySelector<HTMLButtonElement>('.character-summary')!.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('Классы: нет · Расы: нет');
    expect(root.querySelectorAll('.equipment-grid .empty')).toHaveLength(10);
  });

  it('shows Door reveal and immediate Curse consequence from the event log', () => {
    const curse = card({
      type: 'CURSE',
      deck: 'DOOR',
      name: 'Curse: Pocket Gravity',
      description: 'Lose one item.',
    });
    const root = render(
      base({
        phase: 'DOOR_RESOLUTION',
        gameLog: [
          {
            sequence: 1,
            turnNumber: 1,
            phase: 'DOOR_RESOLUTION',
            type: 'DOOR_KICKED',
            visibility: 'PUBLIC',
            playerId: 'p1',
            card: curse,
          },
          {
            sequence: 2,
            turnNumber: 1,
            phase: 'DOOR_RESOLUTION',
            type: 'CURSE_RESOLVED',
            visibility: 'PUBLIC',
            playerId: 'p1',
            card: curse,
          },
        ],
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 2,
              turnNumber: 1,
              phase: 'TURN_START',
              type: 'COMBAT_STARTED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              priority: 'IMPORTANT',
              summaryCode: 'COMBAT_STARTED',
              requiresViewerAction: false,
            },
          ],
          routine: [],
        },
      }),
    ).nativeElement as HTMLElement;
    expect(root.querySelector('[data-stage="DOOR_REVEAL"]')?.textContent).toContain(
      'Curse: Pocket Gravity',
    );
    expect(root.textContent).toContain('Lose one item');
  });

  it('shows the five newest actions, including routine ones, in the recent-actions panel', () => {
    const root = render(
      base({
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'TURN_START' as const,
              type: 'COMBAT_STARTED' as const,
              visibility: 'PUBLIC' as const,
              playerId: 'p1',
              priority: 'IMPORTANT' as const,
              summaryCode: 'COMBAT_STARTED' as const,
              requiresViewerAction: false,
            },
          ],
          routine: Array.from({ length: 5 }, (_, index) => ({
            sequence: index + 2,
            turnNumber: 1,
            phase: 'TURN_START' as const,
            type: 'COMBAT_STARTED' as const,
            visibility: 'PUBLIC' as const,
            playerId: 'p1',
            priority: 'ROUTINE' as const,
            summaryCode: 'COMBAT_STARTED' as const,
            requiresViewerAction: false,
          })),
        },
      }),
    ).nativeElement as HTMLElement;

    const events = root.querySelectorAll('app-recent-events .event-list span');
    expect(events).toHaveLength(5);
  });

  it('uses the next distinct event when the stage already shows a played card', () => {
    const played = card({ instanceId: 'played', name: 'Visible play' });
    const root = render(
      base({
        phase: 'POST_DOOR',
        gameLog: [
          {
            sequence: 1,
            turnNumber: 1,
            phase: 'POST_DOOR',
            type: 'CARD_PLAYED',
            visibility: 'PUBLIC',
            playerId: 'p1',
            card: played,
          },
        ],
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'POST_DOOR',
              type: 'CARD_PLAYED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              card: played,
              priority: 'IMPORTANT',
              summaryCode: 'CARD_PLAYED',
              requiresViewerAction: false,
            },
            {
              sequence: 2,
              turnNumber: 1,
              phase: 'POST_DOOR',
              type: 'TURN_STARTED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              priority: 'IMPORTANT',
              summaryCode: 'TURN_STARTED',
              requiresViewerAction: false,
            },
          ],
          routine: [],
        },
      }),
    ).nativeElement as HTMLElement;

    expect(root.querySelector('app-game-stage')?.textContent).toContain('Visible play');
    expect(root.querySelector('app-recent-events')?.textContent).not.toContain('Visible play');
    expect(root.querySelector('app-recent-events')?.textContent).toContain('Ход: Ada');
  });

  it('shows authoritative enhancement and passive facts on equipped item details', () => {
    const enhancer = card({
      instanceId: 'enhancer',
      name: 'Polished Pommel',
      type: 'ATTACHMENT',
      attachment: { allowedTags: ['BLADE'], combatBonus: 2 },
    });
    const weapon = card({
      instanceId: 'weapon',
      name: 'Quiet Rapier',
      type: 'EQUIPMENT',
      equipment: {
        slot: 'HANDS',
        hands: 1,
        combatBonus: 2,
        restrictions: [],
        value: 300,
        modifier: { type: 'COMBAT_POWER', amount: 1, conditions: [] },
      },
      equipped: {
        resolvedCombatBonus: 5,
        attachments: [{ card: enhancer, combatBonus: 2 }],
      },
    });
    const self = player({ combatPower: 7, equipment: [weapon] });
    const fixture = render(base({ players: [self], self: { ...self, hand: [] } }));
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.player')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.equipment-grid .hands')?.textContent).toContain('Усилено');
    expect(root.querySelector('.equipment-grid .hands')?.textContent).toContain('Пассив');
    expect(root.textContent).toContain('сила 7');
    root.querySelector<HTMLButtonElement>('.equipment-grid .hands button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.equipment-detail')?.textContent).toContain(
      'Итоговый вклад: +5 силы',
    );
    expect(root.querySelector('.equipment-detail')?.textContent).toContain('Polished Pommel');
    expect(root.querySelector('.equipment-detail')?.textContent).toContain('Пассивный эффект');
  });

  it('shows winning/losing score difference, multi-monster focus, reward and visible Bad Stuff', () => {
    const root = render(
      base({
        combat: combat({
          monsters: [encounter('e1'), encounter('e2', 12)],
          playerPower: 10,
          monsterPower: 29,
        }),
      }),
    ).nativeElement as HTMLElement;
    expect(root.querySelector('.score')?.textContent).toContain('-19');
    expect(root.querySelectorAll('.encounter-tabs button')).toHaveLength(2);
    expect(root.querySelector('.monster')?.textContent).toContain('Непотребство');
    expect(root.querySelector('.monster')?.textContent).toContain('+2 уровня · 5 сокровищ');
    expect(root.querySelector('.score')?.textContent).toContain('НАГРАДА: +4 уровня · 10 сокровищ');
  });

  it('limits a help offer to the authoritative current Treasure reward', () => {
    const grace = player({ playerId: 'p2', name: 'Grace', combatPower: 7 });
    const fixture = render(
      base({
        players: [base().self, grace],
        combat: combat(),
        availableIntents: [
          {
            id: 'help-propose:combat-1:4',
            kind: 'PROPOSE_HELP',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            combatId: 'combat-1',
            combatRevision: 4,
            helperIds: ['p2'],
            minTreasures: 0,
            maxTreasures: 2,
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    Array.from(root.querySelectorAll<HTMLButtonElement>('app-action-dock button'))
      .find((button) => button.textContent?.includes('Просить помощь'))!
      .click();
    fixture.detectChanges();

    const increase = root.querySelectorAll<HTMLButtonElement>('.help-sheet .counter button')[1]!;
    increase.click();
    increase.click();
    fixture.detectChanges();

    expect(root.querySelector('.help-sheet .counter b')?.textContent).toContain('2 / 2');
    expect(increase.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('.help-sheet .primary')!.click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'PROPOSE_HELP',
      helperId: 'p2',
      treasureCount: 2,
      combatId: 'combat-1',
      combatRevision: 4,
    });
  });

  it('restores help agreement and reaction-required/answered states', () => {
    const grace = player({ playerId: 'p2', name: 'Grace', combatPower: 7 });
    const agreement = {
      helperId: 'p2',
      promisedTreasures: 2,
      acceptedOfferId: 'o1',
      agreedAtCombatRevision: 3,
    };
    const reaction = {
      windowId: 7,
      claimantId: 'p1',
      confirmedPlayerIds: ['p1'],
      waitingPlayerIds: ['p2'],
      expiresAtEpochMs: 10_000,
    };
    const root = render(
      base({
        viewerPlayerId: 'p2',
        players: [base().self, grace],
        self: { ...grace, hand: [] },
        combat: combat({ helpAgreement: agreement, reactionWindow: reaction }),
        availableIntents: [
          {
            id: 'reaction:7',
            kind: 'PASS_COMBAT_REACTION',
            reasonCode: 'BLOCKING_RESPONSE',
            combatId: 'combat-1',
            combatRevision: 4,
            reactionWindowId: 7,
            expiresAtEpochMs: 10_000,
          },
        ],
      }),
    ).nativeElement as HTMLElement;
    expect(root.textContent).toContain('Grace помогает · получит 2');
    expect(root.textContent).toContain('нужна ваша реакция');
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent?.trim().startsWith('Пас'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'PASS_COMBAT_REACTION',
      combatId: 'combat-1',
      combatRevision: 4,
      reactionWindowId: 7,
    });
  });

  it('keeps the monster and combat layout visible while a run-away result is resolving', () => {
    const root = render(
      base({
        combat: combat({
          runAway: {
            currentCombatantId: 'p1',
            currentEncounterId: 'e1',
            attempts: [
              {
                combatantId: 'p1',
                encounterId: 'e1',
                roll: 2,
                outcome: 'FAILED',
                badStuffApplied: true,
              },
            ],
          },
        }),
      }),
    ).nativeElement as HTMLElement;
    expect(
      root.querySelector('[data-stage="COMBAT_OPEN"] app-combat-stage .monster'),
    ).not.toBeNull();
    expect(root.querySelector('.monster')?.textContent).toContain('Archive Dragon');
  });

  it('opens a reconnect-safe blocking discard picker and confirms exact cards', () => {
    const a = card({ instanceId: 'a', name: 'A' }),
      b = card({ instanceId: 'b', name: 'B' });
    const self = player({ handCount: 2 });
    const game = base({
      players: [self],
      self: { ...self, hand: [a, b] },
      pendingDecision: {
        decisionId: 'd1',
        type: 'DISCARD_CARDS',
        playerId: 'p1',
        zone: 'HAND',
        count: 1,
        sourceCard: monster,
        selectableCardIds: ['a', 'b'],
        selectableCards: [a, b],
        expiresAtEpochMs: 10_000,
      },
      availableIntents: [
        {
          id: 'decision:d1',
          kind: 'RESOLVE_CARD_DISCARD',
          reasonCode: 'BLOCKING_RESPONSE',
          decisionId: 'd1',
          cardIds: ['a', 'b'],
          count: 1,
          expiresAtEpochMs: 10_000,
        },
      ],
    });
    const fixture = render(game);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-stage="BLOCKING_DECISION"]')).not.toBeNull();
    expect(root.querySelector('.decision-count')?.textContent).toContain('Выбрано 0 из 1');
    root.querySelector<HTMLButtonElement>('.decision-card-artwork')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.card-details')?.textContent).toContain('A useful effect');
    expect(root.querySelector('.decision-count')?.textContent).toContain('Выбрано 0 из 1');
    root.querySelector<HTMLButtonElement>('[aria-label="Закрыть описание карты"]')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.decision-card-select')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.decision-count')?.textContent).toContain('Выбрано 1 из 1');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.decision-sheet footer button'))
      .find((button) => button.textContent?.includes('Подтвердить'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'RESOLVE_CARD_DISCARD',
      decisionId: 'd1',
      cardIds: ['a'],
    });
  });

  it('renders the target-only Curse response deadline and sends the selected protection', () => {
    const curse = card({
      instanceId: 'curse-response-card',
      type: 'CURSE',
      deck: 'DOOR',
      name: 'Curse of Tests',
    });
    const defense = card({ instanceId: 'defense', name: 'Cancel Charm' });
    const self = player({ handCount: 1 });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand: [defense] },
        curseResponse: {
          responseId: 'response-1',
          playerId: 'p1',
          curseCard: curse,
          expiresAtEpochMs: Date.UTC(2026, 0, 1, 12, 0, 0),
          cancelCardIds: ['defense'],
          itemGuardCardIds: [],
          protectableItemIds: [],
        },
        availableIntents: [
          {
            id: 'curse-response:1',
            kind: 'RESPOND_TO_CURSE',
            reasonCode: 'BLOCKING_RESPONSE',
            responseId: 'response-1',
            expiresAtEpochMs: Date.UTC(2026, 0, 1, 12, 0, 0),
            responses: [{ type: 'DECLINE' }, { type: 'CANCEL', cardId: 'defense' }],
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('time')?.textContent).toContain('до');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.decision-sheet button'))
      .find((button) => button.textContent?.includes('Cancel Charm'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'RESPOND_TO_CURSE',
      responseId: 'response-1',
      response: { type: 'USE_PROTECTION', cardId: 'defense' },
    });
  });

  it('keeps the full hand in a scrollable dock, exposes full hand, and explains unavailable cards', () => {
    const hand = Array.from({ length: 7 }, (_, index) =>
      card({ instanceId: `c${index}`, name: `Card ${index}` }),
    );
    const self = player({ handCount: 7 });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand },
        unavailableCardReasons: [{ cardId: 'c0', reason: 'WAITING_FOR_TURN' }],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('app-hand-dock app-compact-game-card')).toHaveLength(7);
    expect(root.textContent?.replace(/\s+/gu, ' ').trim()).toContain('Рука 7/5');
    expect(root.textContent).toContain('Card 0');
    root.querySelector<HTMLButtonElement>('.hand-menu')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.full-hand-grid .with-details .description')).toBeNull();
    expect(root.querySelector('.full-hand-grid .with-details .facts')?.textContent).toContain('+3');
  });

  it('filters the full hand by card type and keeps combat to active-combat bonuses', () => {
    const combatBonus = card({
      instanceId: 'combat-bonus',
      name: 'Combat bonus',
      play: { timings: ['ACTIVE_COMBAT'], target: 'COMBAT_PLAYER' },
    });
    const turnBonus = card({
      instanceId: 'turn-bonus',
      name: 'Turn bonus',
      play: { timings: ['TURN'], target: 'SELF' },
    });
    const curse = card({ instanceId: 'curse', name: 'Curse', type: 'CURSE' });
    const race = card({ instanceId: 'race', name: 'Race', type: 'RACE' });
    const gamePlayer = player({ handCount: 5 });
    const fixture = render(
      base({
        players: [gamePlayer],
        self: { ...gamePlayer, hand: [combatBonus, turnBonus, curse, monster, race] },
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.hand-menu')!.click();
    fixture.detectChanges();

    const filter = (label: string): void => {
      Array.from(root.querySelectorAll<HTMLButtonElement>('.hand-filters button'))
        .find((button) => button.textContent?.includes(label))!
        .click();
      fixture.detectChanges();
    };
    const cardsText = (): string => root.querySelector('.full-hand-grid')?.textContent ?? '';

    filter('Проклятия');
    expect(cardsText()).toContain('Curse');
    expect(cardsText()).not.toContain('Race');
    filter('Расы');
    expect(cardsText()).toContain('Race');
    expect(cardsText()).not.toContain('Curse');
    filter('Усиления в бою');
    expect(cardsText()).toContain('Combat bonus');
    expect(cardsText()).not.toContain('Turn bonus');
    expect(cardsText()).not.toContain('Curse');
  });

  it('requires card details before dispatching an equip action or opening a target picker', () => {
    const equipment = card({
      instanceId: 'eq',
      type: 'EQUIPMENT',
      equipment: { slot: 'HEAD', hands: 0, combatBonus: 2, restrictions: [], value: 300 },
    });
    const curse = card({ instanceId: 'curse', type: 'CURSE', deck: 'DOOR' });
    const self = player({ handCount: 2 });
    const grace = player({ playerId: 'p2', name: 'Grace' });
    const fixture = render(
      base({
        players: [self, grace],
        self: { ...self, hand: [equipment, curse] },
        availableIntents: [
          {
            id: 'equip:eq',
            kind: 'EQUIP_ITEM',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'eq',
          },
          {
            id: 'curse:curse:p1',
            kind: 'PLAY_CARD',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'curse',
            target: { type: 'PLAYER', playerId: 'p1' },
          },
          {
            id: 'curse:curse:p2',
            kind: 'PLAY_CARD',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'curse',
            target: { type: 'PLAYER', playerId: 'p2' },
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelectorAll<HTMLButtonElement>('.card-action')[0]!.click();
    fixture.detectChanges();
    expect(client.sendGameCommand).not.toHaveBeenCalled();
    expect(root.querySelector('#details-title')?.textContent).toContain('Useful Card');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Надеть'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'EQUIP_ITEM', cardId: 'eq' });
    root.querySelectorAll<HTMLButtonElement>('.card-action')[1]!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Наложить проклятие'))!
      .click();
    fixture.detectChanges();
    expect(root.querySelector('#target-title')?.textContent).toContain('Выберите цель');
  });

  it('offers replacement for occupied equipment slots and sends ordered unequip/equip commands', () => {
    const twoHanded = card({
      instanceId: 'two-handed',
      name: 'Two-handed axe',
      type: 'EQUIPMENT',
      equipment: { slot: 'HANDS', hands: 2, combatBonus: 5, restrictions: [], value: 500 },
    });
    const left = card({
      instanceId: 'left',
      name: 'Left weapon',
      type: 'EQUIPMENT',
      equipment: { slot: 'HANDS', hands: 1, combatBonus: 1, restrictions: [], value: 100 },
    });
    const right = card({
      instanceId: 'right',
      name: 'Right weapon',
      type: 'EQUIPMENT',
      equipment: { slot: 'HANDS', hands: 1, combatBonus: 1, restrictions: [], value: 100 },
    });
    const self = player({ handCount: 1, equipment: [left, right] });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand: [twoHanded] },
        availableIntents: [
          {
            id: 'unequip:left',
            kind: 'UNEQUIP_ITEM',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'left',
          },
          {
            id: 'unequip:right',
            kind: 'UNEQUIP_ITEM',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'right',
          },
        ],
        unavailableCardReasons: [{ cardId: 'two-handed', reason: 'NOT_ENOUGH_FREE_HANDS' }],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.card-action')!.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('Переодеть · +3 силы');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Переодеть'))!
      .click();

    expect(client.sendGameCommands).toHaveBeenCalledWith([
      { type: 'UNEQUIP_ITEM', cardId: 'left' },
      { type: 'UNEQUIP_ITEM', cardId: 'right' },
      { type: 'EQUIP_ITEM', cardId: 'two-handed' },
    ]);
  });

  it('maps Scavenge to the single primary action', () => {
    const root = render(
      base({
        phase: 'POST_DOOR',
        availableIntents: [
          { id: 'scavenge:1', kind: 'SCAVENGE', reasonCode: 'PRIMARY_TURN_ACTION' },
        ],
      }),
    ).nativeElement as HTMLElement;
    const primary = root.querySelector<HTMLButtonElement>('app-action-dock button.primary')!;
    expect(primary.textContent).toContain('Подобрать');
    primary.click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'SCAVENGE' });
  });

  it('groups the full hand and sells only server-projected sellable cards', () => {
    const saleCard = card({
      instanceId: 'sell',
      name: 'Golden helmet',
      type: 'EQUIPMENT',
      goldValue: 1000,
      equipment: { slot: 'HEAD', hands: 0, combatBonus: 1, restrictions: [], value: 1000 },
    });
    const otherCard = card({ instanceId: 'other', name: 'Not for sale' });
    const self = player({ handCount: 2, equipment: [saleCard] });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand: [otherCard] },
        availableIntents: [
          {
            id: 'sell:1',
            kind: 'SELL_CARDS',
            reasonCode: 'ECONOMY',
            cardIds: ['sell'],
            minimumValue: 1000,
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    Array.from(root.querySelectorAll<HTMLButtonElement>('app-action-dock .utility'))
      .find((button) => button.textContent?.includes('Продать карты'))!
      .click();
    fixture.detectChanges();
    expect(root.textContent).toContain('0 / 1000');
    expect(root.querySelector('.sale-sheet')?.textContent).not.toContain('Not for sale');
    expect(root.querySelector('.sale-card app-card-artwork')).not.toBeNull();
    expect(root.querySelector('.sale-card.equipped .sale-card-badge')?.textContent).toContain(
      'Надето',
    );
    root.querySelector<HTMLButtonElement>('.sale-card-artwork')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.card-details-backdrop')?.textContent).toContain('Golden helmet');
    root.querySelector<HTMLButtonElement>('[aria-label="Закрыть описание карты"]')!.click();
    root.querySelector<HTMLButtonElement>('.sale-card-select')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.sale-sheet + footer button'))[0]!.click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'SELL_ITEMS', cardIds: ['sell'] });
  });

  it('shows character roles, companion status, and authoritative equipment actions', () => {
    const helmet = card({
      instanceId: 'helmet',
      name: 'Helmet',
      type: 'EQUIPMENT',
      equipment: { slot: 'HEAD', hands: 0, combatBonus: 2, restrictions: [], value: 300 },
    });
    const role = card({ instanceId: 'role', name: 'Scholar', type: 'CLASS' });
    const race = card({ instanceId: 'race', name: 'Lantern Folk', type: 'RACE' });
    const hireling = card({ instanceId: 'hireling', name: 'Intern', type: 'HIRELING' });
    const self = player({
      handCount: 1,
      equipment: [helmet],
      classCards: [role],
      classCard: role,
      raceCard: race,
      hirelingCard: hireling,
    });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand: [] },
        availableIntents: [
          {
            id: 'unequip:helmet',
            kind: 'UNEQUIP_ITEM',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'helmet',
          },
          {
            id: 'discard-role:race',
            kind: 'DISCARD_ROLE',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'race',
          },
          {
            id: 'discard-role:role',
            kind: 'DISCARD_ROLE',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'role',
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.player')!.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('Scholar');
    expect(root.textContent).toContain('Intern');
    expect(root.querySelector('.character-actions')).toBeNull();
    root.querySelector<HTMLButtonElement>('.equipment-grid .head button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('#details-title')?.textContent).toContain('Helmet');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Снять'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'UNEQUIP_ITEM', cardId: 'helmet' });
    root.querySelector<HTMLButtonElement>('.equipment-grid .race button')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Сбросить расу'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'DISCARD_ROLE', cardId: 'race' });
    root.querySelector<HTMLButtonElement>('.equipment-grid .class button')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Сбросить класс'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'DISCARD_ROLE', cardId: 'role' });
  });

  it('explains and dispatches a projected role ability with exact server-provided costs', () => {
    const role = card({
      instanceId: 'scrap-role',
      definitionId: 'scrap-knights',
      name: 'Scrap Knights',
      type: 'CLASS',
      duration: 'WHILE_ROLE_ACTIVE',
      effects: [],
      role: {
        role: 'CLASS',
        modifier: {
          type: 'COMBAT_POWER',
          amount: 2,
          conditions: [{ type: 'MONSTER_HAS_TAG', anyOf: ['CONSTRUCT'] }],
        },
        activeAbility: {
          type: 'COMBAT_BONUS',
          amount: 3,
          target: 'PLAYERS',
          cost: { type: 'DISCARD_HAND', count: 1 },
          usage: 'ONCE_PER_COMBAT',
        },
      },
    });
    const cost = card({ instanceId: 'ability-cost', name: 'Spare Map' });
    const self = player({ handCount: 1, classCard: role, classCards: [role] });
    const fixture = render(
      base({
        phase: 'DOOR_RESOLUTION',
        players: [self],
        self: { ...self, hand: [cost] },
        combat: combat(),
        availableIntents: [
          {
            id: 'role-ability:scrap-role',
            kind: 'USE_ROLE_ABILITY',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            roleCardId: 'scrap-role',
            abilityType: 'COMBAT_BONUS',
            cost: { count: 1, eligibleCardIds: ['ability-cost'] },
            target: { type: 'PLAYERS' },
            combatId: 'combat-1',
            combatRevision: 4,
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.player')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.equipment-grid .class button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.card-details')?.textContent).toContain('пока роль активна');
    expect(root.querySelector('.card-details')?.textContent).toContain('Активная способность');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Применить боевую способность'))!
      .click();
    fixture.detectChanges();
    expect(root.querySelector('#ability-cost-title')?.textContent).toContain('Сбросьте 1 карт');
    root.querySelector<HTMLButtonElement>('.option-list button')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Применить способность'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'USE_ROLE_ABILITY',
      roleCardId: 'scrap-role',
      costCardIds: ['ability-cost'],
      target: { type: 'PLAYERS' },
      combatId: 'combat-1',
      combatRevision: 4,
    });
  });

  it('makes helping players versus an exact Monster obvious for side-neutral boosts', () => {
    const neutral = card({
      instanceId: 'neutral',
      name: 'Bottled Applause',
      play: { timings: ['ACTIVE_COMBAT', 'VICTORY_REACTION'], target: 'COMBAT_SIDE' },
      effects: [{ type: 'COMBAT_SIDE_BONUS', amount: 3 }],
    });
    const self = player({ handCount: 1 });
    const fixture = render(
      base({
        phase: 'DOOR_RESOLUTION',
        players: [self],
        self: { ...self, hand: [neutral] },
        combat: combat({ monsters: [encounter('e1'), encounter('e2', 9)] }),
        availableIntents: [
          {
            id: 'neutral:players',
            kind: 'PLAY_CARD',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'neutral',
            target: { type: 'PLAYERS' },
            combatId: 'combat-1',
            combatRevision: 4,
          },
          ...['e1', 'e2'].map((encounterId) => ({
            id: `neutral:${encounterId}`,
            kind: 'PLAY_CARD' as const,
            reasonCode: 'OPTIONAL_CARD_PLAY' as const,
            cardId: 'neutral',
            target: { type: 'MONSTER' as const, encounterId },
            combatId: 'combat-1',
            combatRevision: 4,
          })),
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.card-action')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.card-details')?.textContent).toContain(
      'сторону игроков или точного монстра',
    );
    const actions = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'),
    );
    expect(actions.some((button) => button.textContent?.includes('Сыграть за игроков'))).toBe(true);
    actions.find((button) => button.textContent?.includes('Помочь монстру'))!.click();
    fixture.detectChanges();
    expect(root.querySelector('#target-title')?.textContent).toContain('Помочь какому монстру');
    expect(root.querySelectorAll('.option-list button')).toHaveLength(2);
  });

  it('makes optional-set cards actionable and displays their public slots', () => {
    const weapon = card({
      instanceId: 'weapon',
      name: 'Rapier',
      type: 'EQUIPMENT',
      equipment: { slot: 'HANDS', hands: 1, combatBonus: 2, restrictions: [], value: 300 },
    });
    const companion = card({
      instanceId: 'companion',
      name: 'Scout',
      type: 'HIRELING',
      companion: { combatBonus: 1 },
    });
    const permission = card({
      instanceId: 'permission',
      name: 'Double Major',
      type: 'ROLE_PERMISSION',
    });
    const attachment = card({ instanceId: 'attachment', name: 'Pommel', type: 'ATTACHMENT' });
    const mount = card({
      instanceId: 'mount',
      name: 'Pony',
      type: 'MOUNT',
      companion: { combatBonus: 2 },
    });
    const activePermission = card({
      instanceId: 'active-permission',
      name: 'Mixed Heritage',
      type: 'ROLE_PERMISSION',
    });
    const self = player({
      handCount: 3,
      equipment: [weapon],
      hirelingCard: companion,
      mountCard: mount,
      rolePermissionCards: [activePermission],
    });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand: [companion, permission, attachment] },
        availableIntents: [
          {
            id: 'companion:companion',
            kind: 'PLAY_CARD',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'companion',
            target: { type: 'SELF' },
          },
          {
            id: 'permission:permission',
            kind: 'PLAY_ROLE_PERMISSION',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'permission',
          },
          {
            id: 'attachment:attachment:weapon',
            kind: 'PLAY_CARD',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: 'attachment',
            target: { type: 'EQUIPMENT', cardId: 'weapon' },
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.player')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.equipment-grid .hireling')?.textContent).toContain('Scout');
    expect(root.querySelector('.equipment-grid .hireling')?.textContent).toContain('+1');
    expect(root.querySelector('.equipment-grid .mount')?.textContent).toContain('Pony');
    expect(root.querySelector('.equipment-grid .mount')?.textContent).toContain('+2');
    expect(root.querySelector('.equipment-grid .permissions')?.textContent).toContain(
      'Mixed Heritage',
    );
    root.querySelector<HTMLButtonElement>('[aria-label="Закрыть персонажа"]')!.click();
    root.querySelectorAll<HTMLButtonElement>('.card-action')[0]!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Призвать спутника'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'PLAY_CARD',
      cardId: 'companion',
      target: { type: 'SELF' },
    });
    root.querySelectorAll<HTMLButtonElement>('.card-action')[1]!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Разрешить вторую роль'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'PLAY_ROLE_PERMISSION',
      cardId: 'permission',
    });
    root.querySelectorAll<HTMLButtonElement>('.card-action')[2]!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.card-detail-actions button'))
      .find((button) => button.textContent?.includes('Улучшить снаряжение'))!
      .click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'PLAY_CARD',
      cardId: 'attachment',
      target: { type: 'EQUIPMENT', cardId: 'weapon' },
    });
  });

  it('filters authoritative history and completes the exact charity selection', () => {
    const a = card({ instanceId: 'a', name: 'A' });
    const b = card({ instanceId: 'b', name: 'B' });
    const self = player({ handCount: 7 });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand: [a, b] },
        gameLog: [
          {
            sequence: 1,
            turnNumber: 1,
            phase: 'TURN_START',
            type: 'TURN_STARTED',
            visibility: 'PUBLIC',
            playerId: 'p1',
          },
          {
            sequence: 2,
            turnNumber: 1,
            phase: 'TURN_START',
            type: 'COMBAT_STARTED',
            visibility: 'PUBLIC',
            playerId: 'p1',
          },
        ],
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 2,
              turnNumber: 1,
              phase: 'TURN_START',
              type: 'COMBAT_STARTED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              priority: 'IMPORTANT',
              summaryCode: 'COMBAT_STARTED',
              requiresViewerAction: false,
            },
          ],
          routine: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'TURN_START',
              type: 'TURN_STARTED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              priority: 'ROUTINE',
              summaryCode: 'TURN_STARTED',
              requiresViewerAction: false,
            },
          ],
        },
        availableIntents: [
          {
            id: 'charity:1',
            kind: 'GIVE_CHARITY',
            reasonCode: 'HAND_LIMIT',
            cardIds: ['a', 'b'],
            count: 1,
            recipientIds: [],
            randomDefault: true,
          },
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[aria-label="Открыть историю игры"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('.history-turn button')?.textContent).toContain(
      'вступил в бой',
    );
    Array.from(root.querySelectorAll<HTMLButtonElement>('.history-filters button'))
      .find((button) => button.textContent?.trim() === 'Бой')!
      .click();
    fixture.detectChanges();
    expect(root.textContent).toContain('вступил в бой');
    root.querySelector<HTMLButtonElement>('[aria-label="Закрыть историю"]')!.click();
    Array.from(root.querySelectorAll<HTMLButtonElement>('app-action-dock .utility'))
      .find((button) => button.textContent?.includes('Раздать милостыню'))!
      .click();
    fixture.detectChanges();
    expect(root.querySelector('.charity-card app-card-artwork')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.charity-card .sale-card-artwork')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.card-details-backdrop')?.textContent).toContain('A');
    root.querySelector<HTMLButtonElement>('[aria-label="Закрыть описание карты"]')!.click();
    root.querySelector<HTMLButtonElement>('.charity-card .sale-card-select')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.sale-sheet + footer button'))[0]!.click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'GIVE_CHARITY',
      cardIds: ['a'],
      recipientId: null,
    });
  });
});
