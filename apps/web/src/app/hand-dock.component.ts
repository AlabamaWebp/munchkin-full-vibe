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
      <div class="hand-header">
        <button type="button" class="character-summary" (click)="characterOpened.emit()">
          <span class="flex gap10">
            <span
              class="summary-initial"
              [class]="
                'summary-initial player-color-' + (game().self.color?.toLowerCase() ?? 'default')
              "
              >{{ game().self.name.charAt(0) }}</span
            >
            <span
              ><small>ВАШ ГЕРОЙ · УР. {{ game().self.level }}</small
              ><strong>{{ game().self.name }}</strong
              ><small class="summary-sex">Пол: {{ sexLabel(game().self.sex) }}</small></span
            >
          </span>
          <span class="summary-power"
            ><small>СИЛА</small
            ><b>{{ game().combat?.playerPower ?? game().self.combatPower }}</b></span
          >
        </button>
        @if (game().self.hand.length > 0) {
          <button
            type="button"
            class="hand-menu"
            aria-label="Открыть меню руки"
            (click)="fullHandOpened.emit()"
          >
            Рука {{ game().self.hand.length }}/{{ game().config?.maxHandSize ?? 5 }}
          </button>
        }
      </div>
      <div class="cards">
        @for (card of preview(); track card.instanceId) {
          <app-compact-game-card
            [card]="card"
            [cardName]="cardName()"
            [playable]="playableIds().includes(card.instanceId)"
            [reason]="reason(card)"
            (activated)="cardActivated.emit($event)"
          />
        }
      </div>
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
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .hand-header {
      display: grid;
      min-width: 0;
      grid-row: 2;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: stretch;
      gap: 0.35rem;
    }
    .character-summary {
      display: flex;
      justify-content: space-between;
      min-width: 0;
      min-height: 3.5rem;
      padding: 0.25rem 0.4rem;
      align-items: stretch;
      gap: 0.25rem;
      border: 1px solid #b17a38;
      border-radius: 0.95rem;
      color: #f3e4c7;
      background: linear-gradient(
        105deg,
        rgba(17, 13, 9, 0.97),
        rgba(58, 37, 20, 0.94) 55%,
        rgba(14, 11, 8, 0.97)
      );
      box-shadow:
        inset 0 1px rgba(255, 220, 149, 0.18),
        0 0.35rem 0.9rem rgba(0, 0, 0, 0.48);
      text-align: left;
    }
    .summary-initial {
      display: grid;
      width: 2.75rem;
      height: 2.75rem;
      place-items: center;
      border: 2px solid #d2a253;
      border-radius: 50%;
      color: #f7dfae;
      background: radial-gradient(circle at 35% 30%, #724923, #17130e 69%);
      box-shadow:
        0 0 0 2px #31200f,
        0 0.2rem 0.5rem #000;
      font:
        900 1.2rem Georgia,
        serif;
    }
    .player-color-pink {
      --player-color: #ee78ab;
    }
    .player-color-blue {
      --player-color: #4d9de0;
    }
    .player-color-red {
      --player-color: #e15151;
    }
    .player-color-yellow {
      --player-color: #f0c84b;
    }
    .player-color-green {
      --player-color: #59ad70;
    }
    .player-color-black {
      --player-color: #101010;
    }
    .summary-initial.player-color-pink,
    .summary-initial.player-color-blue,
    .summary-initial.player-color-red,
    .summary-initial.player-color-yellow,
    .summary-initial.player-color-green,
    .summary-initial.player-color-black {
      border-color: var(--player-color);
    }
    .character-summary small {
      display: block;
      color: #c8b99d;
      font-size: 0.7rem;
      letter-spacing: 0.04em;
    }
    .character-summary strong {
      display: block;
      overflow: hidden;
      font:
        800 0.9rem Georgia,
        serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .character-summary .summary-sex {
      color: #e0c792;
      font-size: 0.64rem;
    }
    .summary-power {
      text-align: center;
    }
    .summary-power b {
      color: #f7e4b8;
      font:
        900 1.45rem Georgia,
        serif;
    }
    .cards {
      display: none;
      grid-row: 1;
      height: 100%;
      min-width: 0;
      grid-auto-flow: column;
      grid-auto-columns: clamp(5.25rem, 24vw, 6.25rem);
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
    .hand-menu {
      align-self: center;
      min-height: 2.75rem;
      padding: 0.35rem 0.65rem;
      border: 1px solid #b17a38;
      border-radius: 999px;
      color: #f3e4c7;
      background: linear-gradient(
        105deg,
        rgba(17, 13, 9, 0.97),
        rgba(58, 37, 20, 0.94) 55%,
        rgba(14, 11, 8, 0.97)
      );
      font-size: 0.65rem;
      font-weight: 900;
      box-shadow:
        inset 0 1px rgba(255, 220, 149, 0.18),
        0 0.35rem 0.9rem rgba(0, 0, 0, 0.48);
    }
    .empty {
      display: grid;
      height: 100%;
      grid-row: 1;
      place-items: center;
      color: #8e9e93;
      font-size: 0.7rem;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
    @media (max-height: 42rem) {
      .character-summary {
        min-height: 3.25rem;
        padding: 0.25rem 0.35rem;
        grid-template-columns: 2.5rem minmax(0, 1fr) 2.8rem 2.8rem;
        gap: 0.2rem;
      }
      .summary-initial {
        width: 2.35rem;
        height: 2.35rem;
        font-size: 1.15rem;
      }
      .character-summary small {
        font-size: 0.62rem;
      }
      .summary-power b {
        font-size: 1.2rem;
      }
    }
    @media (min-width: 48rem) {
      .cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
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
  readonly cardName = input.required<(card: GameCardView) => string>();
  readonly cardActivated = output<GameCardView>();
  readonly characterOpened = output<void>();
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
  protected sexLabel(sex: GameView['self']['sex']): string {
    return sex === 'MALE' ? 'мужской' : sex === 'FEMALE' ? 'женский' : 'не выбран';
  }
}
