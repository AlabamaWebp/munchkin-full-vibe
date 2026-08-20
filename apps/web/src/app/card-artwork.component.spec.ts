import { TestBed } from '@angular/core/testing';
import { CardArtworkComponent } from './card-artwork.component';

describe('CardArtworkComponent', () => {
  it('keeps one artKey deterministic and gives different definitions different palettes', async () => {
    await TestBed.configureTestingModule({ imports: [CardArtworkComponent] }).compileComponents();
    const first = TestBed.createComponent(CardArtworkComponent);
    first.componentRef.setInput('artKey', 'door.monster.archive-dragon');
    first.componentRef.setInput('label', 'Archive Dragon');
    first.detectChanges();

    const repeat = TestBed.createComponent(CardArtworkComponent);
    repeat.componentRef.setInput('artKey', 'door.monster.archive-dragon');
    repeat.componentRef.setInput('label', 'Archive Dragon');
    repeat.detectChanges();

    const other = TestBed.createComponent(CardArtworkComponent);
    other.componentRef.setInput('artKey', 'treasure.equipment.portable-drawbridge');
    other.componentRef.setInput('label', 'Portable Drawbridge');
    other.detectChanges();

    expect(first.componentInstance.palette()).toEqual(repeat.componentInstance.palette());
    expect(first.componentInstance.palette()).not.toEqual(other.componentInstance.palette());
    expect(first.componentInstance.glyph()).toBe(repeat.componentInstance.glyph());
  });
});
