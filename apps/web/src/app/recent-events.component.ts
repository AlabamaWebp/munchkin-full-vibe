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
      <strong class="title">Последнее</strong>
      @if (events().length === 0) {
        <span class="empty">Игра начинается…</span>
      } @else {
        <span class="event-list">
          @for (event of events().slice(0, 3); track event.entry.sequence) {
            <span class="event-row" [class.important]="event.priority !== 'ROUTINE'">
              <i aria-hidden="true"></i><span class="event-copy">{{ event.summary }}</span>
            </span>
          }
        </span>
      }
    </button>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .strip {
      position: relative;
      display: grid;
      width: 100%;
      height: 100%;
      min-height: 2.75rem;
      padding: 0.2rem 0.45rem;
      grid-template-columns: 4.25rem minmax(0, 1fr);
      align-items: center;
      gap: var(--space-1);
      overflow: hidden;
      border: 0;
      border-left: 2px solid rgba(204, 159, 82, 0.68);
      border-radius: var(--radius-compact);
      color: #ead5ad;
      background: linear-gradient(90deg, rgba(30, 21, 13, 0.76), rgba(16, 12, 8, 0.42));
      box-shadow: none;
      text-align: left;
    }
    .title {
      flex: 0 0 auto;
      min-width: 0;
      overflow: hidden;
      color: #bfae91;
      font-family: var(--ui-sans);
      font-size: 0.68rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .event-list {
      display: grid;
      min-width: 0;
      min-height: 0;
      gap: 0.04rem;
      overflow: hidden;
    }
    .event-row,
    .empty {
      display: flex;
      width: 100%;
      min-width: 0;
      align-items: center;
      gap: 0.28rem;
      overflow: hidden;
      font-family: var(--ui-sans);
      font-size: 0.75rem;
      line-height: 1.1;
      white-space: nowrap;
    }
    .event-copy {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .event-row i {
      flex: 0 0 auto;
      width: 0.34rem;
      height: 0.34rem;
      border-radius: 50%;
      background: #a67648;
    }
    .event-row.important {
      color: #ffe5a4;
    }
    .event-row.important i {
      background: #e5bd62;
    }
    .event-list .event-row:not(.important) {
      color: #e6d3ae;
    }
    .empty {
      color: #95a49a;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: -3px;
    }
    @media (max-height: 42rem) {
      .strip {
        min-height: 2.75rem;
        padding-block: 0.18rem;
      }
      .title {
        padding-inline: 0.3rem;
        font-size: 0.68rem;
      }
      .event-row,
      .empty {
        font-size: 0.75rem;
      }
      .event-row:nth-child(n + 3) {
        display: none;
      }
    }
  `,
})
export class RecentEventsComponent {
  readonly events = input.required<readonly PresentedEvent[]>();
  readonly historyOpened = output<void>();
}
