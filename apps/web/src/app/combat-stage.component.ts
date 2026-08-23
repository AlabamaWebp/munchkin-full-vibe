import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { GameBadStuffEffectView, GameCardView, GameView } from '@munchkin-lan/contracts';
import { CardArtworkComponent } from './card-artwork.component';

@Component({
  selector: 'app-combat-stage',
  imports: [CardArtworkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (game().combat; as combat) {
      <section class="combat" aria-label="Текущий бой">
        @if (reactionMode()) {
          <div class="reaction" [class.required]="viewerMustReact()">
            <strong>{{
              viewerMustReact() ? 'Объявлена победа — нужна ваша реакция' : 'Победа объявлена'
            }}</strong>
            <span
              >Ответили {{ combat.reactionWindow?.confirmedPlayerIds?.length ?? 0 }} · ждём
              {{ combat.reactionWindow?.waitingPlayerIds?.length ?? 0 }}</span
            >
            @if (combat.reactionWindow; as window) {
              <small>Ответ до {{ deadlineLabel(window.expiresAtEpochMs) }}</small>
            }
            @if (
              !viewerMustReact() &&
              combat.reactionWindow?.confirmedPlayerIds?.includes(game().viewerPlayerId)
            ) {
              <small>Вы ответили. Ждём остальных.</small>
            }
          </div>
        }
        @if (combat.monsters.length > 1) {
          <div class="encounter-tabs" aria-label="Монстры в бою">
            @for (encounter of combat.monsters; track encounter.encounterId) {
              <button
                type="button"
                [class.active]="focused().encounterId === encounter.encounterId"
                (click)="focusedId.set(encounter.encounterId)"
              >
                {{ encounter.monster.name }} · {{ encounter.currentStrength }}
              </button>
            }
          </div>
        }
        <article class="monster">
          <div class="monster-title">
            <h3>{{ focused().monster.name }}</h3>
          </div>
          <button
            type="button"
            class="monster-art"
            [attr.aria-label]="'Подробнее: ' + focused().monster.name"
            (click)="cardOpened.emit(focused().monster)"
          >
            <app-card-artwork
              [artKey]="focused().monster.artKey"
              [label]="focused().monster.name"
              [compact]="true"
            />
          </button>
          <span class="monster-strength"
            ><b>{{ focused().currentStrength }}</b
            ><small>СИЛА</small></span
          >
          <div class="monster-footer">
            <p><strong>Непотребство:</strong> {{ badStuff() }}</p>
            <div class="rewards">
              <b>НАГРАДА</b>
              <span
                >+{{ focused().baseLevelRewards }} {{ levelWord() }} ·
                {{ focused().currentTreasures }} {{ treasureWord() }}</span
              >
            </div>
            @if (focused().strengthModifier !== 0 || focused().treasureModifier !== 0) {
              <div class="modifiers">
                @if (focused().strengthModifier !== 0) {
                  <span>Сила {{ signed(focused().strengthModifier) }}</span>
                }
                @if (focused().treasureModifier !== 0) {
                  <span>Сокровища {{ signed(focused().treasureModifier) }}</span>
                }
              </div>
            }
          </div>
        </article>
        <button
          type="button"
          class="score"
          aria-label="Открыть расчёт силы"
          (click)="breakdownOpened.emit()"
        >
          <span
            ><small>ВАША СИЛА</small><b>{{ combat.playerPower }}</b></span
          >
          <strong>⚔</strong>
          <span
            ><small>СИЛА МОНСТРА</small><b>{{ combat.monsterPower }}</b></span
          >
          <em [class.losing]="difference() <= 0"
            >{{ difference() > 0 ? '+' : '' }}{{ difference() }}</em
          >
        </button>
        <div class="outcome" [class.losing]="difference() <= 0">
          {{
            difference() > 0
              ? 'Преимущество ' + difference()
              : 'Не хватает ' + -difference() + ' силы'
          }}
        </div>
        @if (difference() <= 0) {
          <p class="combat-hint">Усильтесь картой, позовите на помощь или смойтесь</p>
        }
        <div class="participants">
          <span>{{ playerName(combat.playerId) }}</span>
          @if (combat.helpAgreement; as agreement) {
            <span class="agreement"
              >{{ playerName(agreement.helperId) }} помогает · получит
              {{ agreement.promisedTreasures }}</span
            >
          } @else if (combat.helperId) {
            <span>{{ playerName(combat.helperId) }} помогает</span>
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      height: 100%;
    }
    .combat {
      display: grid;
      height: 100%;
      min-height: 0;
      align-content: center;
      gap: 0.32rem;
    }
    .reaction {
      display: grid;
      padding: 0.45rem 0.6rem;
      gap: 0.1rem;
      border: 1px solid #806f42;
      border-radius: 0.6rem;
      color: #ffe9ad;
      background: #3b321d;
    }
    .reaction.required {
      border-color: #e3bc5d;
      box-shadow: 0 0 0 2px rgba(227, 188, 93, 0.16);
    }
    .reaction strong {
      font-size: 0.78rem;
    }
    .reaction span,
    .reaction small {
      font-size: 0.62rem;
    }
    .score {
      position: relative;
      display: grid;
      width: 100%;
      min-height: 3.8rem;
      padding: 0.32rem 2.65rem 0.32rem 0.55rem;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      border: 1px solid #8e6734;
      border-radius: 0.9rem;
      color: #fff;
      background: linear-gradient(
        100deg,
        rgba(20, 27, 19, 0.97),
        rgba(20, 15, 10, 0.97) 48%,
        rgba(54, 25, 19, 0.97)
      );
      box-shadow:
        inset 0 1px rgba(255, 225, 159, 0.13),
        0 0.3rem 0.85rem rgba(0, 0, 0, 0.28);
    }
    .score span {
      display: grid;
      place-items: center;
    }
    .score small {
      color: #bdc9c0;
      font-size: 0.67rem;
      letter-spacing: 0.08em;
    }
    .score b {
      font:
        900 clamp(1.65rem, 8vw, 2.15rem)/1 Georgia,
        serif;
      line-height: 1;
    }
    .score > strong {
      color: #edc978;
      font-size: 1.1rem;
    }
    .score em {
      position: absolute;
      right: 0.55rem;
      display: grid;
      width: 2rem;
      height: 2rem;
      place-items: center;
      border-radius: 50%;
      color: #102017;
      background: #92c58b;
      font-style: normal;
      font-weight: 950;
    }
    .score em.losing {
      color: #fff;
      background: #aa5147;
    }
    .participants {
      display: flex;
      min-width: 0;
      justify-content: center;
      gap: 0.25rem;
      overflow: hidden;
    }
    .participants span {
      padding: 0.12rem 0.38rem;
      overflow: hidden;
      border-radius: 999px;
      color: #dce5de;
      background: rgba(34, 26, 18, 0.85);
      font-size: 0.55rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .participants span:only-child {
      display: none;
    }
    .participants .agreement {
      color: #15231a;
      background: #aad4b5;
    }
    .outcome {
      justify-self: center;
      margin-top: -0.75rem;
      z-index: 2;
      padding: 0.2rem 0.85rem;
      border: 1px solid #4f8358;
      border-radius: 999px;
      color: #dff0df;
      background: #173b29;
      box-shadow: 0 0.15rem 0.4rem rgba(0, 0, 0, 0.4);
      font-size: 0.72rem;
      font-weight: 800;
    }
    .outcome.losing {
      border-color: #ba6048;
      color: #ffb49b;
      background: #3b1d17;
    }
    .combat-hint {
      display: block;
      width: min(100%, 22rem);
      justify-self: center;
      padding: 0.42rem 0.8rem;
      border: 1px solid rgba(163, 117, 52, 0.55);
      border-radius: 0.7rem;
      color: #e1ceb0;
      background: rgba(20, 15, 10, 0.86);
      font-size: 0.76rem;
      line-height: 1.3;
      text-align: center;
    }
    .encounter-tabs {
      display: flex;
      min-width: 0;
      gap: 0.25rem;
      overflow: hidden;
    }
    .encounter-tabs button {
      min-width: 0;
      min-height: 2.4rem;
      padding: 0.3rem 0.45rem;
      overflow: hidden;
      flex: 1;
      border: 1px solid #5c5140;
      border-radius: 0.5rem;
      color: #d9dedb;
      background: #211d17;
      font-size: 0.55rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .encounter-tabs button.active {
      border-color: #e2b965;
      color: #ffe8b3;
    }
    .monster {
      position: relative;
      display: grid;
      width: min(100%, 12.25rem);
      min-height: 13.15rem;
      max-height: 15.5rem;
      padding: 0.38rem;
      grid-template-rows: auto minmax(0, 1fr) auto;
      justify-self: center;
      gap: 0.28rem;
      overflow: hidden;
      border: 2px solid #b25637;
      border-radius: 0.95rem;
      background: linear-gradient(145deg, rgba(77, 35, 21, 0.96), rgba(17, 12, 9, 0.96));
      box-shadow:
        inset 0 0 0 2px rgba(10, 7, 5, 0.82),
        0 0.5rem 1.25rem rgba(0, 0, 0, 0.58),
        0 0 1rem rgba(113, 45, 25, 0.2);
    }
    .monster-art {
      min-width: 0;
      min-height: 0;
      padding: 0;
      border: 0;
      background: transparent;
    }
    .monster-art app-card-artwork {
      height: 100%;
    }
    .monster-title,
    .monster-footer {
      display: grid;
      min-width: 0;
      align-content: center;
      gap: 0.18rem;
      text-align: center;
    }
    h3 {
      margin: 0;
      overflow: hidden;
      font:
        800 clamp(0.77rem, 3.9vw, 0.9rem)/1.05 Georgia,
        serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rewards {
      display: grid;
      padding: 0.18rem 0.3rem 0.22rem;
      align-items: center;
      justify-content: center;
      gap: 0.04rem;
      border: 1px solid #c28b45;
      border-radius: 0.42rem;
      color: #26180c;
      background: linear-gradient(145deg, #d1a45f, #8c5c28);
    }
    .rewards b {
      color: #2b1808;
      font:
        900 0.62rem Georgia,
        serif;
    }
    .rewards span {
      font:
        800 0.62rem Georgia,
        serif;
    }
    p {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: #e2d4d1;
      font-size: 0.62rem;
      line-height: 1.2;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    .monster-strength {
      position: absolute;
      z-index: 2;
      top: 1.7rem;
      right: 0.55rem;
      display: grid;
      width: 2.5rem;
      height: 3.15rem;
      place-items: center;
      align-content: center;
      border: 1px solid #d27751;
      border-radius: 0.35rem 0.35rem 45% 45%;
      color: #ffe7bd;
      background: linear-gradient(#8e3020, #3e160f);
      box-shadow: 0 0.2rem 0.5rem #000;
    }
    .monster-strength b {
      font:
        900 1.55rem/1 Georgia,
        serif;
    }
    .monster-strength small {
      font-size: 0.5rem;
      font-weight: 900;
    }
    .modifiers {
      display: flex;
      gap: 0.25rem;
    }
    .modifiers span {
      padding: 0.15rem 0.3rem;
      border-radius: 999px;
      color: #ffddb5;
      background: #593a31;
      font-size: 0.52rem;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
    @media (min-width: 48rem) {
      .combat {
        padding: 0.5rem 0;
      }
      .monster {
        width: min(100%, 16rem);
        min-height: 20rem;
        max-height: min(26rem, 50dvh);
      }
      h3 {
        font-size: 1rem;
      }
      .score {
        min-height: 4.5rem;
      }
      .score small,
      .combat-hint,
      .outcome {
        font-size: 0.75rem;
      }
    }
    @media (max-height: 42rem) {
      .combat {
        gap: 0.2rem;
      }
      .monster {
        width: 10rem;
        min-height: 10.5rem;
        max-height: 10.5rem;
      }
      .score {
        min-height: 3.35rem;
      }
      .score b {
        font-size: 1.7rem;
      }
      .combat-hint,
      .participants {
        display: none;
      }
      .outcome {
        margin-top: -0.65rem;
      }
    }
  `,
})
export class CombatStageComponent {
  readonly game = input.required<GameView>();
  readonly reactionMode = input(false);
  readonly breakdownOpened = output<void>();
  readonly helpOpened = output<void>();
  readonly cardOpened = output<GameCardView>();
  protected readonly focusedId = signal<string | null>(null);

  protected readonly focused = computed(() => {
    const monsters = this.game().combat?.monsters ?? [];
    return monsters.find((entry) => entry.encounterId === this.focusedId()) ?? monsters[0]!;
  });

  protected readonly difference = computed(
    () => (this.game().combat?.playerPower ?? 0) - (this.game().combat?.monsterPower ?? 0),
  );
  protected viewerMustReact(): boolean {
    return (
      this.game().combat?.reactionWindow?.waitingPlayerIds.includes(this.game().viewerPlayerId) ??
      false
    );
  }
  protected canRequestHelp(): boolean {
    const intent = this.game().availableIntents.find(
      (candidate) => candidate.kind === 'PROPOSE_HELP',
    );
    return intent?.kind === 'PROPOSE_HELP' && intent.helperIds.length > 0;
  }
  protected playerName(id: string): string {
    return this.game().players.find((player) => player.playerId === id)?.name ?? 'Игрок';
  }
  protected signed(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }
  protected deadlineLabel(expiresAtEpochMs: number): string {
    return new Date(expiresAtEpochMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  protected badStuff(): string {
    const effects = this.focused().monster.monster?.badStuff ?? [];
    return effects.length === 0
      ? 'нет'
      : effects.map((effect) => this.badStuffEffect(effect)).join(' · ');
  }
  protected levelWord(): string {
    return this.focused().baseLevelRewards === 1 ? 'уровень' : 'уровня';
  }
  protected treasureWord(): string {
    const count = this.focused().currentTreasures;
    return count === 1 ? 'сокровище' : count >= 2 && count <= 4 ? 'сокровища' : 'сокровищ';
  }
  private badStuffEffect(effect: GameBadStuffEffectView): string {
    if (effect.type === 'LOSE_LEVEL') return `потеря уровней: ${effect.amount}`;
    if (effect.type === 'DEATH') return 'смерть';
    if (effect.type === 'DISCARD_ROLE')
      return `сброс ${effect.role === 'CLASS' ? 'класса' : 'расы'}`;
    return `сброс карт: ${effect.count}`;
  }
}
