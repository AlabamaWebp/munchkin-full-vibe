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
              <i aria-hidden="true"></i>{{ event.summary }}
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
      min-height: 0;
      min-height: 2.75rem;
      padding: 0.25rem 0.55rem;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0.55rem;
      overflow: hidden;
      border: 0;
      border: 1px solid rgba(173, 132, 67, 0.48);
      border-left: 3px solid rgba(173, 132, 67, 0.78);
      border-radius: 0.7rem;
      color: #ead5ad;
      background: rgba(23, 16, 10, 0.78);
      box-shadow: inset 0 1px rgba(255, 225, 159, 0.08);
      text-align: left;
    }
    .title {
      flex: 0 0 auto;
      min-width: 0;
      padding: 0.18rem 0.35rem;
      overflow: hidden;
      border: 1px solid rgba(173, 132, 67, 0.38);
      border-radius: 999px;
      color: #c7b697;
      background: rgba(61, 42, 23, 0.65);
      font-family: var(--ui-sans);
      font-size: 0.62rem;
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
      gap: 0.06rem;
      overflow: hidden;
    }
    .event-row,
    .empty {
      display: flex;
      width: 100%;
      min-width: 0;
      align-items: center;
      gap: 0.35rem;
      overflow: hidden;
      font-family: var(--ui-sans);
      font-size: 0.76rem;
      line-height: 1.1;
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
      outline-offset: 2px;
    }
    @media (max-height: 42rem) {
      .strip {
        min-height: 0;
        padding-block: 0.22rem;
      }
      .title {
        padding-inline: 0.3rem;
        font-size: 0.6rem;
      }
      .event-row,
      .empty {
        font-size: 0.72rem;
      }
    }
  `,
})
export class RecentEventsComponent {
  readonly events = input.required<readonly PresentedEvent[]>();
  readonly historyOpened = output<void>();
}
