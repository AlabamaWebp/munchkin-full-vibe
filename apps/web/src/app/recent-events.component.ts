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
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      min-height: 4rem;
      padding: 0.52rem 0.75rem;
      align-items: flex-start;
      gap: 0;
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
    .strip::before {
      position: absolute;
      margin-top: -0.15rem;
      content: 'ПОСЛЕДНИЕ ДЕЙСТВИЯ';
      color: #d9b76f;
      font-size: 0.64rem;
      font-weight: 900;
      letter-spacing: 0.08em;
    }
    span {
      width: 100%;
      min-width: 0;
      overflow: hidden;
      font-size: 0.78rem;
      line-height: 1.15;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    span:first-of-type {
      margin-top: 1rem;
    }
    span + span {
      margin-top: 0.2rem;
      padding-top: 0.2rem;
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
        min-height: 3.5rem;
        padding-block: 0.4rem;
      }
      .strip::before {
        font-size: 0.56rem;
      }
      span {
        font-size: 0.68rem;
      }
      span:first-of-type {
        margin-top: 0.85rem;
      }
    }
  `,
})
export class RecentEventsComponent {
  readonly events = input.required<readonly PresentedEvent[]>();
  readonly historyOpened = output<void>();
}
