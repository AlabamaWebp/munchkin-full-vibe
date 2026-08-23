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
          @for (event of events(); track event.entry.sequence) {
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
      padding: 0.4rem 0.75rem;
      grid-template-rows: auto minmax(0, 1fr);
      align-items: stretch;
      overflow: hidden;
      border: 1px solid #876033;
      border-radius: 0.85rem;
      color: #ead5ad;
      background: linear-gradient(
        100deg,
        rgba(24, 17, 11, 0.96),
        rgba(48, 32, 19, 0.93),
        rgba(19, 14, 10, 0.96)
      );
      box-shadow:
        inset 0 1px rgba(255, 220, 151, 0.14),
        0 0.25rem 0.7rem rgba(0, 0, 0, 0.38);
      text-align: left;
    }
    .title {
      min-width: 0;
      overflow: hidden;
      color: #d9b76f;
      font-size: 0.72rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .event-list {
      display: grid;
      min-height: 0;
      grid-auto-rows: minmax(0, 1fr);
      overflow: hidden;
    }
    .event-list span,
    .empty {
      width: 100%;
      min-width: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      font-size: clamp(0.76rem, 2.3vw, 0.92rem);
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .event-list span + span {
      border-top: 1px solid rgba(190, 132, 55, 0.28);
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
        font-size: 0.68rem;
      }
      .event-list span,
      .empty {
        font-size: 0.78rem;
      }
    }
    @media (max-height: 42rem) {
      .event-list span:nth-child(n + 2) {
        display: none;
      }
    }
  `,
})
export class RecentEventsComponent {
  readonly events = input.required<readonly PresentedEvent[]>();
  readonly historyOpened = output<void>();
}
