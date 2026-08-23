import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GameCardView } from '@munchkin-lan/contracts';
import { CardArtworkComponent } from './card-artwork.component';

@Component({
  selector: 'app-game-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardArtworkComponent],
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
      <div class="card-heading">
        <small>{{ kicker() }}</small>
        <strong>{{ name() }}</strong>
      </div>
      <app-card-artwork [artKey]="card().artKey" [label]="name()" />
      @if (facts().length > 0) {
        <ul class="facts">
          @for (fact of facts(); track $index) {
            <li>{{ fact }}</li>
          }
        </ul>
      }
      @if (badge()) {
        <span class="badge">{{ badge() }}</span>
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
      min-width: 9.25rem;
    }
    .game-card {
      position: relative;
      display: flex;
      width: 100%;
      min-width: 9.25rem;
      min-height: 17rem;
      height: 100%;
      margin: 0;
      padding: 0.8rem;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.55rem;
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
    .game-card[data-card-type='CURSE'],
    .game-card[data-card-type='COMBAT_CURSE'] {
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
    .game-card[data-card-type='ADD_MONSTER'] {
      border-color: #d06a5d;
      background: linear-gradient(150deg, #65372f, #281916 70%);
    }
    .game-card[data-card-type='CLONE_MONSTER'] {
      border-color: #7296cb;
      background: linear-gradient(150deg, #344d73, #171f2d 70%);
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
      min-height: 0;
    }
    :host:has(.game-card.compact) {
      min-width: 0;
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
    .card-heading {
      display: grid;
      min-width: 0;
      gap: 0.25rem;
    }
    small {
      color: #c6d1c8;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    strong {
      min-width: 0;
      font-family: Georgia, serif;
      font-size: 1rem;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }
    app-card-artwork {
      width: 100%;
    }
    .facts {
      display: grid;
      min-width: 0;
      margin: 0;
      padding: 0;
      gap: 0.22rem;
      list-style: none;
      color: #d4ddd6;
      font-size: 0.72rem;
      line-height: 1.25;
    }
    .facts li {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .facts li::before {
      color: #efc66d;
      content: '• ';
    }
    .badge {
      margin-top: auto;
      color: #b5c0b8;
      font-size: 0.76rem;
      overflow-wrap: anywhere;
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
  readonly facts = input<readonly string[]>([]);
  readonly ariaLabel = input.required<string>();
  readonly compact = input(false);
  readonly playable = input(false);
  readonly unavailable = input(false);
  readonly opened = output<GameCardView>();
}
