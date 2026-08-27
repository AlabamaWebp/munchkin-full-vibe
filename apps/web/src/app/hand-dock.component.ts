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
          <span class="summary-identity">
            <span
              class="summary-initial"
              [class]="
                'summary-initial player-color-' + (game().self.color?.toLowerCase() ?? 'default')
              "
              >{{ game().self.name.charAt(0) }}</span
            >
            <span class="summary-copy"
              ><strong>{{ game().self.name }}</strong
              ><small>Уровень {{ game().self.level }}</small></span
            >
          </span>
          @if (summaryFacts().length > 0) {
            <span class="summary-loadout" aria-label="Снаряжение и роли">
              @for (fact of summaryFacts(); track fact) {
                <small class="summary-fact">{{ fact }}</small>
              }
            </span>
          }
          <span class="summary-power"
            ><small>Сила</small
            ><b>{{ game().combat?.playerPower ?? game().self.combatPower }}</b></span
          >
        </button>
        <button
          type="button"
          class="hand-menu"
          aria-label="Открыть полную руку"
          (click)="fullHandOpened.emit()"
        >
          Рука {{ game().self.hand.length }}/{{ game().config?.maxHandSize ?? 5 }}
        </button>
      </div>
      <div class="cards">
        @for (card of preview(); track card.instanceId) {
          <app-compact-game-card
            [card]="card"
            [cardName]="cardName()"
            [playable]="playableIds().includes(card.instanceId)"
            [upgrade]="card.permanentCombatUpgrade === true"
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
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .hand-header {
      display: grid;
      min-width: 0;
      min-height: 2.75rem;
      grid-row: 1;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      overflow: hidden;
      border-top: 1px solid var(--surface-line-soft);
      border-bottom: 1px solid var(--surface-line-soft);
      border-radius: var(--radius-compact);
      background: linear-gradient(90deg, rgba(20, 15, 10, 0.88), rgba(49, 32, 18, 0.78));
    }
    .character-summary {
      display: flex;
      justify-content: space-between;
      min-width: 0;
      min-height: 2.75rem;
      padding: 0.18rem 0.4rem;
      align-items: stretch;
      gap: 0.25rem;
      border: 0;
      border-radius: 0;
      color: #f3e4c7;
      background: transparent;
      box-shadow: none;
      text-align: left;
    }
    .summary-identity {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 0.4rem;
    }
    .summary-initial {
      display: grid;
      width: 2.1rem;
      height: 2.1rem;
      place-items: center;
      border: 2px solid #d2a253;
      border-radius: 50%;
      color: #f7dfae;
      background: radial-gradient(circle at 35% 30%, #724923, #17130e 69%);
      box-shadow: 0 0.15rem 0.35rem rgba(0, 0, 0, 0.5);
      font:
        900 0.95rem Georgia,
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
    .summary-copy {
      display: grid;
      min-width: 0;
      gap: 0.08rem;
    }
    .character-summary small {
      display: block;
      color: #c8b99d;
      font-family: var(--ui-sans);
      font-size: 0.68rem;
      letter-spacing: 0.04em;
    }
    .character-summary strong {
      display: block;
      overflow: hidden;
      font: 750 0.82rem/1.05 var(--ui-sans);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .summary-power {
      display: grid;
      min-width: 2.6rem;
      align-content: center;
      gap: 0.05rem;
      text-align: center;
    }
    .summary-loadout {
      display: grid;
      min-width: 0;
      flex: 1;
      align-content: center;
      gap: 0.08rem;
    }
    .summary-fact {
      display: block;
      max-width: 100%;
      overflow: hidden;
      color: #e0c988 !important;
      font-size: 0.62rem !important;
      letter-spacing: 0 !important;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .summary-power small {
      font-size: 0.62rem;
    }
    .summary-power b {
      color: #f7e4b8;
      font:
        900 1.08rem Georgia,
        serif;
    }
    .cards {
      display: flex;
      grid-row: 2;
      height: 100%;
      min-width: 0;
      min-height: 0;
      align-items: stretch;
      gap: 0.35rem;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.18rem 0.15rem 0;
      scroll-padding-inline: 0.25rem;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .cards::-webkit-scrollbar {
      display: none;
    }
    app-compact-game-card {
      width: auto;
      flex: 0 0 auto;
      min-width: 0;
      min-height: 0;
      height: 100%;
      aspect-ratio: 3 / 4;
      scroll-snap-align: start;
    }
    .hand-menu {
      align-self: center;
      min-height: 2.75rem;
      padding: 0.3rem 0.6rem;
      border: 0;
      border-left: 1px solid var(--surface-line-soft);
      border-radius: 0;
      color: #f3e4c7;
      background: rgba(37, 25, 15, 0.55);
      font-family: var(--ui-sans);
      font-size: 0.78rem;
      font-weight: 900;
      box-shadow: none;
    }
    .empty {
      display: grid;
      height: 100%;
      grid-row: 2;
      place-items: center;
      color: #8e9e93;
      font-size: 0.75rem;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
    @media (max-height: 42rem) {
      .hand-dock {
        grid-template-rows: auto minmax(0, 1fr);
      }
      .hand-header {
        align-self: stretch;
      }
      .character-summary {
        min-height: 2.75rem;
        padding: 0.18rem 0.35rem;
        gap: 0.2rem;
      }
      .summary-initial {
        width: 2rem;
        height: 2rem;
        font-size: 0.9rem;
      }
      .character-summary small {
        font-size: 0.64rem;
      }
      .summary-power b {
        font-size: 1.05rem;
      }
    }
    @media (min-width: 48rem) {
      .cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-auto-flow: row;
        grid-auto-columns: auto;
        grid-auto-rows: auto;
        align-content: start;
        gap: 0.45rem;
        overflow-x: hidden;
        overflow-y: auto;
        padding-right: 0.25rem;
      }
      app-compact-game-card {
        width: 100%;
        height: auto;
      }
    }
    @media (max-width: 26rem) {
      .summary-loadout {
        display: none;
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
  protected readonly summaryFacts = computed(() => {
    const self = this.game().self;
    const classCards = self.classCards ?? (self.classCard === null ? [] : [self.classCard]);
    const raceCards = self.raceCards ?? (self.raceCard === null ? [] : [self.raceCard]);
    const companionCards = self.hirelingCards ?? (self.hirelingCard ? [self.hirelingCard] : []);
    const mountCards = self.mountCards ?? (self.mountCard ? [self.mountCard] : []);
    const candidates = [
      ...classCards.map((card) => `Класс · ${this.cardName()(card)}`),
      ...raceCards.map((card) => `Раса · ${this.cardName()(card)}`),
      ...companionCards.map((card) => `Спутник · ${this.cardName()(card)}`),
      ...mountCards.map((card) => `Ездовой · ${this.cardName()(card)}`),
    ];
    return candidates.length > 3
      ? [...candidates.slice(0, 2), `+${candidates.length - 2} ещё`]
      : candidates;
  });
  protected reason(card: GameCardView): string {
    return unavailableReason(this.game(), card.instanceId);
  }
}
