import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GameCardView, GamePlayerView, GameView } from '@munchkin-lan/contracts';
import { GameShellComponent } from './game-shell.component';
import { LobbyClient, type ConnectionState } from './lobby-client';

class MockLobbyClient {
  readonly connection = signal<ConnectionState>('CONNECTED').asReadonly();
  readonly sendGameCommand = vi.fn();
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

  it('shows active/helper run-away matrix and applied Bad Stuff result', () => {
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
    expect(root.querySelector('[data-stage="RUN_AWAY_SEQUENCE"]')?.textContent).toContain('d6 2');
    expect(root.textContent).toContain('неудача');
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
    root.querySelector<HTMLButtonElement>('.picker-grid button')!.click();
    fixture.detectChanges();
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
    const root = render(
      base({
        players: [self],
        self: { ...self, hand },
        unavailableCardReasons: [{ cardId: 'c0', reason: 'WAITING_FOR_TURN' }],
      }),
    ).nativeElement as HTMLElement;
    expect(root.querySelectorAll('app-hand-dock app-compact-game-card')).toHaveLength(7);
    expect(root.textContent?.replace(/\s+/gu, ' ').trim()).toContain('Рука 7/5 · отдать 2');
    expect(root.textContent).toContain('Card 0');
  });

  it('dispatches a direct zero-target card action and opens a multiple-target picker', () => {
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
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'EQUIP_ITEM', cardId: 'eq' });
    root.querySelectorAll<HTMLButtonElement>('.card-action')[1]!.click();
    fixture.detectChanges();
    expect(root.querySelector('#target-title')?.textContent).toContain('Выберите цель');
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
    const saleCard = card({ instanceId: 'sell', name: 'Golden helmet', goldValue: 1000 });
    const otherCard = card({ instanceId: 'other', name: 'Not for sale' });
    const self = player({ handCount: 2 });
    const fixture = render(
      base({
        players: [self],
        self: { ...self, hand: [saleCard, otherCard] },
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
    root.querySelector<HTMLButtonElement>('[aria-label="Открыть меню"]')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Продать карты'))!
      .click();
    fixture.detectChanges();
    expect(root.textContent).toContain('0 / 1000');
    expect(root.querySelector('.sale-sheet')?.textContent).not.toContain('Not for sale');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.sale-sheet button'))[0]!.click();
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
    const hireling = card({ instanceId: 'hireling', name: 'Intern', type: 'HIRELING' });
    const self = player({
      handCount: 1,
      equipment: [helmet],
      classCards: [role],
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
        ],
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.player')!.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('Scholar');
    expect(root.textContent).toContain('Intern');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.character-actions button'))[0]!.click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({ type: 'UNEQUIP_ITEM', cardId: 'helmet' });
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
          routine: [],
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
    Array.from(root.querySelectorAll<HTMLButtonElement>('.history-filters button'))
      .find((button) => button.textContent?.trim() === 'Бой')!
      .click();
    fixture.detectChanges();
    expect(root.textContent).toContain('вступил в бой');
    root.querySelector<HTMLButtonElement>('[aria-label="Закрыть историю"]')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Открыть меню"]')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Раздать милостыню'))!
      .click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.sale-sheet button')!.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLButtonElement>('.sale-sheet + footer button'))[0]!.click();
    expect(client.sendGameCommand).toHaveBeenCalledWith({
      type: 'GIVE_CHARITY',
      cardIds: ['a'],
      recipientId: null,
    });
  });
});
