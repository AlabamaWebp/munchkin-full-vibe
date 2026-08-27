import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { AvailableGameAction } from '@munchkin-lan/contracts';
import { FocusTrapDirective } from './focus-trap.directive';

export interface ActionDockUtilityAction {
  readonly id: 'SELL_CARDS' | 'GIVE_CHARITY';
  readonly label: string;
  readonly hint: string;
}

type ActionDockEntry =
  | {
      readonly id: `action:${AvailableGameAction}`;
      readonly kind: 'ACTION';
      readonly action: AvailableGameAction;
      readonly primary: boolean;
    }
  | { readonly id: 'card:play'; readonly kind: 'CARD'; readonly primary: boolean }
  | {
      readonly id: `utility:${ActionDockUtilityAction['id']}`;
      readonly kind: 'UTILITY';
      readonly action: ActionDockUtilityAction;
      readonly primary: boolean;
    };

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
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="actions" aria-label="Доступные действия">
      @for (entry of visibleEntries(); track entry.id) {
        <button
          type="button"
          [class.card-gateway]="entry.kind === 'CARD'"
          [class.utility]="entry.kind === 'UTILITY'"
          [class.primary]="entry.primary"
          [class.escape]="entry.kind === 'ACTION' && entry.action === 'RUN_AWAY'"
          (click)="selectEntry(entry)"
        >
          <span class="action-icon" aria-hidden="true">
            @switch (entry.kind) {
              @case ('CARD') {
                <svg viewBox="0 0 24 24">
                  <path d="m7 5 11 2v12L7 17z" />
                  <path d="M4 4v12l3 1" />
                </svg>
              }
              @case ('UTILITY') {
                <svg viewBox="0 0 24 24">
                  <path d="M5 7h14M7 4h10v16H7z" />
                  <path d="M10 11h4M10 15h4" />
                </svg>
              }
              @case ('ACTION') {
                @switch (entry.action) {
                  @case ('PROPOSE_HELP') {
                    <svg viewBox="0 0 24 24">
                      <path d="M4 12h16M7 8h10M7 16h7" />
                      <path d="m17 15 3 3m0-3-3 3" />
                    </svg>
                  }
                  @case ('RUN_AWAY') {
                    <svg viewBox="0 0 24 24">
                      <path d="M4 12h13" />
                      <path d="m13 7 5 5-5 5" />
                      <path d="M4 6v12" />
                    </svg>
                  }
                  @case ('DECLARE_COMBAT_VICTORY') {
                    <svg viewBox="0 0 24 24">
                      <path d="m12 3 2.2 5.2L20 10l-5.8 1.8L12 17l-2.2-5.2L4 10l5.8-1.8z" />
                      <path d="M12 17v4" />
                    </svg>
                  }
                  @default {
                    <svg viewBox="0 0 24 24">
                      <path d="M5 5h14v14H5z" />
                      <path d="M8 12h8M12 8v8" />
                    </svg>
                  }
                }
              }
            }
          </span>
          <span class="action-copy"
            ><strong>{{ entryLabel(entry) }}</strong
            ><small>{{ entryHint(entry) }}</small></span
          >
        </button>
      }
      @if (overflowEntries().length > 0) {
        <button type="button" class="more" (click)="allOpen.set(true)">
          Ещё · {{ overflowEntries().length }}
        </button>
      }
      @if (entries().length === 0 && !isOwnTurn()) {
        <p>{{ waitingMessage() }}</p>
      }
    </nav>
    @if (allOpen()) {
      <div class="action-sheet-backdrop">
        <section
          class="action-sheet"
          appFocusTrap
          role="dialog"
          aria-modal="true"
          aria-label="Все доступные действия"
        >
          <header>
            <strong>Все действия</strong
            ><button type="button" aria-label="Закрыть" (click)="allOpen.set(false)">×</button>
          </header>
          @for (entry of overflowEntries(); track entry.id) {
            <button type="button" (click)="selectEntry(entry); allOpen.set(false)">
              {{ entryLabel(entry) }}
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
      display: flex;
      width: min(100%, 32rem);
      height: 100%;
      min-height: 2.75rem;
      margin-inline: auto;
      gap: var(--space-1);
      align-items: stretch;
      overflow: hidden;
    }
    button {
      flex: 1 1 0;
      min-width: 0;
      min-height: 2.75rem;
      padding: 0.28rem 0.45rem;
      display: grid;
      grid-template-columns: 1.25rem minmax(0, 1fr);
      align-content: center;
      align-items: center;
      column-gap: 0.35rem;
      overflow: hidden;
      border: 1px solid var(--surface-line);
      border-radius: var(--radius-compact);
      color: #e5ede7;
      background: linear-gradient(145deg, rgba(62, 40, 22, 0.9), rgba(28, 19, 12, 0.92));
      font-family: var(--ui-sans);
      text-overflow: ellipsis;
      text-transform: none;
      white-space: normal;
    }
    .action-icon {
      display: grid;
      width: 1.2rem;
      height: 1.2rem;
      place-items: center;
      color: #d8bd78;
    }
    .action-icon svg {
      width: 1.15rem;
      height: 1.15rem;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.65;
    }
    .action-copy {
      display: block;
      min-width: 0;
    }
    button strong,
    button small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    button strong {
      font: 800 0.8rem/1.08 var(--ui-sans);
    }
    button small {
      margin-top: 0.12rem;
      color: #dccdae;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: none;
    }
    button.primary {
      flex-grow: 1.2;
      order: -1;
      border-color: rgba(128, 178, 118, 0.86);
      color: #f5fbf2;
      background: linear-gradient(145deg, #315f3e, #173523);
      box-shadow: inset 0 1px rgba(255, 255, 255, 0.2);
    }
    button.escape {
      border-color: rgba(177, 86, 65, 0.7);
      color: #f0d4c9;
      background: linear-gradient(145deg, rgba(77, 36, 30, 0.92), rgba(34, 20, 16, 0.94));
    }
    button.primary small {
      color: #d7ecd2;
    }
    button.primary .action-icon {
      color: #f0d58c;
    }
    button.escape .action-icon {
      color: #db9b87;
    }
    p {
      margin: 0;
      align-self: center;
      color: #8f9e94;
      font-size: 0.8rem;
      text-align: center;
    }
    .card-gateway {
      border-color: rgba(141, 99, 46, 0.58);
      color: #e5ede7;
      background: linear-gradient(145deg, #49301a, #21140c);
    }
    .card-gateway.primary {
      border-color: #d6bc69;
      color: #fff0bf;
      background: linear-gradient(145deg, #6b7a37, #29321a);
      box-shadow:
        inset 0 1px rgba(255, 255, 255, 0.22),
        0 0.25rem 0.55rem rgba(0, 0, 0, 0.36);
    }
    .more {
      flex: 0 0 auto;
      width: auto;
      max-width: 5.5rem;
      padding-inline: 0.55rem;
      grid-template-columns: 1fr;
      border-color: #8d632e;
      background: rgba(43, 33, 23, 0.92);
      font-size: 0.72rem;
      font-weight: 850;
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
      padding: 0.7rem 0.7rem max(0.7rem, env(safe-area-inset-bottom));
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
      display: block;
      width: 100%;
      height: auto;
      min-height: 2.75rem;
      flex: none;
      padding: 0.45rem 0.6rem;
      border: 1px solid #8d632e;
      border-radius: 0.65rem;
      color: #f3e4c7;
      background: #2b2117;
      text-align: left;
    }
    .action-sheet header button {
      width: 2.75rem;
      flex: 0 0 2.75rem;
      text-align: center;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: -3px;
    }
    @media (max-height: 42rem) {
      .actions,
      button {
        min-height: 2.75rem;
      }
      .action-icon {
        width: 1.25rem;
        height: 1.25rem;
      }
      button small {
        display: none;
      }
    }
    @media (min-width: 48rem) {
      .action-sheet-backdrop {
        padding: 1rem;
        place-items: center;
      }
      .action-sheet {
        width: min(100%, 32rem);
        max-height: min(88dvh, 40rem);
        border-radius: 1rem;
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
  readonly waitingMessage = input('Ожидаем действие другого игрока');
  readonly actionSelected = output<AvailableGameAction>();
  readonly playCardOpened = output<void>();
  readonly utilityActionSelected = output<ActionDockUtilityAction['id']>();
  protected readonly allOpen = signal(false);
  protected readonly ordered = computed(() =>
    PRIORITY.filter((action) => this.actions().includes(action)),
  );
  protected readonly entries = computed<readonly ActionDockEntry[]>(() => {
    const primaryUtility = this.primaryUtilityId();
    const primaryAction =
      primaryUtility === null
        ? (this.ordered().find((action) => action !== 'RUN_AWAY') ?? null)
        : null;
    const cardIsPrimary =
      primaryUtility === null && primaryAction === null && this.hasPlayableCombatCards();
    const entries: ActionDockEntry[] = [];

    if (primaryUtility !== null) {
      const utility = this.utilityActions().find((candidate) => candidate.id === primaryUtility);
      if (utility !== undefined)
        entries.push({
          id: `utility:${utility.id}`,
          kind: 'UTILITY',
          action: utility,
          primary: true,
        });
    } else if (primaryAction !== null) {
      entries.push({
        id: `action:${primaryAction}`,
        kind: 'ACTION',
        action: primaryAction,
        primary: true,
      });
    } else if (cardIsPrimary) {
      entries.push({ id: 'card:play', kind: 'CARD', primary: true });
    }

    if (this.hasPlayableCombatCards() && !cardIsPrimary)
      entries.push({ id: 'card:play', kind: 'CARD', primary: false });
    for (const action of this.ordered()) {
      if (action !== primaryAction)
        entries.push({ id: `action:${action}`, kind: 'ACTION', action, primary: false });
    }
    for (const utility of this.utilityActions()) {
      if (utility.id !== primaryUtility)
        entries.push({
          id: `utility:${utility.id}`,
          kind: 'UTILITY',
          action: utility,
          primary: false,
        });
    }
    return entries;
  });
  protected readonly visibleEntries = computed(() => this.entries().slice(0, 2));
  protected readonly overflowEntries = computed(() => this.entries().slice(2));

  protected selectEntry(entry: ActionDockEntry): void {
    if (entry.kind === 'ACTION') this.actionSelected.emit(entry.action);
    else if (entry.kind === 'UTILITY') this.utilityActionSelected.emit(entry.action.id);
    else this.playCardOpened.emit();
  }

  protected entryLabel(entry: ActionDockEntry): string {
    if (entry.kind === 'CARD') return 'Сыграть карту';
    if (entry.kind === 'UTILITY') return entry.action.label;
    return this.label(entry.action);
  }

  protected entryHint(entry: ActionDockEntry): string {
    if (entry.kind === 'CARD') return 'Карта из руки';
    if (entry.kind === 'UTILITY') return entry.action.hint;
    return this.hint(entry.action);
  }
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
      RUN_AWAY: 'Попытаться сбежать',
      DECLARE_COMBAT_VICTORY: 'Завершить бой',
      PASS_COMBAT_REACTION: 'Не вмешиваться',
    };
    return hints[action] ?? '';
  }
}
