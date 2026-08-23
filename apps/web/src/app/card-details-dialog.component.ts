import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { GameCardView } from '@munchkin-lan/contracts';
import { AutoFocusDirective } from './auto-focus.directive';
import { CardArtworkComponent } from './card-artwork.component';

@Component({
  selector: 'app-card-details-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog-backdrop">
      <section
        class="card-dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="dialogId() + '-title'"
      >
        <header>
          <div>
            @if (eyebrow()) {
              <p>{{ eyebrow() }}</p>
            }
            <h2 [id]="dialogId() + '-title'">{{ title() }}</h2>
          </div>
          <button
            type="button"
            class="close"
            appAutoFocus
            [attr.aria-label]="closeLabel()"
            (click)="closed.emit()"
          >
            ×
          </button>
        </header>
        <div class="dialog-scroll">
          @if (meta()) {
            <div class="event-meta">{{ meta() }}</div>
          }
          @if (result()) {
            <div class="event-result">{{ result() }}</div>
          }
          @if (currentCard(); as card) {
            <article
              class="card-copy"
              [attr.data-card-type]="card.type"
              [attr.data-card-deck]="card.deck"
            >
              <small>{{ typeLabel()(card) }}</small>
              <h3>{{ cardName()(card) }}</h3>
              <app-card-artwork [artKey]="card.artKey" [label]="cardName()(card)" />
              <p>{{ cardDescription()(card) }}</p>
              @if (facts()(card).length > 0) {
                <dl class="card-facts">
                  @for (fact of facts()(card); track $index) {
                    <div>
                      <dd>{{ fact }}</dd>
                    </div>
                  }
                </dl>
              }
            </article>
          }
          @if (cards().length > 1) {
            <nav class="card-picker" [attr.aria-label]="relatedCardsLabel()">
              @for (card of cards(); track card.instanceId; let index = $index) {
                <button
                  type="button"
                  [class.active]="index === activeIndex()"
                  (click)="activeIndex.set(index)"
                >
                  {{ cardName()(card) }}
                </button>
              }
            </nav>
          }
          <ng-content />
        </div>
      </section>
    </div>
  `,
  imports: [AutoFocusDirective, CardArtworkComponent],
  styles: `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 40;
      display: grid;
      padding: 1rem;
      place-items: center;
      background: rgba(3, 8, 5, 0.8);
      backdrop-filter: blur(0.35rem);
    }
    .card-dialog {
      display: flex;
      width: min(100%, 32rem);
      max-height: calc(100dvh - 2rem);
      padding: 1rem;
      flex-direction: column;
      gap: 0.8rem;
      overflow: hidden;
      border: 1px solid #647268;
      border-radius: 1.15rem;
      background: #111d16;
      box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.48);
    }
    header {
      display: flex;
      flex: 0 0 auto;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }
    header p {
      margin: 0 0 0.25rem;
      color: #efc66d;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    h2,
    h3 {
      margin: 0;
      font-family: Georgia, serif;
      overflow-wrap: anywhere;
    }
    .close {
      width: 2.75rem;
      min-width: 2.75rem;
      min-height: 2.75rem;
      margin: 0;
      color: #fff;
      background: #2b3930;
      font-size: 1.3rem;
    }
    .event-meta,
    .event-result {
      padding: 0.65rem 0.75rem;
      border-radius: 0.7rem;
      color: #bec9c1;
      background: #18261e;
      font-size: 0.78rem;
      line-height: 1.4;
    }
    .event-result {
      border-left: 3px solid #efc66d;
      color: #fff3d3;
    }
    .card-copy {
      padding: 1rem;
      border: 1px solid #76623a;
      border-radius: 0.95rem;
      background: linear-gradient(150deg, #39472f, #18241c 70%);
    }
    .card-copy[data-card-type='MONSTER'] {
      border-color: #a95b52;
      background: linear-gradient(150deg, #5a302c, #211715 70%);
    }
    .card-copy[data-card-type='CURSE'] {
      border-color: #8d69b5;
      background: linear-gradient(150deg, #49345d, #1d1726 70%);
    }
    .card-copy[data-card-type='EQUIPMENT'] {
      border-color: #668ead;
      background: linear-gradient(150deg, #304d62, #17222a 70%);
    }
    .card-copy[data-card-type='TEMPORARY_BONUS'] {
      border-color: #d1944d;
      background: linear-gradient(150deg, #5b4325, #261d13 70%);
    }
    .card-copy[data-card-type='MONSTER_MODIFIER'] {
      border-color: #b65f7d;
      background: linear-gradient(150deg, #593044, #251720 70%);
    }
    .card-copy[data-card-type='CLASS'] {
      border-color: #54a398;
      background: linear-gradient(150deg, #28544f, #142522 70%);
    }
    .card-copy[data-card-type='RACE'] {
      border-color: #b77b52;
      background: linear-gradient(150deg, #563a28, #251b15 70%);
    }
    .card-copy[data-card-type='OTHER'] {
      border-color: #718078;
      background: linear-gradient(150deg, #39433d, #1a211d 70%);
    }
    .card-copy > small {
      color: #efc66d;
      font-weight: 800;
      text-transform: uppercase;
    }
    .card-copy h3 {
      margin-top: 0.35rem;
      font-size: 1.5rem;
    }
    .card-copy app-card-artwork {
      margin-top: 0.8rem;
    }
    .card-copy p {
      color: #cbd5cd;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .dialog-scroll {
      display: grid;
      min-height: 0;
      padding: 0 0.15rem 0.15rem;
      gap: 0.8rem;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }
    dl {
      display: grid;
      margin: 0.8rem 0 0;
      gap: 0.35rem;
    }
    dl div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }
    dt {
      color: #aab6ad;
    }
    dd {
      margin: 0;
      font-weight: 800;
      overflow-wrap: anywhere;
    }
    .card-facts div {
      display: block;
      padding: 0.42rem 0.55rem;
      border-radius: 0.55rem;
      background: rgba(4, 10, 6, 0.24);
    }
    .card-facts dd {
      line-height: 1.35;
    }
    .card-picker {
      display: flex;
      padding-bottom: 0.25rem;
      gap: 0.45rem;
      overflow-x: auto;
    }
    .card-picker button {
      width: auto;
      min-height: 2.75rem;
      margin: 0;
      white-space: nowrap;
      color: #dce3de;
      background: #302014;
    }
    .card-picker button.active {
      border-color: #efc66d;
      color: #fff3d3;
    }
    :host ::ng-deep .dialog-actions {
      display: grid;
      gap: 0.5rem;
    }
    @media (max-width: 38rem) {
      .dialog-backdrop {
        padding: max(0px, env(safe-area-inset-top)) 0 max(0px, env(safe-area-inset-bottom));
        place-items: end stretch;
      }
      .card-dialog {
        width: 100%;
        max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
        border-radius: 1.2rem 1.2rem 0 0;
        padding-bottom: 1rem;
      }
    }
  `,
})
export class CardDetailsDialogComponent {
  readonly cards = input.required<readonly GameCardView[]>();
  readonly title = input.required<string>();
  readonly dialogId = input('card-details');
  readonly eyebrow = input('');
  readonly meta = input('');
  readonly result = input('');
  readonly closeLabel = input.required<string>();
  readonly relatedCardsLabel = input.required<string>();
  readonly facts = input.required<(card: GameCardView) => readonly string[]>();
  readonly cardName = input.required<(card: GameCardView) => string>();
  readonly cardDescription = input.required<(card: GameCardView) => string>();
  readonly typeLabel = input.required<(card: GameCardView) => string>();
  readonly closed = output<void>();
  readonly activeIndex = signal(0);

  currentCard(): GameCardView | null {
    return this.cards()[this.activeIndex()] ?? this.cards()[0] ?? null;
  }
}
