import { TestBed } from '@angular/core/testing';
import type { GameCardView } from '@munchkin-lan/contracts';
import { createDevelopmentCardSet } from '@munchkin-lan/game-engine';
import { LocalizationService, RUSSIAN_CARDS } from './localization';

const card: GameCardView = {
  instanceId: 'dust-bunny-brigade-1',
  definitionId: 'dust-bunny-brigade',
  artKey: 'test.dust-bunny-brigade',
  name: 'Dust Bunny Brigade',
  description: 'A surprisingly organized threat from beneath the sofa.',
  duration: 'ENCOUNTER_PASSIVE',
  type: 'MONSTER',
  deck: 'DOOR',
  effects: [],
  monster: { level: 1, levelRewards: 1, treasureRewards: 1, badStuff: [] },
};

describe('LocalizationService', () => {
  it('contains Russian names and descriptions for every catalog definition', () => {
    for (const definition of createDevelopmentCardSet().definitions) {
      expect(RUSSIAN_CARDS[definition.id]?.name).toBeTruthy();
      expect(RUSSIAN_CARDS[definition.id]?.description).toBeTruthy();
    }
  });
  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('uses Russian by default and localizes cards and errors', () => {
    const service = TestBed.inject(LocalizationService);

    expect(service.locale()).toBe('ru');
    expect(service.cardName(card)).toBe('Бригада пылевых кроликов');
    expect(service.errorMessage({ code: 'ROOM_NOT_FOUND', message: 'server text' })).toBe(
      'Комнаты с таким кодом не существует.',
    );
    expect(service.cardsCount(1)).toBe('1 карта');
    expect(service.cardsCount(4)).toBe('4 карты');
    expect(service.cardsCount(11)).toBe('11 карт');
  });

  it('switches to English and keeps canonical card text', () => {
    const service = TestBed.inject(LocalizationService);

    service.setLocale('en');

    expect(service.cardName(card)).toBe('Dust Bunny Brigade');
    expect(service.cardDescription(card)).toBe(card.description);
    expect(service.cardsCount(1)).toBe('1 card');
    expect(service.cardsCount(2)).toBe('2 cards');
  });
});
