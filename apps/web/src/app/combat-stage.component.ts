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
            <span class="combat-status-detail"
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
        @if (!reactionMode() && combat.runAway; as runAway) {
          <div class="combat-status run-away-status">
            <strong>{{ playerName(runAway.currentCombatantId) }} пытается сбежать</strong>
            <span class="combat-status-detail"
              >От {{ monsterName(runAway.currentEncounterId) }} · попыток:
              {{ runAway.attempts.length }}</span
            >
          </div>
        }
        @if (!reactionMode() && combat.helpOffer; as offer) {
          <div class="combat-status help-offer-status">
            <strong>Ожидается ответ помощника</strong>
            <span class="combat-status-detail"
              >{{ playerName(offer.helperId) }} · обещано {{ offer.treasureCount }}
              {{ treasureLabel(offer.treasureCount) }}</span
            >
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
                <span class="monster-strength"
                  ><b>{{ focused().currentStrength }}</b
                  ><small>СИЛА</small></span
                >
                <span class="monster-info" aria-hidden="true">i</span>
              </button>
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
        <div class="combat-summary">
          <button
            type="button"
            class="score"
            aria-label="Открыть расчёт силы"
            (click)="breakdownOpened.emit()"
          >
            <span
              ><small>ИГРОКИ</small><b>{{ combat.playerPower }}</b></span
            >
            <strong aria-hidden="true">VS</strong>
            <span
              ><small>МОНСТРЫ</small><b>{{ combat.monsterPower }}</b></span
            >
            <em [class.losing]="difference() <= 0"
              >{{ difference() > 0 ? '+' : '' }}{{ difference() }}</em
            >
            @if (combat.monsters.length > 1) {
              <span class="score-reward"
                >НАГРАДА: +{{ totalLevelRewards() }} {{ totalLevelWord() }} ·
                {{ totalTreasureRewards() }} {{ totalTreasureWord() }}</span
              >
            }
          </button>
          <div class="combat-meta">
            @if (difference() <= 0 && combatHint(); as hint) {
              <p class="combat-hint">{{ hint }}</p>
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
          </div>
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
      grid-template-rows: minmax(0, 26rem) auto;
      align-content: center;
      gap: var(--space-1);
    }
    .combat:has(.combat-status),
    .combat:has(.reaction) {
      grid-template-rows: auto minmax(0, 26rem) auto;
    }
    .monster-zone {
      display: grid;
      min-width: 0;
      min-height: 0;
      grid-template-rows: minmax(0, 1fr);
      gap: var(--space-1);
      align-items: stretch;
      justify-items: center;
    }
    .monster-zone:has(.encounter-tabs) {
      grid-template-rows: auto minmax(0, 1fr);
    }
    .combat-status,
    .reaction {
      display: grid;
      min-height: 2.25rem;
      padding: 0.25rem 0.45rem;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 0.5rem;
      border: 1px solid var(--surface-line);
      border-radius: var(--radius-compact);
      color: #ffe9ad;
      background: #3b321d;
    }
    .combat-status {
      border-color: #6e814b;
      color: #e4f0d2;
      background: linear-gradient(100deg, rgba(22, 55, 38, 0.94), rgba(29, 34, 21, 0.94));
    }
    .combat-status.help-offer-status {
      border-color: #b38343;
      color: #ffe5b4;
      background: linear-gradient(100deg, rgba(79, 49, 22, 0.94), rgba(35, 27, 17, 0.94));
    }
    .reaction.required {
      border-color: #e3bc5d;
      box-shadow: 0 0 0 2px rgba(227, 188, 93, 0.16);
    }
    .reaction strong {
      font-size: 0.78rem;
    }
    .combat-status-detail,
    .reaction small {
      font-size: 0.75rem;
    }
    .combat-status-detail {
      grid-column: 1;
    }
    .reaction small {
      grid-column: 2;
      grid-row: 2;
    }
    .reaction strong {
      grid-column: 1 / -1;
    }
    .reaction small:not(.reaction-countdown) {
      grid-column: 1 / -1;
      grid-row: 3;
    }
    .reaction-countdown {
      color: #fff1c8;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
    }
    .combat-summary {
      display: grid;
      min-width: 0;
      gap: 0.15rem;
    }
    .score {
      position: relative;
      display: grid;
      width: min(100%, 21rem);
      min-height: 3.25rem;
      justify-self: center;
      padding: 0.25rem 0.4rem;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 0.35rem;
      border: 1px solid var(--surface-line);
      border-radius: var(--radius-surface);
      color: #fff;
      background: linear-gradient(
        100deg,
        rgba(48, 31, 18, 0.97),
        rgba(20, 15, 10, 0.97) 48%,
        rgba(54, 25, 19, 0.97)
      );
      box-shadow: inset 0 1px rgba(255, 225, 159, 0.1);
    }
    .score span {
      display: grid;
      place-items: center;
    }
    .score small {
      color: #bdc9c0;
      font-size: 0.68rem;
      letter-spacing: 0.08em;
    }
    .score b {
      font:
        900 clamp(1.35rem, 7vw, 1.75rem)/1 Georgia,
        serif;
      line-height: 1;
    }
    .score > strong {
      color: #edc978;
      font-size: 0.7rem;
      letter-spacing: 0.08em;
    }
    .score-reward {
      grid-column: 1 / -1;
      margin-top: 0.05rem;
      color: #e6c987;
      font-size: 0.7rem;
      font-weight: 800;
      line-height: 1.1;
      text-align: center;
    }
    .score em {
      justify-self: end;
      display: grid;
      min-width: 2.5rem;
      height: 1.5rem;
      padding-inline: 0.3rem;
      place-items: center;
      border-radius: 999px;
      color: #2b1b0d;
      background: #e0b85f;
      font-style: normal;
      font-size: 0.74rem;
      font-weight: 950;
    }
    .score em.losing {
      color: #fff;
      background: #aa5147;
    }
    .combat-meta {
      display: flex;
      min-width: 0;
      min-height: 1.1rem;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      overflow: hidden;
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
      font-size: 0.75rem;
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
    .combat-hint {
      display: block;
      width: min(100%, 22rem);
      justify-self: center;
      padding: 0.08rem 0.2rem;
      border: 0;
      border-radius: 0;
      color: #e1ceb0;
      background: transparent;
      font-size: 0.72rem;
      line-height: 1.15;
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
      min-height: 2.75rem;
      padding: 0.3rem 0.45rem;
      overflow: hidden;
      flex: 0 0 8rem;
      border: 1px solid #5c5140;
      border-radius: 0.5rem;
      color: #d9dedb;
      background: #211d17;
      font-size: 0.75rem;
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
      width: min(100%, clamp(10.5rem, 56vw, 13.25rem));
      min-height: 0;
      height: min(100%, 23rem);
      max-height: min(100%, 23rem);
      padding: 0.25rem;
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-self: center;
      justify-self: center;
      gap: 0.2rem;
      overflow: hidden;
      border: 1px solid rgba(169, 91, 82, 0.76);
      border-radius: var(--radius-stage);
      background: linear-gradient(145deg, rgba(64, 31, 20, 0.88), rgba(17, 12, 9, 0.9));
      box-shadow: 0 0.25rem 0.7rem rgba(0, 0, 0, 0.42);
    }
    .ui-combat-card-enter {
      animation: ui-combat-card-enter 150ms cubic-bezier(0.16, 0.82, 0.25, 1) both;
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
      width: auto;
      height: 100%;
      aspect-ratio: 3 / 4;
      align-self: center;
      justify-self: center;
      max-width: 100%;
      max-height: 100%;
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
    .monster-info {
      position: absolute;
      z-index: 2;
      right: 0.4rem;
      bottom: 0.4rem;
      display: grid;
      width: 1.35rem;
      height: 1.35rem;
      place-items: center;
      border: 1px solid rgba(255, 235, 183, 0.75);
      border-radius: 50%;
      color: #fff0bc;
      background: rgba(28, 19, 12, 0.8);
      font:
        900 0.82rem/1 Georgia,
        serif;
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
        800 clamp(0.9rem, 4.8vw, 1.08rem)/1.05 Georgia,
        serif;
      text-overflow: ellipsis;
      -webkit-box-orient: vertical;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      min-height: 2.1em;
    }
    .rewards {
      display: flex;
      min-width: 0;
      padding: 0.24rem 0.38rem;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      border-top: 1px solid rgba(194, 139, 69, 0.44);
      border-radius: 0;
      color: #f0cf87;
      background: transparent;
    }
    .rewards b {
      color: #dcb76b;
      font: 900 0.62rem/1 var(--ui-sans);
      letter-spacing: 0.07em;
    }
    .rewards span {
      min-width: 0;
      font: 800 0.7rem/1 var(--ui-sans);
    }
    p {
      margin: 0;
      color: #e2d4d1;
      font-size: 0.7rem;
      line-height: 1.18;
    }
    .monster-strength {
      position: absolute;
      z-index: 2;
      top: 0.35rem;
      right: 0.35rem;
      display: grid;
      width: 2.15rem;
      height: 2.55rem;
      place-items: center;
      align-content: center;
      border: 1px solid #d27751;
      border-radius: 0.35rem 0.35rem 45% 45%;
      color: #ffe7bd;
      background: linear-gradient(#8e3020, #3e160f);
      box-shadow:
        inset 0 1px rgba(255, 232, 186, 0.25),
        0 0.16rem 0.35rem #000;
    }
    .monster-strength b {
      font:
        900 1.25rem/1 Georgia,
        serif;
    }
    .monster-strength small {
      font-size: 0.68rem;
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
      font-size: 0.68rem;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
    @media (min-width: 48rem) {
      .combat {
        padding: 0.25rem 0;
      }
      .monster {
        width: min(100%, 14rem);
      }
      h3 {
        font-size: 1rem;
      }
      .score {
        min-height: 0;
      }
      .score small,
      .combat-hint {
        font-size: 0.75rem;
      }
    }
    @media (max-height: 42rem) {
      .combat {
        gap: 0.2rem;
      }
      .monster {
        width: min(100%, clamp(9.5rem, 48vw, 11.5rem));
        height: 100%;
        grid-template-rows: auto minmax(0, 1fr) auto;
      }
      .monster-art {
        width: auto;
        height: 100%;
        max-width: 100%;
      }
      .score {
        min-height: 0;
      }
      .score b {
        font-size: 1.45rem;
      }
      .combat-hint {
        display: none;
      }
      .participants span:first-child:not(:only-child) {
        display: none;
      }
      h3 {
        font-size: 0.9rem;
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
  protected combatHint(): string | null {
    const intents = this.game().availableIntents;
    const hint: string[] = [];
    if (intents.some((intent) => intent.kind === 'PLAY_CARD')) hint.push('усилиться картой');
    if (this.canRequestHelp()) hint.push('позвать на помощь');
    if (intents.some((intent) => intent.kind === 'RUN_AWAY')) hint.push('попытаться сбежать');
    return hint.length === 0 ? null : hint.join(' · ');
  }
  protected playerName(id: string | null): string {
    return this.game().players.find((player) => player.playerId === id)?.name ?? 'Игрок';
  }
  protected monsterName(encounterId: string | null): string {
    if (encounterId === null) return 'монстра';
    const encounter = this.game().combat?.monsters.find(
      (candidate) => candidate.encounterId === encounterId,
    );
    return encounter === undefined ? 'монстра' : this.cardName(encounter.monster);
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
