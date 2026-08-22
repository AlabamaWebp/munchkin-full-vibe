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
      <div class="cards" [style.--card-count]="preview().length">
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
      @if (game().self.hand.length > 5) {
        <button type="button" class="full-hand" (click)="fullHandOpened.emit()">
          Рука {{ game().self.hand.length }}/5 · отдать {{ game().self.hand.length - 5 }}
        </button>
        <span class="limit-warning" role="status"
          >Перед концом хода нужно избавиться от лишних карт</span
        >
      } @else if (game().self.hand.length > 0) {
        <span class="hand-count">Рука {{ game().self.hand.length }}/5</span>
      } @else if (game().self.hand.length === 0) {
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
      grid-template-columns: repeat(var(--card-count), minmax(0, 1fr));
      gap: 0.22rem;
      overflow: hidden;
    }
    app-compact-game-card {
      min-width: 0;
      min-height: 0;
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
    .hand-count,
    .limit-warning {
      position: absolute;
      left: 0.25rem;
      bottom: 0.25rem;
      padding: 0.25rem 0.45rem;
      border-radius: 999px;
      color: #dce7df;
      background: rgba(13, 23, 18, 0.88);
      font-size: 0.6rem;
      font-weight: 800;
    }
    .limit-warning {
      right: 0.25rem;
      bottom: 3.1rem;
      left: auto;
      max-width: 13rem;
      color: #ffe0bd;
      background: #6b3927;
      text-align: right;
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
  `,
})
export class HandDockComponent {
  readonly game = input.required<GameView>();
  readonly playableIds = input.required<readonly string[]>();
  readonly cardActivated = output<GameCardView>();
  readonly cardDetails = output<GameCardView>();
  readonly fullHandOpened = output<void>();
  protected readonly preview = computed(() =>
    [...this.game().self.hand]
      .sort(
        (a, b) =>
          Number(this.playableIds().includes(b.instanceId)) -
          Number(this.playableIds().includes(a.instanceId)),
      )
      .slice(0, 5),
  );
  protected reason(card: GameCardView): string {
    return unavailableReason(this.game(), card.instanceId);
  }
}
