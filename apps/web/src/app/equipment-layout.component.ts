import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GameCardView, GameEquipmentSlot, GamePlayerView } from '@munchkin-lan/contracts';

export interface EquipmentLayoutLabels {
  readonly head: string;
  readonly body: string;
  readonly feet: string;
  readonly leftHand: string;
  readonly rightHand: string;
  readonly class: string;
  readonly race: string;
  readonly hireling: string;
  readonly mount: string;
  readonly permissions: string;
  readonly empty: string;
  readonly twoHanded: string;
}

@Component({
  selector: 'app-equipment-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="equipment-grid">
      <div class="slot head">
        <small>{{ labels().head }}</small>
        <ng-container *ngTemplateOutlet="cardsSlot; context: { cards: slotCards('HEAD') }" />
      </div>
      <div class="slot body">
        <small>{{ labels().body }}</small>
        <ng-container *ngTemplateOutlet="slot; context: { card: slotCard('BODY') }" />
      </div>
      <div class="slot feet">
        <small>{{ labels().feet }}</small>
        <ng-container *ngTemplateOutlet="slot; context: { card: slotCard('FEET') }" />
      </div>
      <div class="slot role class">
        <small>{{ labels().class }}</small>
        <ng-container *ngTemplateOutlet="cardsSlot; context: { cards: roleCards('CLASS') }" />
      </div>
      <div class="slot role race">
        <small>{{ labels().race }}</small>
        <ng-container *ngTemplateOutlet="cardsSlot; context: { cards: roleCards('RACE') }" />
      </div>
      @if (showCompanions()) {
        <div class="slot companion hireling">
          <small>{{ labels().hireling }}</small>
          <ng-container
            *ngTemplateOutlet="cardsSlot; context: { cards: companionCards('HIRELING') }"
          />
        </div>
        <div class="slot companion mount">
          <small>{{ labels().mount }}</small>
          <ng-container
            *ngTemplateOutlet="cardsSlot; context: { cards: companionCards('MOUNT') }"
          />
        </div>
      }
      @if (showRolePermissions()) {
        <div class="slot permissions">
          <small>{{ labels().permissions }}</small>
          <ng-container
            *ngTemplateOutlet="cardsSlot; context: { cards: player().rolePermissionCards ?? [] }"
          />
        </div>
      }
      @if (twoHandedCard(); as card) {
        <div class="slot hands two-handed">
          <small>{{ labels().leftHand }} + {{ labels().rightHand }}</small>
          <button
            type="button"
            [class.enhanced]="isEnhanced(card)"
            [class.passive]="hasPassiveEffect(card)"
            (click)="cardOpened.emit(card)"
          >
            <strong>{{ cardName()(card) }}</strong
            ><span>{{ labels().twoHanded }} · {{ resolvedBonus(card) }}</span>
            @if (isEnhanced(card)) {
              <small class="chip enhanced-chip"
                >Усилено · {{ card.equipped!.attachments.length }}</small
              >
            }
            @if (hasPassiveEffect(card)) {
              <small class="chip passive-chip">Пассив</small>
            }
          </button>
        </div>
      } @else {
        <div class="slot hands left">
          <small>{{ labels().leftHand }}</small>
          <ng-container *ngTemplateOutlet="slot; context: { card: handCards()[0] ?? null }" />
        </div>
        <div class="slot hands right">
          <small>{{ labels().rightHand }}</small>
          <ng-container *ngTemplateOutlet="slot; context: { card: handCards()[1] ?? null }" />
        </div>
      }
      @if (extraHandCards().length > 0) {
        <div class="slot hand-overflow">
          <small>{{ labels().leftHand }} +</small>
          <ng-container *ngTemplateOutlet="cardsSlot; context: { cards: extraHandCards() }" />
        </div>
      }
    </div>
    <ng-template #slot let-card="card">
      @if (card) {
        <button
          type="button"
          [class.enhanced]="isEnhanced(card)"
          [class.passive]="hasPassiveEffect(card)"
          (click)="cardOpened.emit(card)"
        >
          <strong>{{ cardName()(card) }}</strong
          ><span>{{ resolvedBonus(card) }}</span>
          @if (isEnhanced(card)) {
            <small class="chip enhanced-chip"
              >Усилено · {{ card.equipped!.attachments.length }}</small
            >
          }
          @if (hasPassiveEffect(card)) {
            <small class="chip passive-chip">Пассив</small>
          }
        </button>
      } @else {
        <span class="empty">{{ labels().empty }}</span>
      }
    </ng-template>
    <ng-template #cardsSlot let-cards="cards">
      @if (cards.length > 0) {
        @for (card of cards; track card.instanceId) {
          <button type="button" (click)="cardOpened.emit(card)">
            <strong>{{ cardName()(card) }}</strong>
            @if (card.equipment || card.companion) {
              <span>{{ resolvedBonus(card) }}</span>
            }
          </button>
        }
      } @else {
        <span class="empty">{{ labels().empty }}</span>
      }
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
  styles: `
    .equipment-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas: 'head head' 'body body' 'feet feet' 'left right' 'class race' 'hireling mount' 'permissions permissions';
      gap: 0.5rem;
    }
    .slot {
      display: flex;
      min-width: 0;
      min-height: 4.4rem;
      padding: 0.55rem;
      flex-direction: column;
      gap: 0.35rem;
      border: 1px dashed #806343;
      border-radius: 0.75rem;
      background: rgba(30, 19, 11, 0.78);
    }
    .slot.head {
      grid-area: head;
    }
    .slot.body {
      grid-area: body;
    }
    .slot.feet {
      grid-area: feet;
    }
    .slot.left {
      grid-area: left;
    }
    .slot.right {
      grid-area: right;
    }
    .slot.class {
      grid-area: class;
    }
    .slot.race {
      grid-area: race;
    }
    .slot.hireling {
      grid-area: hireling;
    }
    .slot.mount {
      grid-area: mount;
    }
    .slot.permissions {
      grid-area: permissions;
    }
    .slot.two-handed {
      grid-area: left;
      grid-column: 1 / 3;
      border-style: solid;
      border-color: #efc66d;
    }
    .slot.hand-overflow {
      grid-column: 1 / 3;
    }
    small {
      color: #bda987;
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    button {
      display: flex;
      width: 100%;
      min-height: 2.75rem;
      margin: 0;
      padding: 0.45rem 0.55rem;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      color: #f4e7ce;
      background: #49301a;
      text-align: left;
    }
    button strong {
      min-width: 0;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    button span {
      color: #efc66d;
      white-space: nowrap;
    }
    button.enhanced {
      border-left: 3px solid #efc66d;
    }
    button.passive {
      box-shadow: inset 0 0 0 1px rgba(106, 190, 164, 0.62);
    }
    .chip {
      display: inline-flex;
      width: fit-content;
      padding: 0.12rem 0.3rem;
      border-radius: 999px;
      font-size: 0.58rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .enhanced-chip {
      color: #30200b;
      background: #efc66d;
    }
    .passive-chip {
      color: #d0f3e6;
      background: #245849;
    }
    .empty {
      display: grid;
      min-height: 2.75rem;
      place-items: center;
      color: #9e896b;
      font-size: 0.72rem;
    }
    @media (min-width: 42rem) {
      .equipment-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-template-areas: 'head body feet feet' 'left right class race' 'hireling mount permissions permissions';
      }
    }
  `,
})
export class EquipmentLayoutComponent {
  readonly player = input.required<GamePlayerView>();
  readonly labels = input.required<EquipmentLayoutLabels>();
  readonly showCompanions = input(false);
  readonly showRolePermissions = input(false);
  readonly cardName = input.required<(card: GameCardView) => string>();
  readonly cardOpened = output<GameCardView>();

