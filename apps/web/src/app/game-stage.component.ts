import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GameCardView, GameView } from '@munchkin-lan/contracts';
import { CardArtworkComponent } from './card-artwork.component';
import { CombatStageComponent } from './combat-stage.component';
import type { GameStageKind } from './game-ui.model';
import { latestRevealedCard } from './game-ui.model';

@Component({
  selector: 'app-game-stage',
  imports: [CardArtworkComponent, CombatStageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="stage" [attr.data-stage]="stage()">
      @switch (stage()) {
        @case ('COMBAT_OPEN') {
          <app-combat-stage
            [game]="game()"
            (breakdownOpened)="breakdownOpened.emit()"
            (helpOpened)="helpOpened.emit()"
            (cardOpened)="cardOpened.emit($event)"
          />
        }
        @case ('COMBAT_REACTION') {
          <app-combat-stage
            [game]="game()"
            [reactionMode]="true"
            (breakdownOpened)="breakdownOpened.emit()"
            (cardOpened)="cardOpened.emit($event)"
          />
        }
        @case ('RUN_AWAY_SEQUENCE') {
          <div class="run-away">
            <p class="eyebrow">ПОБЕГ</p>
            @if (game().combat?.runAway; as runAway) {
              <h2>{{ playerName(runAway.currentCombatantId) }} убегает</h2>
              <p>От: {{ encounterName(runAway.currentEncounterId) }}</p>
              <div class="attempts">
                @for (
                  attempt of runAway.attempts;
                  track attempt.combatantId + attempt.encounterId
                ) {
                  <span [class.failed]="attempt.outcome === 'FAILED'">
                    {{ playerName(attempt.combatantId) }} ·
                    {{ encounterName(attempt.encounterId) }} ·
                    {{ attempt.roll === null ? '—' : 'd6 ' + attempt.roll }} ·
                    {{ outcome(attempt.outcome) }}
                  </span>
                }
              </div>
            } @else if (game().lastRunAwayResult; as result) {
              <h2>Результат побега</h2>
              <div class="attempts">
                @for (attempt of result.attempts; track attempt.encounterId) {
                  <span [class.failed]="!attempt.escaped">
                    {{ attempt.monster.name }} · d6 {{ attempt.roll }} ·
                    {{ attempt.escaped ? 'успех' : 'неудача' }}
                    @if (attempt.badStuffApplied) {
                      · Непотребство применено
                    }
                  </span>
                }
              </div>
            }
          </div>
        }
        @case ('BLOCKING_DECISION') {
          <div class="message blocking">
            <p class="eyebrow">ВАЖНЫЙ ВЫБОР</p>
            <h2>
              {{
                game().pendingDecision?.playerId === game().viewerPlayerId
                  ? 'Нужно ваше решение'
                  : playerName(game().pendingDecision?.playerId ?? null) + ' выбирает'
              }}
            </h2>
            <p>{{ decisionCopy() }}</p>
          </div>
        }
        @case ('DOOR_REVEAL') {
          @if (revealedCard(); as card) {
            <article class="reveal">
              <app-card-artwork [artKey]="card.artKey" [label]="card.name" />
              <div>
                <p class="eyebrow">ДВЕРЬ ОТКРЫТА</p>
                <h2>{{ card.name }}</h2>
                <p>{{ card.description }}</p>
              </div>
              <button type="button" (click)="cardOpened.emit(card)">Подробнее</button>
            </article>
          } @else {
            <div class="message"><h2>Дверь открывается…</h2></div>
          }
        }
        @case ('POST_DOOR_CHOICE') {
          <div class="message">
            <p class="eyebrow">КОМНАТА ИССЛЕДОВАНА</p>
            <h2>Что дальше?</h2>
            <p>Выберите одно доступное действие внизу.</p>
          </div>
        }
        @case ('TURN_CLEANUP') {
          <div class="message">
            <p class="eyebrow">ЗАВЕРШЕНИЕ ХОДА</p>
            <h2>{{ game().self.handCount > 5 ? 'Слишком много карт' : 'Можно завершать ход' }}</h2>
            <p>
              {{
                game().self.handCount > 5
                  ? 'Оставьте не больше пяти карт или раздайте милостыню.'
                  : 'Проверьте снаряжение и передайте ход.'
              }}
            </p>
          </div>
        }
        @case ('TURN_READY') {
          @if (game().self.isDead) {
            <div class="message blocking">
              <p class="eyebrow">СОСТОЯНИЕ ПЕРСОНАЖА</p>
              <h2>Вы мертвы</h2>
              <p>
                Потерянное уже применено сервером. В начале своего хода вы вернётесь и получите
                новые закрытые карты.
              </p>
            </div>
          } @else {
            <div class="message">
              <p class="eyebrow">НАЧАЛО ХОДА</p>
              <h2>
                {{
                  game().activePlayerId === game().viewerPlayerId
                    ? 'Ваш ход'
                    : 'Ходит ' + playerName(game().activePlayerId)
                }}
              </h2>
              <p>
                {{
                  game().activePlayerId === game().viewerPlayerId
                    ? 'Откройте дверь, когда будете готовы.'
                    : 'Следите за событиями и готовьте карты.'
                }}
              </p>
            </div>
          }
        }
        @case ('FINISHED') {
          <div class="message victory">
            <p class="eyebrow">ПОБЕДА</p>
            <h2>{{ playerName(game().winnerId) }}</h2>
            <p>Достиг победного уровня.</p>
          </div>
        }
        @default {
          <div class="message">
            <p class="eyebrow">НАЧАЛО ХОДА</p>
            <h2>
              {{
                game().activePlayerId === game().viewerPlayerId
                  ? 'Ваш ход'
                  : 'Ходит ' + playerName(game().activePlayerId)
              }}
            </h2>
            <p>
              {{
                game().activePlayerId === game().viewerPlayerId
                  ? 'Откройте дверь, когда будете готовы.'
                  : 'Следите за событиями и готовьте карты.'
              }}
            </p>
          </div>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
    }
    .stage {
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    app-combat-stage {
      height: 100%;
    }
    .message,
    .run-away {
      display: grid;
      height: 100%;
      padding: 0.8rem;
      place-content: center;
      gap: 0.35rem;
      overflow: hidden;
      border: 1px solid #405448;
      border-radius: 0.9rem;
      background:
        radial-gradient(circle at 50% 0%, rgba(90, 129, 99, 0.22), transparent 70%), #142019;
      text-align: center;
    }
    .message.blocking {
      border-color: #bd8e4b;
      background: #302618;
    }
    .message.victory {
      border-color: #d8b252;
      background: radial-gradient(circle, #59461e, #1d1b13 72%);
    }
    .eyebrow {
      margin: 0;
      color: #e2bd69 !important;
      font-size: 0.68rem !important;
      font-weight: 900;
      letter-spacing: 0.12em;
    }
    h2 {
      margin: 0;
      font:
        850 clamp(1.05rem, 5vw, 1.55rem)/1.08 Georgia,
        serif;
    }
    p {
      margin: 0;
      color: #bdc9c0;
      font-size: 0.78rem;
      line-height: 1.25;
    }
    .reveal {
      display: grid;
      height: 100%;
      min-height: 0;
      padding: 0.65rem;
      grid-template-columns: minmax(5.5rem, 34%) 1fr;
      align-content: center;
      gap: 0.6rem;
      overflow: hidden;
      border: 1px solid #806f48;
      border-radius: 0.9rem;
      background: linear-gradient(145deg, #332a1d, #151d18);
    }
    .reveal > div {
      display: grid;
      min-width: 0;
      align-content: center;
      gap: 0.35rem;
    }
    .reveal app-card-artwork {
      min-width: 0;
    }
    .reveal button {
      min-height: 2.75rem;
      grid-column: 1 / -1;
      border: 1px solid #6e7d74;
      border-radius: 0.6rem;
      color: #eaf0ec;
      background: #233129;
    }
    .attempts {
      display: grid;
      max-height: 9rem;
      gap: 0.3rem;
      overflow: hidden;
    }
    .attempts span {
      padding: 0.35rem 0.45rem;
      border-radius: 0.45rem;
      color: #dff0e3;
      background: #24422e;
      font-size: 0.68rem;
    }
    .attempts span.failed {
      color: #ffd8cf;
      background: #562e27;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
  `,
})
export class GameStageComponent {
  readonly game = input.required<GameView>();
  readonly stage = input.required<GameStageKind>();
  readonly cardOpened = output<GameCardView>();
  readonly breakdownOpened = output<void>();
  readonly helpOpened = output<void>();
  protected revealedCard(): GameCardView | null {
    return latestRevealedCard(this.game());
  }
  protected playerName(id: string | null): string {
    return this.game().players.find((player) => player.playerId === id)?.name ?? 'Игрок';
  }
  protected encounterName(id: string | null): string {
    return (
      this.game().combat?.monsters.find((entry) => entry.encounterId === id)?.monster.name ??
      'монстра'
    );
  }
  protected outcome(value: 'ESCAPED' | 'FAILED' | 'SKIPPED_DEAD'): string {
    return value === 'ESCAPED' ? 'успех' : value === 'FAILED' ? 'неудача' : 'пропущено';
  }
  protected decisionCopy(): string {
    const decision = this.game().pendingDecision;
    if (decision?.type === 'DISCARD_CARDS')
      return `Выберите ${decision.count} карт: причина — ${decision.sourceCard.name}.`;
    if (decision?.type === 'CHOOSE_ROLE_TO_KEEP')
      return `Оставьте одну карту роли ${decision.role === 'CLASS' ? 'класса' : 'расы'}.`;
    return 'Ожидается обязательное решение.';
  }
}
