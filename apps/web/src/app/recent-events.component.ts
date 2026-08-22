import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PresentedEvent } from './game-ui.model';

@Component({
  selector: 'app-recent-events',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="strip"
      aria-label="Открыть историю игры"
      (click)="historyOpened.emit()"
    >
      @if (events().length === 0) {
        <span class="empty">Игра начинается…</span>
      } @else {
        @for (event of events(); track event.entry.sequence) {
          <span [class.important]="event.priority !== 'ROUTINE'">{{ event.summary }}</span>
        }
      }
    </button>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .strip {
      display: flex;
      width: 100%;
      min-height: 2.75rem;
      padding: 0.35rem 0.55rem;
      align-items: center;
      gap: 0.45rem;
      overflow: hidden;
      border: 1px solid #34473b;
      border-radius: 0.65rem;
      color: #dfe8e1;
      background: rgba(12, 22, 16, 0.88);
      text-align: left;
    }
    span {
      min-width: 0;
      overflow: hidden;
      font-size: 0.65rem;
      line-height: 1.15;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    span + span {
      padding-left: 0.45rem;
      border-left: 1px solid #415347;
    }
    .important {
      color: #ffe5a4;
    }
    .empty {
      color: #95a49a;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
  `,
})
export class RecentEventsComponent {
  readonly events = input.required<readonly PresentedEvent[]>();
  readonly historyOpened = output<void>();
}
