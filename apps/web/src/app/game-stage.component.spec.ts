import { TestBed } from '@angular/core/testing';
import type { GameCardView, GamePlayerView, GameView } from '@munchkin-lan/contracts';
import { GameStageComponent } from './game-stage.component';
import { LocalizationService } from './localization';

const player: GamePlayerView = {
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
};

const card = (instanceId: string, name: string): GameCardView => ({
  instanceId,
  definitionId: instanceId,
  artKey: `test.${instanceId}`,
  name,
  description: `${name} description.`,
  type: 'EQUIPMENT',
  deck: 'TREASURE',
  effects: [],
});

const game = (cards: readonly GameCardView[]): GameView => ({
  gameId: 'G',
  viewerPlayerId: 'p1',
  status: 'IN_PROGRESS',
  phase: 'POST_DOOR',
  activePlayerId: 'p1',
  turnNumber: 1,
  winnerId: null,
  players: [player],
  self: { ...player, hand: [] },
  combat: null,
  lastRunAwayResult: null,
  pendingDecision: null,
  curseResponse: null,
  gameLog: [
    {
      sequence: 1,
      turnNumber: 1,
      phase: 'POST_DOOR',
      type: 'CARDS_SOLD',
      visibility: 'PUBLIC',
      playerId: 'p1',
      cards,
      value: 1000,
      amount: 1,
    },
  ],
  presentation: { blocking: null, important: [], routine: [] },
  expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'p1' },
  deckCounts: { door: 10, treasure: 10 },
  availableIntents: [],
  unavailableCardReasons: [],
});

describe('GameStageComponent', () => {
  it('renders the latest multi-card action and lets the player select its card', async () => {
    await TestBed.configureTestingModule({ imports: [GameStageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GameStageComponent);
    const first = card('first', 'Brass Greaves');
    const second = card('second', 'Silver Cloak');
    const currentGame = game([first, second]);
    fixture.componentRef.setInput('game', currentGame);
    fixture.componentRef.setInput('stage', 'POST_DOOR_CHOICE');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ada продал карты');
    expect(fixture.nativeElement.querySelector('.event-card h3')?.textContent).toContain(
      'Brass Greaves',
    );

    const choices = fixture.nativeElement.querySelectorAll(
      '.card-tabs button',
    ) as NodeListOf<HTMLButtonElement>;
    choices[1]?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.event-card h3')?.textContent).toContain(
      'Silver Cloak',
    );

    fixture.componentRef.setInput('game', { ...currentGame, phase: 'TURN_START' });
    fixture.componentRef.setInput('stage', 'TURN_READY');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-event')).toBeNull();
  });

  it('renders a question-mark card instead of a privately received card identity', async () => {
    await TestBed.configureTestingModule({ imports: [GameStageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GameStageComponent);
    const currentGame: GameView = {
      ...game([]),
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'POST_DOOR',
          type: 'CARD_DRAWN',
          visibility: 'PUBLIC',
          playerId: 'p1',
          hiddenCard: { deck: 'TREASURE', count: 1 },
        },
      ],
    };
    fixture.componentRef.setInput('game', currentGame);
    fixture.componentRef.setInput('stage', 'POST_DOOR_CHOICE');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hidden-card-art')?.textContent).toContain('?');
    expect(fixture.nativeElement.textContent).toContain('Карта из колоды сокровищ получена закрытой');
    expect(fixture.nativeElement.querySelector('.event-card-art')).toBeNull();
  });

  it('uses the Russian catalog text for visible stage cards', async () => {
    await TestBed.configureTestingModule({ imports: [GameStageComponent] }).compileComponents();
    TestBed.inject(LocalizationService).setLocale('ru');
    const fixture = TestBed.createComponent(GameStageComponent);
    const localizedCard = {
      ...card('dust-bunny-brigade-1', 'Dust Bunny Brigade'),
      definitionId: 'dust-bunny-brigade',
      description: 'A surprisingly organized threat from beneath the sofa.',
    };
    fixture.componentRef.setInput('game', game([localizedCard]));
    fixture.componentRef.setInput('stage', 'POST_DOOR_CHOICE');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.event-card h3')?.textContent).toContain(
      'Бригада пылевых кроликов',
    );
  });
});
