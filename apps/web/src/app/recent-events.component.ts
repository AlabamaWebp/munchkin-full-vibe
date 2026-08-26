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
      <strong class="title">ПОСЛЕДНИЕ ДЕЙСТВИЯ</strong>
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
      padding: 0.42rem 0.65rem;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0.55rem;
      overflow: hidden;
      border: 1px solid rgba(141, 99, 46, 0.62);
      border-radius: 0.7rem;
      color: #ead5ad;
      background: rgba(23, 16, 10, 0.88);
      box-shadow: inset 0 1px var(--tabletop-highlight);
      text-align: left;
    }
    .title {
      min-width: 0;
      overflow: hidden;
      color: #d9b76f;
      flex: 0 0 auto;
      color: var(--color-text-muted);
      font-size: 0.58rem;
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
      width: 100%;
      min-width: 0;
      overflow: hidden;
      display: block;
      font-size: 0.75rem;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
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
        padding-block: 0.4rem;
      }
      .title {
        font-size: 0.74rem;
      }
      .event-list span,
      .empty {
        font-size: 0.78rem;
      }
    }
  `,
})
export class RecentEventsComponent {
  readonly events = input.required<readonly PresentedEvent[]>();
  readonly historyOpened = output<void>();
}
