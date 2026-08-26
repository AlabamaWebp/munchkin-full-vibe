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
          @for (event of events().slice(0, 1); track event.entry.sequence) {
            <span [class.important]="event.priority !== 'ROUTINE'">{{ event.summary }}</span>
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
      display: block;
      min-height: 0;
      overflow: hidden;
    }
    .event-list span,
    .empty {
      display: -webkit-box;
      width: 100%;
      min-width: 0;
      overflow: hidden;
      font-family: var(--ui-sans);
      font-size: 0.78rem;
      line-height: 1.15;
      text-overflow: ellipsis;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
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
    @media (max-height: 42rem) {
      .strip {
        min-height: 0;
        padding-block: 0.25rem;
      }
      .title {
        padding-inline: 0.3rem;
        font-size: 0.6rem;
      }
      .event-list span,
      .empty {
        font-size: 0.75rem;
      }
    }
  `,
})
export class RecentEventsComponent {
  readonly events = input.required<readonly PresentedEvent[]>();
  readonly historyOpened = output<void>();
}
