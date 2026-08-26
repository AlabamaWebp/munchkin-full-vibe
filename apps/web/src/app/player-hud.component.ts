import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GameView } from '@munchkin-lan/contracts';
import type { ConnectionState } from './lobby-client';

@Component({
  selector: 'app-player-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hud">
      <div class="turn-line">
        <button
          type="button"
          class="icon-button"
          aria-label="Открыть меню"
          (click)="menuOpened.emit()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div class="turn-context">
          <strong>{{
            game().activePlayerId === game().viewerPlayerId ? 'Ваш ход' : 'Ходит ' + activeName()
          }}</strong>
          <span>Ход {{ game().turnNumber }} · {{ phaseLabel() }}</span>
          @if (connection() !== 'CONNECTED') {
            <span class="warning" role="status">Нет связи</span>
          }
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="Открыть историю"
          (click)="historyOpened.emit()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 7v5l3 2" />
            <path d="M5.6 9.2A7.2 7.2 0 1 1 5 14" />
            <path d="M5.5 5.5v3.7h3.7" />
          </svg>
        </button>
        @if (fullscreenSupported()) {
          <button
            type="button"
            class="icon-button fullscreen-button"
            [class.active]="fullscreen()"
            aria-label="Переключить полноэкранный режим"
            (click)="fullscreenOpened.emit()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4H4v4m12-4h4v4M8 20H4v-4m12 4h4v-4" />
            </svg>
          </button>
        }
      </div>
      <div class="players" [class.solo]="game().players.length === 1">
        @for (player of orderedPlayers(); track player.playerId) {
          <button
            type="button"
            class="player"
            [class.active]="player.playerId === game().activePlayerId"
            [class.self]="player.playerId === game().viewerPlayerId"
            [class.dead]="player.isDead"
            [attr.aria-label]="player.name + ', уровень ' + player.level"
            (click)="playerOpened.emit(player.playerId)"
          >
            <span
              class="avatar"
              [class]="'avatar player-color-' + (player.color?.toLowerCase() ?? 'default')"
              aria-hidden="true"
              >{{ player.name.charAt(0).toUpperCase() }}</span
            >
            <span class="name">{{ player.name }}</span>
            <small>
              ур. {{ player.level }} · {{ player.handCount }} карт
              @if (player.playerId === game().activePlayerId) {
                <b class="player-state">· ход</b>
              } @else if (player.playerId === game().viewerPlayerId) {
                <b class="player-state">· вы</b>
              } @else if (player.isDead) {
                <b class="player-state">· мёртв</b>
              }
            </small>
          </button>
        }
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .hud {
      display: grid;
      height: 100%;
      min-height: 0;
      grid-template-rows: 2.75rem minmax(0, 1fr);
      gap: 0.2rem;
      min-width: 0;
    }
    .turn-line {
      display: grid;
      min-height: 2.75rem;
      grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem auto;
      align-items: stretch;
      gap: 0.25rem;
      padding: 0.12rem;
      border: 1px solid rgba(110, 79, 39, 0.62);
      border-radius: 0.82rem;
      background: linear-gradient(180deg, rgba(28, 20, 13, 0.94), rgba(13, 10, 7, 0.96));
      box-shadow:
        inset 0 1px rgba(255, 220, 149, 0.13),
        0 0.25rem 0.7rem rgba(0, 0, 0, 0.25);
    }
    .turn-line:not(:has(.fullscreen-button)) {
      grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
    }
    .turn-context {
      display: grid;
      min-width: 0;
      min-height: 2.75rem;
      padding: 0.24rem 0.55rem;
      align-content: center;
      border: 1px solid rgba(115, 157, 115, 0.52);
      border-radius: 0.62rem;
      background: linear-gradient(100deg, rgba(24, 70, 42, 0.96), rgba(15, 40, 27, 0.96));
      box-shadow: inset 0 1px var(--tabletop-highlight);
      text-align: center;
    }
    strong {
      overflow: hidden;
      font:
        800 1.04rem/1.05 Georgia,
        serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .turn-line span {
      color: #e4d2a5;
      font-family: var(--ui-sans);
      font-size: 0.72rem;
      font-weight: 650;
    }
    .turn-line button {
      width: 2.75rem;
      min-width: 2.75rem;
      min-height: 2.75rem;
      padding: 0;
      border: 1px solid rgba(141, 99, 46, 0.6);
      border-radius: 0.62rem;
      color: #f5f8f6;
      background: rgba(59, 40, 22, 0.8);
      box-shadow: inset 0 1px rgba(255, 220, 149, 0.12);
    }
    .icon-button svg {
      width: 1.1rem;
      height: 1.1rem;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-width: 1.8;
    }
    .fullscreen-button {
      grid-column: 4;
    }
    .warning {
      padding: 0.25rem 0.45rem;
      border-radius: 999px;
      color: #ffd6bf !important;
      background: #7a3525;
    }
    .players {
      display: grid;
      grid-auto-columns: minmax(8.5rem, 1fr);
      grid-auto-flow: column;
      min-width: 0;
      min-height: 0;
      height: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x proximity;
      scrollbar-width: thin;
    }
    .players.solo {
      display: flex;
      align-items: stretch;
    }
    .players.solo .player {
      width: min(12rem, 100%);
      flex: 0 0 min(12rem, 100%);
      background: transparent;
    }
    .players.solo .player.self {
      background: transparent;
    }
    .player {
      display: grid;
      min-width: 0;
      min-height: 0;
      height: 100%;
      box-sizing: border-box;
      min-height: 2.75rem;
      padding: 0.2rem 0.35rem;
      grid-template-columns: 1.8rem minmax(0, 1fr);
      grid-template-rows: 1fr 1fr;
      column-gap: 0.35rem;
      text-align: left;
      border: 0;
      border-radius: 0.55rem;
      color: #eef4ef;
      background: rgba(23, 18, 13, 0.66);
      scroll-snap-align: start;
    }
    .player.active {
      box-shadow: inset 2px 0 #e5bd62;
    }
    .player.self {
      background: linear-gradient(105deg, #51351f, #25170e);
    }
    .player.dead {
      opacity: 0.65;
    }
    .avatar {
      display: grid;
      width: 1.55rem;
      height: 1.55rem;
      grid-row: 1 / -1;
      place-items: center;
      border-radius: 50%;
      border: 2px solid #e0b660;
      color: #2b1b0d;
      background: radial-gradient(circle at 35% 30%, #e0b660, #66411d 60%, #21140c);
      font-size: 0.75rem;
      font-weight: 900;
    }
    .player-color-pink {
      --player-color: #ee78ab;
    }
    .player-color-blue {
      --player-color: #4d9de0;
    }
    .player-color-red {
      --player-color: #e15151;
    }
    .player-color-yellow {
      --player-color: #f0c84b;
    }
    .player-color-green {
      --player-color: #59ad70;
    }
    .player-color-black {
      --player-color: #101010;
    }
    .avatar.player-color-pink,
    .avatar.player-color-blue,
    .avatar.player-color-red,
    .avatar.player-color-yellow,
    .avatar.player-color-green,
    .avatar.player-color-black {
      border-color: var(--player-color);
    }
    .name {
      display: block;
      width: 100%;
      overflow: hidden;
      font: 750 0.75rem/1.05 var(--ui-sans);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      display: block;
      overflow: hidden;
      color: #b9aa91;
      color: #d2b984;
      font-family: var(--ui-sans);
      font-size: 0.68rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .player-state {
      color: #f0cf7b;
      font-weight: 850;
    }
    button:focus-visible {
      outline: 3px solid #fff2a8;
      outline-offset: 2px;
    }
  `,
})
export class PlayerHudComponent {
  readonly game = input.required<GameView>();
  readonly connection = input.required<ConnectionState>();
  readonly fullscreenSupported = input(false);
  readonly fullscreen = input(false);
  readonly playerOpened = output<string>();
  readonly menuOpened = output<void>();
  readonly historyOpened = output<void>();
  readonly fullscreenOpened = output<void>();

  protected orderedPlayers() {
    const combat = this.game().combat;
    const preferred = [combat?.playerId, combat?.helperId].filter((id): id is string => !!id);
    return [...this.game().players].sort((left, right) => {
      const leftIndex = preferred.indexOf(left.playerId),
        rightIndex = preferred.indexOf(right.playerId);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });
  }

  protected activeName(): string {
    return (
      this.game().players.find((player) => player.playerId === this.game().activePlayerId)?.name ??
      '—'
    );
  }

  protected phaseLabel(): string {
    const labels = {
      LOBBY: 'ожидание',
      TURN_START: 'начало хода',
      KICK_DOOR: 'дверь',
      DOOR_RESOLUTION: 'результат двери',
      POST_DOOR: 'выбор',
      LOOT_ROOM: 'добыча',
      END_TURN: 'завершение',
      FINISHED: 'конец игры',
    } as const;
    return labels[this.game().phase];
  }
}
