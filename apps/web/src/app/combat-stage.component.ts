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
        <button
          type="button"
          class="score"
          aria-label="Открыть расчёт силы"
          (click)="breakdownOpened.emit()"
        >
          <span
            ><small>ИГРОКИ</small><b>{{ combat.playerPower }}</b></span
          >
          <strong>VS</strong>
          <span
            ><small>МОНСТРЫ</small><b>{{ combat.monsterPower }}</b></span
          >
          <em [class.losing]="difference() <= 0"
            >{{ difference() > 0 ? '+' : '' }}{{ difference() }}</em
          >
        </button>
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
          <div class="monster-copy">
            <h3>{{ focused().monster.name }}</h3>
            <div class="rewards">
              <b>СИЛА {{ focused().currentStrength }}</b>
              <span>💰 {{ focused().currentTreasures }}</span>
              <span>ур. +{{ focused().baseLevelRewards }}</span>
            </div>
            <p><strong>Непотребство:</strong> {{ badStuff() }}</p>
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
        @if (canRequestHelp()) {
          <button type="button" class="help" (click)="helpOpened.emit()">Попросить помощь</button>
        }
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
      gap: 0.45rem;
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
      min-height: 4.6rem;
      padding: 0.4rem 3.2rem 0.4rem 0.6rem;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      border: 1px solid #657a6c;
      border-radius: 0.85rem;
      color: #fff;
      background: linear-gradient(90deg, #244d37, #1a241e 48%, #402923);
    }
    .score span {
      display: grid;
      place-items: center;
    }
    .score small {
      color: #bdc9c0;
      font-size: 0.58rem;
      letter-spacing: 0.08em;
    }
    .score b {
      font-size: clamp(1.75rem, 9vw, 2.65rem);
      line-height: 1;
    }
    .score > strong {
      color: #f0c971;
      font-size: 0.75rem;
    }
    .score em {
      position: absolute;
      right: 0.55rem;
      display: grid;
      width: 2.45rem;
      height: 2.45rem;
      place-items: center;
      border-radius: 50%;
      color: #102017;
      background: #88d19b;
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
      gap: 0.35rem;
      overflow: hidden;
    }
    .participants span {
      padding: 0.18rem 0.4rem;
      overflow: hidden;
      border-radius: 999px;
      color: #dce5de;
      background: #243229;
      font-size: 0.58rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .participants .agreement {
      color: #15231a;
      background: #aad4b5;
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
      display: grid;
      min-height: 0;
      padding: 0.45rem;
      grid-template-columns: minmax(4.5rem, 28%) 1fr;
      gap: 0.55rem;
      overflow: hidden;
      border: 1px solid #754c47;
      border-radius: 0.8rem;
      background: linear-gradient(145deg, rgba(76, 39, 35, 0.92), rgba(24, 18, 16, 0.96));
    }
    .monster-art {
      min-width: 0;
      min-height: 4.5rem;
      padding: 0;
      border: 0;
      background: transparent;
    }
    .monster-copy {
      display: grid;
      min-width: 0;
      align-content: center;
      gap: 0.28rem;
    }
    h3 {
      margin: 0;
      overflow: hidden;
      font:
        800 clamp(0.82rem, 4vw, 1.05rem)/1.05 Georgia,
        serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rewards {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .rewards b {
      color: #ffd67a;
      font-size: 0.8rem;
    }
    .rewards span {
      font-size: 0.65rem;
    }
    p {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: #e2d4d1;
      font-size: 0.6rem;
      line-height: 1.2;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
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
    .help {
      justify-self: center;
      min-height: 2.75rem;
      padding: 0.4rem 1rem;
      border: 1px solid #73927e;
      border-radius: 999px;
      color: #e7f2ea;
      background: #274132;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
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
  private badStuffEffect(effect: GameBadStuffEffectView): string {
    if (effect.type === 'LOSE_LEVEL') return `потеря уровней: ${effect.amount}`;
    if (effect.type === 'DEATH') return 'смерть';
    if (effect.type === 'DISCARD_ROLE')
      return `сброс ${effect.role === 'CLASS' ? 'класса' : 'расы'}`;
    return `сброс карт: ${effect.count}`;
  }
}
