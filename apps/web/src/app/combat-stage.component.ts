import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { GameBadStuffEffectView, GameCardView, GameView } from '@munchkin-lan/contracts';
import { CardArtworkComponent } from './card-artwork.component';
import { LocalizationService } from './localization';

export function formatReactionCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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
            @if (reactionCountdown(); as countdown) {
              <small class="reaction-countdown">Осталось {{ countdown }}</small>
            }
            @if (
              !viewerMustReact() &&
              combat.reactionWindow?.confirmedPlayerIds?.includes(game().viewerPlayerId)
            ) {
              <small>Вы ответили. Ждём остальных.</small>
            }
          </div>
        }
        <div class="monster-zone">
          @if (combat.monsters.length > 1) {
            <div class="encounter-tabs" aria-label="Монстры в бою">
              @for (encounter of combat.monsters; track encounter.encounterId) {
                <button
                  type="button"
                  [class.active]="focused().encounterId === encounter.encounterId"
                  (click)="focusedId.set(encounter.encounterId)"
                >
                  {{ cardName(encounter.monster) }} · {{ encounter.currentStrength }}
                </button>
              }
            </div>
          }
          @for (encounter of focusedEncounters(); track encounter.encounterId) {
            <article
              class="monster"
              [animate.enter]="motionEnabled() ? 'ui-combat-card-enter' : ''"
            >
              <div class="monster-title">
                <h3>{{ cardName(focused().monster) }}</h3>
              </div>
              <button
                type="button"
                class="monster-art"
                [attr.aria-label]="'Подробнее: ' + cardName(focused().monster)"
                (click)="cardOpened.emit(focused().monster)"
              >
                <app-card-artwork
                  [artKey]="focused().monster.artKey"
                  [label]="cardName(focused().monster)"
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
          }
        </div>
        <button
          type="button"
          class="score"
          aria-label="Открыть расчёт силы"
          (click)="breakdownOpened.emit()"
        >
          <span
            ><small>СИЛА ИГРОКОВ</small><b>{{ combat.playerPower }}</b></span
          >
          <strong aria-hidden="true">VS</strong>
          <span
            ><small>СИЛА МОНСТРА</small><b>{{ combat.monsterPower }}</b></span
          >
          <span class="score-reward"
            >НАГРАДА: +{{ totalLevelRewards() }} {{ totalLevelWord() }} ·
            {{ totalTreasureRewards() }} {{ totalTreasureWord() }}</span
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
              {{ agreement.promisedTreasures }}
              {{ treasureLabel(agreement.promisedTreasures) }}</span
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
      grid-template-rows: minmax(0, 1fr) auto auto auto auto;
      gap: 0.28rem;
    }
    .combat:has(.reaction) {
      grid-template-rows: auto minmax(0, 1fr) auto auto auto auto;
    }
    .monster-zone {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0.32rem;
    }
    .reaction {
      display: grid;
      padding: 0.32rem 0.5rem;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 0.5rem;
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
      font-size: 0.68rem;
    }
    .reaction span {
      grid-column: 1;
    }
    .reaction small {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .reaction-countdown {
      color: #fff1c8;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
    }
    .score {
      position: relative;
      display: grid;
      width: 100%;
      min-height: 4.15rem;
      padding: 0.32rem 2.65rem 0.32rem 0.55rem;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      border: 1px solid var(--surface-frame);
      border-radius: 0.9rem;
      color: #fff;
      background: linear-gradient(
        100deg,
        rgba(48, 31, 18, 0.97),
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
      font-size: 0.72rem;
      letter-spacing: 0.08em;
    }
    .score b {
      font:
        900 clamp(1.7rem, 9vw, 2.35rem)/1 Georgia,
        serif;
      line-height: 1;
    }
    .score > strong {
      color: #edc978;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
    }
    .score-reward {
      grid-column: 1 / -1;
      color: #e6c987;
      font-size: 0.72rem;
      font-weight: 800;
      line-height: 1.1;
      text-align: center;
      margin: 3px 0 0;
    }
    .score em {
      position: absolute;
      right: 0.55rem;
      display: grid;
      width: 2rem;
      height: 2rem;
      place-items: center;
      border-radius: 50%;
      color: #2b1b0d;
      background: #e0b85f;
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
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .participants span:only-child {
      display: none;
    }
    .participants .agreement {
      color: #2b1b0d;
      background: #dfbd78;
    }
    .outcome {
      justify-self: center;
      margin: -0.5rem 0;
      z-index: 2;
      padding: 0.2rem 0.85rem;
      border: 1px solid #b77b3d;
      border-radius: 999px;
      color: #ffe6b0;
      background: #4b2d18;
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
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
    }
    .encounter-tabs button {
      min-width: 8rem;
      min-height: 2.4rem;
      padding: 0.3rem 0.45rem;
      overflow: hidden;
      flex: 0 0 8rem;
      border: 1px solid #5c5140;
      border-radius: 0.5rem;
      color: #d9dedb;
      background: #211d17;
      font-size: 0.62rem;
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
      width: min(100%, 15.5rem);
      min-height: 0;
      height: 100%;
      max-height: none;
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
    .ui-combat-card-enter {
      animation: ui-combat-card-enter 240ms cubic-bezier(0.16, 0.82, 0.25, 1) both;
    }
    @keyframes ui-combat-card-enter {
      from {
        opacity: 0;
        transform: translateY(0.8rem) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .monster-art {
      position: relative;
      display: grid;
      width: min(100%, 12.4rem);
      height: 100%;
      max-height: 100%;
      aspect-ratio: 3 / 4;
      align-self: center;
      justify-self: center;
      min-width: 0;
      min-height: 0;
      place-items: center;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: transparent;
    }
    .monster-art app-card-artwork {
      position: absolute;
      z-index: 1;
      inset: 0;
      width: 100%;
      min-height: 0;
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
        800 clamp(0.84rem, 4.2vw, 1rem)/1.05 Georgia,
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
        900 0.68rem Georgia,
        serif;
    }
    .rewards span {
      font:
        800 0.68rem Georgia,
        serif;
    }
    p {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: #e2d4d1;
      font-size: 0.74rem;
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
      font-size: 0.56rem;
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
      font-size: 0.58rem;
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
        width: min(100%, 12.5rem);
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
        width: min(100%, 12rem);
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
    @media (prefers-reduced-motion: reduce) {
      .ui-combat-card-enter {
        animation: none;
      }
    }
  `,
})
export class CombatStageComponent {
  private readonly localization = inject(LocalizationService);
  readonly game = input.required<GameView>();
  readonly reactionMode = input(false);
  readonly motionEnabled = input(false);
  readonly breakdownOpened = output<void>();
  readonly helpOpened = output<void>();
  readonly cardOpened = output<GameCardView>();
  protected readonly focusedId = signal<string | null>(null);
  private readonly reactionNowEpochMs = signal(Date.now());
  private readonly currentReactionWindow = computed(() => {
    const combat = this.game().combat;
    if (combat === null || combat.reactionWindow === null) return null;
    return {
      key: `${combat.combatId}:${combat.revision}:${combat.reactionWindow.windowId}`,
      expiresAtEpochMs: combat.reactionWindow.expiresAtEpochMs,
    };
  });
  protected readonly reactionCountdown = computed(() => {
    const reactionWindow = this.currentReactionWindow();
    return reactionWindow === null
      ? null
      : formatReactionCountdown(reactionWindow.expiresAtEpochMs - this.reactionNowEpochMs());
  });

  constructor() {
    effect((onCleanup) => {
      const reactionWindow = this.currentReactionWindow();
      if (reactionWindow === null) return;

      const updateNow = (): boolean => {
        const now = Date.now();
        this.reactionNowEpochMs.set(now);
        return now < reactionWindow.expiresAtEpochMs;
      };
      if (!updateNow()) return;

      const timer = setInterval(() => {
        if (!updateNow()) clearInterval(timer);
      }, 1_000);
      onCleanup(() => clearInterval(timer));
    });
  }

  protected readonly focused = computed(() => {
    const monsters = this.game().combat?.monsters ?? [];
    return monsters.find((entry) => entry.encounterId === this.focusedId()) ?? monsters[0]!;
  });
  protected readonly focusedEncounters = computed(() => [this.focused()]);

  protected readonly difference = computed(
    () => (this.game().combat?.playerPower ?? 0) - (this.game().combat?.monsterPower ?? 0),
  );
  protected readonly totalLevelRewards = computed(
    () =>
      this.game().combat?.monsters.reduce(
        (sum, encounter) => sum + encounter.baseLevelRewards,
        0,
      ) ?? 0,
  );
  protected readonly totalTreasureRewards = computed(
    () =>
      this.game().combat?.monsters.reduce(
        (sum, encounter) => sum + encounter.currentTreasures,
        0,
      ) ?? 0,
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
  protected treasureLabel(count: number): string {
    const lastTwo = count % 100;
    const last = count % 10;
    return lastTwo >= 11 && lastTwo <= 14
      ? 'сокровищ'
      : last === 1
        ? 'сокровище'
        : last >= 2 && last <= 4
          ? 'сокровища'
          : 'сокровищ';
  }
  protected cardName(card: GameCardView): string {
    return this.localization.cardName(card);
  }
  protected signed(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
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
  protected totalLevelWord(): string {
    return this.totalLevelRewards() === 1 ? 'уровень' : 'уровня';
  }
  protected treasureWord(): string {
    const count = this.focused().currentTreasures;
    return count === 1 ? 'сокровище' : count >= 2 && count <= 4 ? 'сокровища' : 'сокровищ';
  }
  protected totalTreasureWord(): string {
    const count = this.totalTreasureRewards();
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
