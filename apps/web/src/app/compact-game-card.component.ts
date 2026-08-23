import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
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
    >
      <button
        type="button"
        class="card-action"
        [attr.aria-label]="ariaLabel()"
        (click)="activated.emit(card())"
      >
        <app-card-artwork [artKey]="card().artKey" [label]="card().name" [compact]="true" />
        <strong>{{ card().name }}</strong>
        <b>{{ headline() }}</b>
        <small>{{ subline() }}</small>
        <span class="state">{{ playable() ? 'СЫГРАТЬ' : reason() }}</span>
      </button>
      <button
        type="button"
        class="info"
        [attr.aria-label]="'Подробнее: ' + card().name"
        (click)="detailsOpened.emit(card())"
      >
        i
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
      border: 2px solid #719679;
      border-radius: 0.75rem;
      background: linear-gradient(155deg, #26382d, #121d16 72%);
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
      border-color: #8bd49e;
      box-shadow: inset 0 0 0 1px rgba(139, 212, 158, 0.3);
    }
    .card-action {
      display: grid;
      width: 100%;
      height: 100%;
      min-height: 7.9rem;
      padding: 0.27rem;
      align-content: start;
      gap: 0.14rem;
      border: 0;
      color: #f5f8f6;
      background: transparent;
      text-align: left;
    }
    app-card-artwork {
      width: 100%;
      height: clamp(3.5rem, 14vw, 4.4rem);
    }
    strong {
      display: -webkit-box;
      width: 100%;
      min-height: 1.8em;
      overflow: hidden;
      font:
        800 0.7rem/1.05 Georgia,
        serif;
      text-overflow: ellipsis;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    b {
      color: #f4d179;
      font-size: 0.68rem;
    }
    small {
      min-height: 1.35em;
      overflow: hidden;
      color: #bdc9c0;
      font-size: 0.56rem;
      line-height: 1.1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .state {
      display: block;
      width: calc(100% - 1.15rem);
      overflow: hidden;
      color: #8bd49e;
      font-size: 0.52rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .unavailable .state {
      color: #b7c0ba;
    }
    .unavailable {
      filter: saturate(0.75);
    }
    .info {
      position: absolute;
      top: 0.18rem;
      right: 0.18rem;
      width: 1.45rem;
      min-width: 1.45rem;
      height: 1.45rem;
      border: 1px solid #708078;
      border-radius: 50%;
      color: #e9efeb;
      background: rgba(23, 19, 13, 0.86);
      font-size: 0.65rem;
      font-weight: 900;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: -2px;
    }
    @media (min-width: 48rem) {
      .card-action {
        grid-template-rows: minmax(5.5rem, 1fr) auto auto auto auto;
      }
      strong {
        font-size: 0.78rem;
      }
      b {
        font-size: 0.74rem;
      }
      small,
      .state {
        font-size: 0.6rem;
      }
    }
  `,
})
export class CompactGameCardComponent {
  readonly card = input.required<GameCardView>();
  readonly playable = input(false);
  readonly reason = input('Можно позже');
  readonly activated = output<GameCardView>();
  readonly detailsOpened = output<GameCardView>();

  protected readonly headline = computed(() => {
    const card = this.card();
    if (card.type === 'MONSTER')
      return `СИЛА ${card.monster?.strength ?? card.monster?.level ?? 0} · 💰${card.monster?.treasureRewards ?? 0}`;
    if (card.type === 'EQUIPMENT') return `+${card.equipment?.combatBonus ?? 0}`;
    const bonus = card.effects.find(
      (effect) => effect.type === 'COMBAT_BONUS' || effect.type === 'MONSTER_COMBAT_BONUS',
    );
    if (bonus && 'amount' in bonus)
      return `${bonus.amount >= 0 ? '+' : ''}${bonus.amount} · ${bonus.type === 'MONSTER_COMBAT_BONUS' ? 'МОНСТР' : 'ИГРОК'}`;
    if (card.type === 'CURSE' || card.type === 'COMBAT_CURSE') return 'ПРОКЛЯТИЕ';
    return card.type.replaceAll('_', ' ');
  });

  protected readonly subline = computed(() => {
    const card = this.card();
    if (card.type === 'EQUIPMENT')
      return `${card.equipment?.slot ?? ''}${card.equipment?.hands ? ` · ${card.equipment.hands} руки` : ''}`;
    if (card.type === 'CURSE' || card.type === 'COMBAT_CURSE') return card.description;
    if (
      card.type === 'CLASS' ||
      card.type === 'RACE' ||
      card.type === 'HIRELING' ||
      card.type === 'MOUNT'
    )
      return card.description;
    return card.play?.timings.join(' · ') ?? '';
  });

  protected ariaLabel(): string {
    return `${this.card().name}. ${this.headline()}. ${this.playable() ? 'Доступно сейчас' : this.reason()}`;
  }
}