  slotCard(slot: Exclude<GameEquipmentSlot, 'HANDS'>): GameCardView | null {
    return this.player().equipment.find((card) => card.equipment?.slot === slot) ?? null;
  }

  slotCards(slot: Exclude<GameEquipmentSlot, 'HANDS'>): readonly GameCardView[] {
    return this.player().equipment.filter((card) => card.equipment?.slot === slot);
  }

  handCards(): readonly GameCardView[] {
    return this.player().equipment.filter((card) => card.equipment?.slot === 'HANDS');
  }

  twoHandedCard(): GameCardView | null {
    return this.handCards().find((card) => card.equipment?.hands === 2) ?? null;
  }

  extraHandCards(): readonly GameCardView[] {
    const twoHanded = this.twoHandedCard();
    return twoHanded === null
      ? this.handCards().slice(2)
      : this.handCards().filter((card) => card.instanceId !== twoHanded.instanceId);
  }

  companionCards(kind: 'HIRELING' | 'MOUNT'): readonly GameCardView[] {
    const cards = kind === 'HIRELING' ? this.player().hirelingCards : this.player().mountCards;
    const fallback = kind === 'HIRELING' ? this.player().hirelingCard : this.player().mountCard;
    return cards ?? (fallback === undefined || fallback === null ? [] : [fallback]);
  }

  cardCombatBonus(card: GameCardView): number {
    return card.equipment?.combatBonus ?? card.companion?.combatBonus ?? 0;
  }

  resolvedBonus(card: GameCardView): string {
    const bonus = card.equipped?.resolvedCombatBonus ?? this.cardCombatBonus(card);
    return `${bonus >= 0 ? '+' : ''}${bonus}`;
  }

  isEnhanced(card: GameCardView): boolean {
    return (card.equipped?.attachments.length ?? 0) > 0;
  }

  hasPassiveEffect(card: GameCardView): boolean {
    return card.equipment?.modifier !== undefined || card.companion?.modifier !== undefined;
  }

  roleCards(role: 'CLASS' | 'RACE'): readonly GameCardView[] {
    const cards = role === 'CLASS' ? this.player().classCards : this.player().raceCards;
    const fallback = role === 'CLASS' ? this.player().classCard : this.player().raceCard;
    return cards ?? (fallback === null ? [] : [fallback]);
  }
}
