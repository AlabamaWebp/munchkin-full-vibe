import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GameCardView } from '@munchkin-lan/contracts';

@Component({
  selector: 'app-game-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="game-card"
      [class.compact]="compact()"
      [class.playable]="playable()"
      [class.unavailable]="unavailable()"
      [attr.data-card-type]="card().type"
      [attr.data-card-deck]="card().deck"
      [attr.aria-label]="ariaLabel()"
      (click)="opened.emit(card())"
    >
      <small>{{ kicker() }}</small>
      <strong>{{ name() }}</strong>
      @if (badge()) {
        <span>{{ badge() }}</span>
      }
      @if (playable()) {
        <em aria-hidden="true">✓</em>
      } @else if (unavailable()) {
        <em aria-hidden="true">ⓘ</em>
      }
    </button>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .game-card {
      position: relative;
      display: flex;
      width: 8.3rem;
      min-width: 8.3rem;
      height: 10.8rem;
      margin: 0;
      padding: 0.8rem;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.35rem;
      border: 1px solid #76623a;
      border-radius: 0.9rem;
      color: #f7faf8;
      background: linear-gradient(150deg, #39472f, #18241c 65%);
      text-align: left;
      overflow: hidden;
    }
    .game-card[data-card-deck='DOOR'] {
      box-shadow: inset 0 0.25rem 0 #9a6d3b;
    }
    .game-card[data-card-deck='TREASURE'] {
      box-shadow: inset 0 0.25rem 0 #c9a348;
    }
    .game-card[data-card-type='MONSTER'] {
      border-color: #a95b52;
      background: linear-gradient(150deg, #5a302c, #211715 70%);
    }
    .game-card[data-card-type='CURSE'] {
      border-color: #8d69b5;
      background: linear-gradient(150deg, #49345d, #1d1726 70%);
    }
    .game-card[data-card-type='EQUIPMENT'] {
      border-color: #668ead;
      background: linear-gradient(150deg, #304d62, #17222a 70%);
    }
    .game-card[data-card-type='TEMPORARY_BONUS'] {
      border-color: #d1944d;
      background: linear-gradient(150deg, #5b4325, #261d13 70%);
    }
    .game-card[data-card-type='MONSTER_MODIFIER'] {
      border-color: #b65f7d;
      background: linear-gradient(150deg, #593044, #251720 70%);
    }
    .game-card[data-card-type='CLASS'] {
      border-color: #54a398;
      background: linear-gradient(150deg, #28544f, #142522 70%);
    }
    .game-card[data-card-type='RACE'] {
      border-color: #b77b52;
      background: linear-gradient(150deg, #563a28, #251b15 70%);
    }
    .game-card[data-card-type='OTHER'] {
      border-color: #718078;
      background: linear-gradient(150deg, #39433d, #1a211d 70%);
    }
    .game-card.compact {
      width: 100%;
      min-width: 0;
      height: auto;
      min-height: 4.25rem;
    }
    .game-card.playable {
      border-color: #8bd49e;
      box-shadow:
        inset 0 0.25rem 0 #8bd49e,
        0 0 0 2px rgba(139, 212, 158, 0.18);
    }
    .game-card.unavailable {
      border-color: #526057;
      filter: saturate(0.55);
    }
    small {
      color: #c6d1c8;
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    strong {
      line-height: 1.15;
    }
    span {
      margin-top: auto;
      color: #b5c0b8;
      font-size: 0.7rem;
    }
    em {
      position: absolute;
      right: 0.55rem;
      bottom: 0.45rem;
      color: #8bd49e;
      font-style: normal;
      font-weight: 900;
    }
    .unavailable em {
      color: #b8c1ba;
    }
    .game-card:focus-visible {
      outline: 3px solid #fff3b8;
      outline-offset: 3px;
    }
  `,
})
export class GameCardComponent {
  readonly card = input.required<GameCardView>();
  readonly name = input.required<string>();
  readonly kicker = input.required<string>();
  readonly badge = input('');
  readonly ariaLabel = input.required<string>();
  readonly compact = input(false);
  readonly playable = input(false);
  readonly unavailable = input(false);
  readonly opened = output<GameCardView>();
}
