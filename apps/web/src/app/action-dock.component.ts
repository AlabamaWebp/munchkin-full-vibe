import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { AvailableGameAction } from '@munchkin-lan/contracts';

const PRIORITY: readonly AvailableGameAction[] = [
  'PASS_COMBAT_REACTION',
  'DECLARE_COMBAT_VICTORY',
  'PROPOSE_HELP',
  'COUNTER_HELP',
  'RUN_AWAY',
  'KICK_DOOR',
  'LOOK_FOR_TROUBLE',
  'SCAVENGE',
  'LOOT_ROOM',
  'END_TURN',
  'ACCEPT_HELP_OFFER',
  'REJECT_HELP_OFFER',
  'CANCEL_HELP_OFFER',
];

@Component({
  selector: 'app-action-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="actions" aria-label="Доступные действия">
      @if (hasPlayableCombatCards()) {
        <button type="button" class="card-gateway" (click)="playCardOpened.emit()">
          <strong>Сыграть карту</strong><small>Карта из руки</small>
        </button>
      }
      @for (action of visible(); track action; let first = $first) {
        <button type="button" [class.primary]="first" (click)="actionSelected.emit(action)">
          <strong>{{ label(action) }}</strong
          ><small>{{ hint(action) }}</small>
        </button>
      }
      @if (overflow().length > 0) {
        <button type="button" class="more" (click)="allOpen.set(true)">
          Все действия · {{ overflow().length }}
        </button>
      }
      @if (visible().length === 0) {
        <p>Ожидаем действие другого игрока</p>
      }
    </nav>
    @if (allOpen()) {
      <div class="action-sheet-backdrop">
        <section class="action-sheet" aria-label="Все доступные действия">
          <header>
            <strong>Все действия</strong
            ><button type="button" aria-label="Закрыть" (click)="allOpen.set(false)">×</button>
          </header>
          @for (action of overflow(); track action) {
            <button type="button" (click)="actionSelected.emit(action); allOpen.set(false)">
              {{ label(action) }}
            </button>
          }
        </section>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .actions {
      display: grid;
      min-height: 4.35rem;
      grid-auto-flow: column;
      grid-auto-columns: minmax(7.25rem, 1fr);
      gap: 0.35rem;
      align-items: stretch;
      overflow-x: auto;
    }
    button {
      min-width: 0;
      min-height: 4.35rem;
      padding: 0.45rem 0.55rem;
      overflow: hidden;
      border: 1px solid #5e7466;
      border-radius: 0.85rem;
      color: #e5ede7;
      background: linear-gradient(145deg, #26342c, #111a15);
      font-size: 0.7rem;
      font-weight: 850;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: normal;
    }
    button strong,
    button small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    button strong {
      font:
        900 0.7rem/1.05 Georgia,
        serif;
    }
    button small {
      margin-top: 0.22rem;
      color: #dccdae;
      font-size: 0.58rem;
      font-weight: 600;
      text-transform: none;
    }
    button.primary {
      border-color: #efc76d;
      color: #182019;
      background: linear-gradient(145deg, #f4d688, #9b6829);
      box-shadow:
        inset 0 1px rgba(255, 255, 255, 0.35),
        0 0.25rem 0.55rem rgba(0, 0, 0, 0.36);
    }
    p {
      margin: 0;
      align-self: center;
      color: #8f9e94;
      font-size: 0.68rem;
      text-align: center;
    }
    .card-gateway {
      border-color: #d6bc69;
      color: #fff0bf;
      background: linear-gradient(145deg, #285f31, #102619);
      box-shadow:
        inset 0 1px rgba(255, 255, 255, 0.22),
        0 0.25rem 0.55rem rgba(0, 0, 0, 0.36);
    }
    .more {
      border-color: #8d632e;
      background: #2b2117;
    }
    .action-sheet-backdrop {
      position: fixed;
      z-index: 55;
      inset: 0;
      display: grid;
      padding: 0.5rem;
      place-items: end center;
      background: rgba(0, 0, 0, 0.62);
    }
    .action-sheet {
      display: grid;
      width: min(100%, 28rem);
      max-height: 60dvh;
      padding: 0.7rem;
      gap: 0.4rem;
      overflow: auto;
      border: 1px solid #8d632e;
      border-radius: 1rem 1rem 0.35rem 0.35rem;
      background: #17130f;
    }
    .action-sheet header {
      display: flex;
      min-height: 2.75rem;
      align-items: center;
      justify-content: space-between;
    }
    .action-sheet button {
      min-height: 2.75rem;
      padding: 0.45rem 0.6rem;
      border: 1px solid #8d632e;
      border-radius: 0.65rem;
      color: #f3e4c7;
      background: #2b2117;
      text-align: left;
    }
    .action-sheet header button {
      width: 2.75rem;
      text-align: center;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
  `,
})
export class ActionDockComponent {
  readonly actions = input.required<readonly AvailableGameAction[]>();
  readonly hasPlayableCombatCards = input(false);
  readonly actionSelected = output<AvailableGameAction>();
  readonly playCardOpened = output<void>();
  protected readonly allOpen = signal(false);
  protected readonly ordered = computed(() =>
    PRIORITY.filter((action) => this.actions().includes(action)),
  );
  protected readonly visible = computed(() => this.ordered().slice(0, 2));
  protected readonly overflow = computed(() => this.ordered().slice(2));
  protected label(action: AvailableGameAction): string {
    const labels: Record<AvailableGameAction, string> = {
      KICK_DOOR: 'Открыть дверь',
      LOOK_FOR_TROUBLE: 'Искать неприятности',
      SCAVENGE: 'Подобрать снаряжение',
      PROPOSE_HELP: 'Просить помощь',
      COUNTER_HELP: 'Изменить условия',
      ACCEPT_HELP_OFFER: 'Принять помощь',
      REJECT_HELP_OFFER: 'Отказаться',
      CANCEL_HELP_OFFER: 'Отменить предложение',
      DECLARE_COMBAT_VICTORY: 'Объявить победу',
      PASS_COMBAT_REACTION: 'Пас',
      RUN_AWAY: 'Смыться',
      LOOT_ROOM: 'Обшарить комнату',
      END_TURN: 'Закончить ход',
    };
    return labels[action];
  }
  protected hint(action: AvailableGameAction): string {
    const hints: Partial<Record<AvailableGameAction, string>> = {
      PROPOSE_HELP: 'Другой игрок может помочь',
      RUN_AWAY: 'Избежать непотребства',
      DECLARE_COMBAT_VICTORY: 'Завершить бой',
      PASS_COMBAT_REACTION: 'Не вмешиваться',
    };
    return hints[action] ?? '';
  }
}
