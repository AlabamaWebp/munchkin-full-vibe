import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { GameCardView, GameView } from '@munchkin-lan/contracts';
import { CompactGameCardComponent } from './compact-game-card.component';
import { unavailableReason } from './game-ui.model';

@Component({
  selector: 'app-hand-dock',
  imports: [CompactGameCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hand-dock" aria-label="Ваша рука">
      <div class="cards">
        @for (card of preview(); track card.instanceId) {
          <app-compact-game-card
            [card]="card"
            [playable]="playableIds().includes(card.instanceId)"
            [reason]="reason(card)"
            (activated)="cardActivated.emit($event)"
            (detailsOpened)="cardDetails.emit($event)"
          />
        }
      </div>
      @if (game().self.hand.length > 0) {
        <button type="button" class="full-hand" (click)="fullHandOpened.emit()">
          Рука {{ game().self.hand.length }}/5
          @if (game().self.hand.length > 5) {
            · отдать {{ game().self.hand.length - 5 }}
          } @else {
            · открыть
          }
        </button>
      }
      @if (game().self.hand.length === 0) {
        <span class="empty">Рука пуста</span>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
    }
    .hand-dock {
      position: relative;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .cards {
      display: grid;
      height: 100%;
      min-width: 0;
      grid-auto-flow: column;
      grid-auto-columns: clamp(7rem, 32vw, 8rem);
      gap: 0.45rem;
      overflow-x: auto;
      padding: 0 0.25rem 0.15rem 0;
      scroll-padding-inline: 0.25rem;
      scroll-snap-type: x mandatory;
      scrollbar-width: thin;
    }
    app-compact-game-card {
      min-width: 0;
      min-height: 0;
      scroll-snap-align: start;
    }
    .full-hand {
      position: absolute;
      right: 0.25rem;
      bottom: 0.25rem;
      min-height: 2.75rem;
      padding: 0.35rem 0.65rem;
      border: 1px solid #e0b85f;
      border-radius: 999px;
      color: #182019;
      background: #f0cb79;
      font-size: 0.65rem;
      font-weight: 900;
      box-shadow: 0 0.25rem 0.75rem rgba(0, 0, 0, 0.35);
    }
    .empty {
      display: grid;
      height: 100%;
      place-items: center;
      color: #8e9e93;
      font-size: 0.7rem;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
    @media (min-width: 48rem) {
      .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-auto-flow: row;
        grid-auto-columns: auto;
        grid-auto-rows: minmax(9rem, 1fr);
        gap: 0.45rem;
        overflow-x: hidden;
        overflow-y: auto;
        padding-right: 0.25rem;
      }
    }
  `,
})
export class HandDockComponent {
  readonly game = input.required<GameView>();
  readonly playableIds = input.required<readonly string[]>();
  readonly cardActivated = output<GameCardView>();
  readonly cardDetails = output<GameCardView>();
  readonly fullHandOpened = output<void>();
  protected readonly preview = computed(() =>
    [...this.game().self.hand].sort(
      (a, b) =>
        Number(this.playableIds().includes(b.instanceId)) -
        Number(this.playableIds().includes(a.instanceId)),
    ),
  );
  protected reason(card: GameCardView): string {
    return unavailableReason(this.game(), card.instanceId);
  }
}
