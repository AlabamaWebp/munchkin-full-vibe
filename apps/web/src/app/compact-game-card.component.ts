import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GameCardView } from '@munchkin-lan/contracts';
import { CardArtworkComponent } from './card-artwork.component';

@Component({
  selector: 'app-compact-game-card',
  imports: [CardArtworkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      [attr.data-type]="card().type"
      [class.playable]="playable()"
      [class.unavailable]="!playable()"
      [class.with-details]="showDetails()"
      [class.upgrade]="upgrade()"
    >
      <button
        type="button"
        class="card-action"
        [attr.aria-label]="ariaLabel()"
        (click)="activated.emit(card())"
      >
        <app-card-artwork [artKey]="card().artKey" [label]="displayName()" [compact]="true" />
        <strong>{{ displayName() }}</strong>
        @if (upgrade()) {
          <span class="upgrade-badge">Постоянное усиление</span>
        }
        @if (showDetails()) {
          @if (details().length > 0) {
            <div class="facts">
              @for (fact of details(); track fact) {
                <span>{{ fact }}</span>
              }
            </div>
          }
        }
      </button>
    </article>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    article {
      position: relative;
      min-width: 0;
      height: 100%;
      overflow: hidden;
      border: 1px solid rgba(166, 125, 75, 0.86);
      border-radius: 0.75rem;
      background: linear-gradient(155deg, #3a2818, #17100b 72%);
      box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, 0.76),
        0 0.28rem 0.6rem rgba(0, 0, 0, 0.5);
    }
    article[data-type='MONSTER'] {
      border-color: #9f5f56;
      background: linear-gradient(155deg, #4b2b28, #1d1514 72%);
    }
    article[data-type='CURSE'],
    article[data-type='COMBAT_CURSE'] {
      border-color: #8667aa;
      background: linear-gradient(155deg, #3e2c50, #19141f 72%);
    }
    article[data-type='EQUIPMENT'] {
      border-color: #628aa8;
      background: linear-gradient(155deg, #29475b, #142027 72%);
    }
    article.playable {
      border-color: #e2b965;
      box-shadow: inset 0 0 0 1px rgba(226, 185, 101, 0.3);
    }
    article.upgrade {
      border-color: #77d5b5;
      box-shadow:
        inset 0 0 0 1px rgba(119, 213, 181, 0.42),
        0 0 0.75rem rgba(65, 180, 142, 0.32);
    }
    .upgrade-badge {
      position: absolute;
      z-index: 1;
      right: 0.35rem;
      bottom: 0.35rem;
      left: 0.35rem;
      padding: 0.2rem 0.35rem;
      border: 0;
      border-radius: 999px;
      color: #e6fff4;
      background: #1c6954;
      font-family: var(--ui-sans);
      font-size: 0.75rem;
      text-align: center;
      font-weight: 900;
    }
    .card-action {
      display: grid;
      width: 100%;
      height: 100%;
      min-height: 9rem;
      padding: 0.32rem;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 0.14rem;
      border: 0;
      color: #f5f8f6;
      background: transparent;
      text-align: left;
    }
    article.upgrade .card-action {
      padding-bottom: 1.75rem;
    }
    article.with-details .card-action {
      min-height: 12rem;
      grid-template-rows: minmax(0, 1fr) auto auto;
    }
    app-card-artwork {
      width: 100%;
      height: auto;
      aspect-ratio: 3 / 4;
      min-height: 0;
    }
    strong {
      display: grid;
      width: 100%;
      min-height: 2.1em;
      max-height: 2.1em;
      overflow: hidden;
      align-items: center;
      font: 750 0.82rem/1.1 var(--ui-sans);
      text-align: center;
      white-space: normal;
    }
    .facts {
      display: grid;
      min-width: 0;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      overflow: hidden;
    }
    .facts span {
      min-width: 0;
      padding: 0.14rem 0.05rem;
      overflow: hidden;
      color: #efcb78;
      font-size: 0.75rem;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .unavailable {
      filter: saturate(0.75);
    }
    :host-context(.hand-dock) .card-action {
      min-height: 0;
      padding: 0.2rem;
    }
    :host-context(.hand-dock) app-card-artwork {
      width: auto;
      height: 100%;
      aspect-ratio: 3 / 4;
      justify-self: center;
    }
    :host-context(.hand-dock) strong {
      min-height: 1.8em;
      max-height: 1.8em;
      font-size: 0.72rem;
    }
    :host-context(.hand-dock) .facts span {
      font-size: 0.66rem;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: -2px;
    }
    @media (min-width: 48rem) {
      strong {
        font-size: 0.82rem;
      }
    }
  `,
})
export class CompactGameCardComponent {
  readonly card = input.required<GameCardView>();
  readonly cardName = input<(card: GameCardView) => string>((card) => card.name);
  readonly playable = input(false);
  readonly upgrade = input(false);
  readonly reason = input('Можно позже');
  readonly showDetails = input(false);
  readonly details = input<readonly string[]>([]);
  readonly activated = output<GameCardView>();

  protected ariaLabel(): string {
    return `${this.displayName()}. ${this.playable() ? 'Доступно сейчас' : this.reason()}`;
  }
  protected displayName(): string {
    return this.cardName()(this.card());
  }
}
