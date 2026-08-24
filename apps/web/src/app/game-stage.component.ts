import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { GameCardView, GameView } from '@munchkin-lan/contracts';
import { CardArtworkComponent } from './card-artwork.component';
import { CombatStageComponent } from './combat-stage.component';
import type { GameStageKind, StageCardReceipt } from './game-ui.model';
import { latestStageCardEvent } from './game-ui.model';
import { LocalizationService } from './localization';

@Component({
  selector: 'app-game-stage',
  imports: [CardArtworkComponent, CombatStageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="stage" [attr.data-stage]="stage()">
      @if (showsStageCard() && stageCardEvent(); as event) {
        @if (focusedReceipt(); as receipt) {
          <section class="card-event" aria-label="Последнее карточное действие">
            @if (event.receipts.length > 1) {
              <div class="card-tabs receipt-tabs" aria-label="Получатели карт">
                @for (candidate of event.receipts; track candidate.entry.sequence) {
                  <button
                    type="button"
                    [class.active]="receipt.entry.sequence === candidate.entry.sequence"
                    (click)="focusedReceiptSequence.set(candidate.entry.sequence)"
                  >
                    {{ receiptLabel(candidate) }}
                  </button>
                }
              </div>
            }
            @if (receipt.hiddenCard; as hiddenCard) {
              <p class="eyebrow">ПОСЛЕДНЕЕ ДЕЙСТВИЕ</p>
              <h2 class="event-summary">{{ hiddenCardSummary(receipt) }}</h2>
              <article class="event-card hidden-card">
                <div class="event-card-title">
                  <small>ЗАКРЫТАЯ КАРТА</small>
                  <h3>{{ hiddenCardTitle(hiddenCard.deck, hiddenCard.count) }}</h3>
                </div>
                <div class="hidden-card-art" aria-hidden="true">?</div>
                <p>{{ hiddenCardDescription(hiddenCard.deck, hiddenCard.count) }}</p>
              </article>
            } @else if (focusedStageCard(); as focused) {
              @if (receipt.cards.length > 1) {
                <div class="card-tabs" aria-label="Карты последнего действия">
                  @for (card of receipt.cards; track card.instanceId) {
                    <button
                      type="button"
                      [class.active]="focused.instanceId === card.instanceId"
                      (click)="focusedStageCardId.set(card.instanceId)"
                    >
                      {{ cardName(card) }}
                    </button>
                  }
                </div>
              }
              <p class="eyebrow">ПОСЛЕДНЕЕ ДЕЙСТВИЕ</p>
              <h2 class="event-summary">{{ stageSummary(receipt.summary, receipt.cards) }}</h2>
              <article class="event-card">
                <div class="event-card-title">
                  <small>{{ cardZone(focused) }}</small>
                  <h3>{{ cardName(focused) }}</h3>
                </div>
                <button
                  type="button"
                  class="event-card-art"
                  [attr.aria-label]="'Подробнее: ' + cardName(focused)"
                  (click)="cardOpened.emit(focused)"
                >
                  <app-card-artwork
                    [artKey]="focused.artKey"
                    [label]="cardName(focused)"
                    [compact]="true"
                  />
                </button>
                <p>{{ cardDescription(focused) }}</p>
              </article>
            }
          </section>
        }
      } @else {
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
                  @for (attempt of result.attempts; track attempt.combatantId + attempt.encounterId) {
                    <span [class.failed]="!attempt.escaped">
                      {{ playerName(attempt.combatantId) }} · {{ cardName(attempt.monster) }} ·
                      d6 {{ attempt.roll }} ·
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
            <div class="message"><h2>Дверь открывается…</h2></div>
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
              <h2>
                {{ game().self.handCount > 5 ? 'Слишком много карт' : 'Можно завершать ход' }}
              </h2>
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
            <section class="message victory results" aria-label="Результаты завершённой партии">
              <p class="eyebrow">ПАРТИЯ ЗАВЕРШЕНА</p>
              @if (winner(); as matchWinner) {
                <h2>{{ matchWinner.name }} {{ winnerVerb(matchWinner.sex) }}</h2>
              } @else {
                <h2>Матч завершён</h2>
              }
              <p>Итоговые уровни и боевая сила зафиксированы сервером.</p>
              <ol class="results-list">
                @for (player of game().players; track player.playerId) {
                  <li [class.winner]="player.playerId === game().winnerId">
                    <span>{{ player.name }}</span>
                    <b>Уровень {{ player.level }}</b>
                    <small>Сила {{ player.combatPower }}</small>
                  </li>
                }
              </ol>
              @if (isHost()) {
                <div class="lifecycle-actions">
                  <button type="button" (click)="rematchRequested.emit()">Сыграть ещё раз</button>
                  <button type="button" (click)="returnToLobbyRequested.emit()">В лобби</button>
                </div>
              } @else {
                <p class="waiting-host">
                  Ожидание решения ведущего: новая партия или возврат в лобби.
                </p>
              }
            </section>
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
      // border: 1px solid #405448;
      // border-radius: 0.9rem;
      // background:
      //   radial-gradient(circle at 50% 0%, rgba(149, 97, 48, 0.22), transparent 70%), #21150d;
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
    .message.results {
      align-content: center;
      overflow: auto;
    }
    .results-list {
      display: grid;
      width: min(100%, 22rem);
      margin: 0.3rem auto;
      padding: 0;
      gap: 0.25rem;
      list-style: none;
      text-align: left;
    }
    .results-list li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 0.45rem;
      align-items: baseline;
      padding: 0.42rem 0.5rem;
      border-radius: 0.5rem;
      background: rgba(0, 0, 0, 0.22);
      font-size: 0.75rem;
    }
    .results-list li.winner {
      color: #ffe29a;
      background: rgba(216, 178, 82, 0.25);
    }
    .results-list span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .results-list small {
      color: #bdc9c0;
    }
    .lifecycle-actions {
      display: flex;
      justify-content: center;
      gap: 0.45rem;
    }
    .lifecycle-actions button {
      padding: 0.5rem 0.7rem;
      border: 1px solid #d8b252;
      border-radius: 0.5rem;
      color: #fff0bf;
      background: #3b2d13;
      font-weight: 800;
    }
    .waiting-host {
      max-width: 20rem;
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
    .card-event {
      display: grid;
      height: 100%;
      min-height: 0;
      padding: 0.65rem;
      grid-template-rows: auto auto minmax(0, 1fr);
      align-items: center;
      justify-items: center;
      gap: 0.35rem;
      overflow: hidden;
    }
    .card-tabs {
      display: flex;
      width: 100%;
      min-width: 0;
      justify-content: flex-start;
      gap: 0.25rem;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .card-tabs button {
      min-width: 7rem;
      min-height: 2.15rem;
      padding: 0.3rem 0.45rem;
      overflow: hidden;
      flex: 0 0 7rem;
      border: 1px solid #5c5140;
      border-radius: 0.5rem;
      color: #d9dedb;
      background: #211d17;
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-tabs button.active {
      border-color: #e2b965;
      color: #ffe8b3;
    }
    .event-summary {
      width: 100%;
      text-align: center;
    }
    .event-card {
      display: grid;
      width: min(100%, 17rem);
      min-width: 0;
      min-height: 0;
      height: 100%;
      padding: 0.38rem;
      grid-template-rows: auto minmax(0, 1fr) auto;
      justify-self: center;
      gap: 0.28rem;
      overflow: hidden;
      border: 2px solid #8e6734;
      border-radius: 0.95rem;
      background: linear-gradient(145deg, rgba(77, 54, 28, 0.96), rgba(17, 12, 9, 0.96));
      box-shadow:
        inset 0 0 0 2px rgba(10, 7, 5, 0.82),
        0 0.5rem 1.25rem rgba(0, 0, 0, 0.58);
    }
    .event-card-title {
      display: grid;
      min-width: 0;
      gap: 0.1rem;
      text-align: center;
    }
    .event-card-title small {
      color: #d9b76f;
      font-size: 0.56rem;
      font-weight: 900;
      letter-spacing: 0.1em;
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
    .event-card-art {
      position: relative;
      display: grid;
      width: min(100%, 11rem);
      min-height: 0;
      height: 100%;
      aspect-ratio: 3 / 4;
      align-self: center;
      justify-self: center;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: transparent;
    }
    .event-card-art app-card-artwork {
      position: absolute;
      inset: 0;
      width: 100%;
      min-height: 0;
      height: 100%;
    }
    .hidden-card-art {
      display: grid;
      width: min(100%, 11rem);
      min-height: 0;
      height: 100%;
      aspect-ratio: 3 / 4;
      align-self: center;
      justify-self: center;
      place-items: center;
      border: 2px dashed #c49b53;
      border-radius: 0.72rem;
      color: #ffe4a5;
      background:
        radial-gradient(circle at 30% 25%, rgba(228, 183, 93, 0.2), transparent 35%),
        repeating-linear-gradient(45deg, #332313, #332313 0.5rem, #21170e 0.5rem, #21170e 1rem);
      font:
        900 clamp(3rem, 18vw, 5rem)/1 Georgia,
        serif;
      text-shadow: 0 0.2rem 0.5rem #000;
    }
    .event-card > p {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: #e2d4d1;
      font-size: 0.7rem;
      line-height: 1.2;
      text-align: center;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
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
  private readonly localization = inject(LocalizationService);
  readonly game = input.required<GameView>();
  readonly stage = input.required<GameStageKind>();
  readonly isHost = input(false);
  readonly cardOpened = output<GameCardView>();
  readonly breakdownOpened = output<void>();
  readonly helpOpened = output<void>();
  readonly rematchRequested = output<void>();
  readonly returnToLobbyRequested = output<void>();
  protected readonly focusedStageCardId = signal<string | null>(null);
  protected readonly focusedReceiptSequence = signal<number | null>(null);
  protected readonly stageCardEvent = computed(() => latestStageCardEvent(this.game()));
  protected readonly winner = computed(
    () => this.game().players.find((player) => player.playerId === this.game().winnerId) ?? null,
  );
  protected winnerVerb(sex: GameView['players'][number]['sex']): string {
    return sex === 'FEMALE' ? 'победила' : 'победил';
  }
  protected readonly focusedReceipt = computed(() => {
    const event = this.stageCardEvent();
    if (event === null) return null;
    const receipts = event.receipts;
    return (
      receipts.find((receipt) => receipt.entry.sequence === this.focusedReceiptSequence()) ??
      receipts.find(
        (receipt) =>
          receipt.entry.playerId === this.game().viewerPlayerId && receipt.cards.length > 0,
      ) ??
      receipts.at(-1) ??
      null
    );
  });
  protected readonly focusedStageCard = computed(() => {
    const receipt = this.focusedReceipt();
    if (receipt === null) return null;
    return (
      receipt.cards.find((card) => card.instanceId === this.focusedStageCardId()) ??
      receipt.cards[0]!
    );
  });
  protected showsStageCard(): boolean {
    return ['TURN_READY', 'DOOR_REVEAL', 'POST_DOOR_CHOICE', 'TURN_CLEANUP'].includes(this.stage());
  }
  protected cardZone(card: GameCardView): string {
    return card.deck === 'DOOR' ? 'КАРТА ДВЕРИ' : 'КАРТА СОКРОВИЩА';
  }
  protected cardName(card: GameCardView): string {
    return this.localization.cardName(card);
  }
  protected cardDescription(card: GameCardView): string {
    return this.localization.cardDescription(card);
  }
  protected stageSummary(summary: string, cards: readonly GameCardView[]): string {
    return cards.reduce(
      (translated, card) => translated.replaceAll(card.name, this.cardName(card)),
      summary || 'Карточное действие',
    );
  }
  protected receiptLabel(receipt: StageCardReceipt): string {
    const count = receipt.hiddenCard?.count ?? receipt.cards.length;
    return `${this.playerName(receipt.entry.playerId ?? null)} получил ${this.treasureCountLabel(count)}`;
  }
  protected hiddenCardSummary(receipt: StageCardReceipt): string {
    const hiddenCard = receipt.hiddenCard;
    if (hiddenCard === undefined) return receipt.summary;
    if (receipt.entry.type === 'COMBAT_REWARD_CARDS') return this.receiptLabel(receipt);
    return `${this.playerName(receipt.entry.playerId ?? null)} получил ${this.hiddenCardTitle(
      hiddenCard.deck,
      hiddenCard.count,
    ).toLowerCase()}`;
  }
  private treasureCountLabel(count: number): string {
    const lastTwo = count % 100;
    const last = count % 10;
    const noun =
      lastTwo >= 11 && lastTwo <= 14
        ? 'сокровищ'
        : last === 1
          ? 'сокровище'
          : last >= 2 && last <= 4
            ? 'сокровища'
            : 'сокровищ';
    return `${count} ${noun}`;
  }
  protected hiddenCardTitle(deck: 'DOOR' | 'TREASURE', count: number): string {
    const deckName = deck === 'DOOR' ? 'ДВЕРИ' : 'СОКРОВИЩА';
    if (count === 1) return `КАРТА ${deckName}`;
    const lastTwo = count % 100;
    const last = count % 10;
    const noun =
      lastTwo >= 11 && lastTwo <= 14 ? 'КАРТ' : last >= 2 && last <= 4 ? 'КАРТЫ' : 'КАРТ';
    return `${count} ${noun} ${deck === 'DOOR' ? 'ДВЕРЕЙ' : 'СОКРОВИЩ'}`;
  }
  protected hiddenCardDescription(deck: 'DOOR' | 'TREASURE', count: number): string {
    const source = deck === 'DOOR' ? 'дверей' : 'сокровищ';
    return count === 1
      ? `Карта из колоды ${source} получена закрытой. Её знает только получивший игрок.`
      : `${count} карт из колоды ${source} получены закрытыми. Их знает только получивший игрок.`;
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
