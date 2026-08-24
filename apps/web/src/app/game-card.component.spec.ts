import { TestBed } from '@angular/core/testing';
import type { GameCardView } from '@munchkin-lan/contracts';
import { GameCardComponent } from './game-card.component';

const monster: GameCardView = {
  instanceId: 'monster-1',
  definitionId: 'long-monster',
  artKey: 'door.monster.long-monster',
  name: 'Monster With An Exceptionally Long Name That Must Wrap',
  description: 'A test Monster.',
  duration: 'ENCOUNTER_PASSIVE',
  type: 'MONSTER',
  deck: 'DOOR',
  effects: [],
  monster: {
    level: 8,
    levelRewards: 2,
    treasureRewards: 3,
    badStuff: [{ type: 'DISCARD_CHOSEN_CARDS', zone: 'HAND', count: 2 }],
  },
};

describe('GameCardComponent', () => {
  it('renders the stable illustration and every supplied characteristic without truncating markup', async () => {
    await TestBed.configureTestingModule({ imports: [GameCardComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GameCardComponent);
    fixture.componentRef.setInput('card', monster);
    fixture.componentRef.setInput('name', monster.name);
    fixture.componentRef.setInput('kicker', 'Monster');
    fixture.componentRef.setInput('ariaLabel', monster.name);
    fixture.componentRef.setInput('facts', [
      'Level 8 → 13',
      'Level reward: 2',
      'Treasures: 3 → 5',
      'Bad stuff: choose two cards with a deliberately long explanation',
    ]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-art-key="door.monster.long-monster"]')).not.toBeNull();
    expect(compiled.querySelectorAll('.facts li')).toHaveLength(4);
    expect(compiled.textContent).toContain('Level 8 → 13');
    expect(compiled.textContent).toContain('Bad stuff: choose two cards');
    expect(compiled.querySelector('strong')?.textContent).toBe(monster.name);
  });
});
