import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AvailableGameAction } from '@munchkin-lan/contracts';

const PRIORITY: readonly AvailableGameAction[] = [
  'PASS_COMBAT_REACTION',
  'DECLARE_COMBAT_VICTORY',
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
      @for (action of visible(); track action; let first = $first) {
        <button type="button" [class.primary]="first" (click)="actionSelected.emit(action)">
          {{ label(action) }}
        </button>
      }
      @if (visible().length === 0) {
        <p>Ожидаем действие другого игрока</p>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .actions {
      display: grid;
      min-height: 3rem;
      grid-template-columns: minmax(0, 1.5fr) repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
      align-items: stretch;
    }
    .actions:has(button:only-child) {
      grid-template-columns: 1fr;
    }
    button {
      min-width: 0;
      min-height: 2.75rem;
      padding: 0.35rem 0.45rem;
      overflow: hidden;
      border: 1px solid #5e7466;
      border-radius: 0.65rem;
      color: #e5ede7;
      background: #25342b;
      font-size: clamp(0.58rem, 2.5vw, 0.75rem);
      font-weight: 850;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }
    button.primary {
      border-color: #efc76d;
      color: #182019;
      background: linear-gradient(#f4d688, #dcb25c);
    }
    p {
      grid-column: 1 / -1;
      margin: 0;
      align-self: center;
      color: #8f9e94;
      font-size: 0.68rem;
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
  readonly actionSelected = output<AvailableGameAction>();
  protected readonly visible = computed(() =>
    PRIORITY.filter((action) => this.actions().includes(action)).slice(0, 3),
  );
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
}
