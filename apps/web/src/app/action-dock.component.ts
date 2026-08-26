import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { AvailableGameAction } from '@munchkin-lan/contracts';

export interface ActionDockUtilityAction {
  readonly id: 'SELL_CARDS' | 'GIVE_CHARITY';
  readonly label: string;
  readonly hint: string;
}

const PRIORITY: readonly AvailableGameAction[] = [
  'PASS_COMBAT_REACTION',
  'DECLARE_COMBAT_VICTORY',
  'PROPOSE_HELP',
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
        <button
          type="button"
          [class.primary]="first && primaryUtilityId() === null"
          (click)="actionSelected.emit(action)"
        >
          <strong>{{ label(action) }}</strong
          ><small>{{ hint(action) }}</small>
        </button>
      }
      @for (action of utilityActions(); track action.id) {
        <button
          type="button"
          class="utility"
          [class.primary]="action.id === primaryUtilityId()"
          (click)="utilityActionSelected.emit(action.id)"
        >
          <strong>{{ action.label }}</strong
          ><small>{{ action.hint }}</small>
        </button>
      }
      @if (overflow().length > 0) {
        <button type="button" class="more" (click)="allOpen.set(true)">
          Все действия · {{ overflow().length }}
        </button>
      }
      @if (
        visible().length === 0 &&
        utilityActions().length === 0 &&
        !hasPlayableCombatCards() &&
        !isOwnTurn()
      ) {
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
      min-height: 4.7rem;
      grid-auto-flow: column;
      grid-auto-columns: minmax(9rem, 1fr);
      gap: 0.45rem;
      align-items: stretch;
      overflow-x: auto;
    }
    button {
      min-width: 0;
      min-height: 4.7rem;
      padding: 0.45rem 0.65rem;
      overflow: hidden;
      border: 1px solid rgba(141, 99, 46, 0.58);
      border-radius: 0.7rem;
      color: #e5ede7;
      background: linear-gradient(145deg, #49301a, #21140c);
      font-family: var(--ui-sans);
      text-overflow: ellipsis;
      text-transform: none;
      white-space: normal;
    }
    button strong,
    button small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    button strong {
      font: 800 0.88rem/1.1 var(--ui-sans);
    }
    button small {
      margin-top: 0.12rem;
      color: #dccdae;
      font-size: 0.76rem;
      font-weight: 600;
      text-transform: none;
    }
    button.primary {
      order: -1;
      border-color: #80b276;
      color: #f5fbf2;
      background: linear-gradient(145deg, #315f3e, #173523);
      box-shadow:
        inset 0 1px rgba(255, 255, 255, 0.35),
        0 0.25rem 0.55rem rgba(0, 0, 0, 0.36);
    }
    button.primary small {
      color: #d7ecd2;
    }
    p {
      margin: 0;
      align-self: center;
      color: #8f9e94;
      font-size: 0.8rem;
      text-align: center;
    }
    .card-gateway {
      border-color: #d6bc69;
      color: #fff0bf;
      background: linear-gradient(145deg, #6b7a37, #29321a);
      box-shadow:
        inset 0 1px rgba(255, 255, 255, 0.22),
        0 0.25rem 0.55rem rgba(0, 0, 0, 0.36);
    }
    .more {
      border-color: #8d632e;
      background: #2b2117;
    }
    .utility {
      border-color: rgba(141, 99, 46, 0.58);
      color: #e5ded0;
      background: rgba(43, 30, 18, 0.9);
    }
    .action-sheet-backdrop {
      position: fixed;
      z-index: 55;
      inset: 0;
      display: grid;
      padding: 0;
      place-items: end center;
      background: rgba(22, 12, 6, 0.78);
    }
    .action-sheet {
      display: grid;
      width: 100%;
      height: auto;
      max-height: 90dvh;
      padding: 0.7rem;
      gap: 0.4rem;
      overflow: auto;
      border: 0;
      border-radius: 1rem 1rem 0 0;
      background: linear-gradient(180deg, #2f1e11, #140f0a);
    }
    .action-sheet header {
      display: flex;
      min-height: 2.75rem;
      align-items: center;
      justify-content: space-between;
    }
    .action-sheet button {
      height: auto;
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
    @media (max-height: 42rem) {
      .actions,
      button {
        min-height: 3.5rem;
      }
      button small {
        display: none;
      }
    }
  `,
})
export class ActionDockComponent {
  readonly actions = input.required<readonly AvailableGameAction[]>();
  readonly hasPlayableCombatCards = input(false);
  readonly utilityActions = input<readonly ActionDockUtilityAction[]>([]);
  readonly primaryUtilityId = input<ActionDockUtilityAction['id'] | null>(null);
  readonly isOwnTurn = input(false);
  readonly actionSelected = output<AvailableGameAction>();
  readonly playCardOpened = output<void>();
  readonly utilityActionSelected = output<ActionDockUtilityAction['id']>();
  protected readonly allOpen = signal(false);
  protected readonly ordered = computed(() =>
    PRIORITY.filter((action) => this.actions().includes(action)),
  );
  protected readonly visible = computed(() =>
    this.ordered().slice(0, this.primaryUtilityId() === null ? 2 : 1),
  );
  protected readonly overflow = computed(() =>
    this.ordered().slice(this.primaryUtilityId() === null ? 2 : 1),
  );
  protected label(action: AvailableGameAction): string {
    const labels: Record<AvailableGameAction, string> = {
      KICK_DOOR: 'Открыть дверь',
      LOOK_FOR_TROUBLE: 'Искать неприятности',
      SCAVENGE: 'Подобрать снаряжение',
      PROPOSE_HELP: 'Просить помощь',
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
