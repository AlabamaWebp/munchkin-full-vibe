import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GameView } from '@munchkin-lan/contracts';
import type { ConnectionState } from './lobby-client';

@Component({
  selector: 'app-player-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hud">
      <div class="turn-line">
        <div>
          <strong>{{
            game().activePlayerId === game().viewerPlayerId ? 'Ваш ход' : 'Бой: ' + activeName()
          }}</strong>
          <span>Ход {{ game().turnNumber }} · {{ phaseLabel() }}</span>
        </div>
        @if (connection() !== 'CONNECTED') {
          <span class="warning" role="status">Нет связи</span>
        }
        <button type="button" aria-label="Открыть меню" (click)="menuOpened.emit()">☰</button>
        <button type="button" aria-label="Открыть историю игры" (click)="historyOpened.emit()">
          ↶
        </button>
      </div>
      <div class="players">
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
            <span class="avatar" aria-hidden="true">{{ player.name.charAt(0).toUpperCase() }}</span>
            <span class="name">{{ player.name }}</span>
            <small>ур. {{ player.level }} · {{ player.handCount }} карт</small>
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
      gap: 0.3rem;
      min-width: 0;
    }
    .turn-line {
      display: flex;
      min-height: 3rem;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .turn-line > div {
      display: grid;
      min-width: 0;
      min-height: 3rem;
      padding: 0.35rem 0.8rem 0.42rem;
      flex: 1;
      border: 1px solid #a77a35;
      border-radius: 0.75rem 0.75rem 1.1rem 1.1rem;
      background: linear-gradient(100deg, rgba(28, 78, 39, 0.97), rgba(10, 43, 23, 0.97));
      box-shadow:
        inset 0 1px rgba(255, 223, 135, 0.22),
        0 0.25rem 0.65rem rgba(0, 0, 0, 0.45);
      text-align: center;
      order: 2;
    }
    strong {
      overflow: hidden;
      font:
        800 1.28rem/1.05 Georgia,
        serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .turn-line span {
      color: #dac78e;
      font-size: 0.72rem;
    }
    .turn-line button {
      width: 2.75rem;
      min-width: 2.75rem;
      min-height: 2.75rem;
      border: 1px solid #886233;
      border-radius: 0.7rem;
      color: #f5f8f6;
      background: linear-gradient(145deg, #332b20, #11120f);
    }
    .turn-line button[aria-label='Открыть меню'] {
      order: 1;
    }
    .turn-line button[aria-label='Открыть историю игры'] {
      order: 3;
    }
    .warning {
      padding: 0.25rem 0.45rem;
      border-radius: 999px;
      color: #ffd6bf !important;
      background: #7a3525;
    }
    .players {
      display: flex;
      gap: 0;
      min-width: 0;
      overflow-x: auto;
      scroll-snap-type: x proximity;
    }
    .player {
      display: grid;
      min-width: 0;
      min-height: 3.3rem;
      padding: 0.35rem 0.5rem;
      grid-template-columns: 2.35rem minmax(0, 1fr);
      grid-template-rows: 1fr 1fr;
      column-gap: 0.35rem;
      text-align: left;
      scroll-snap-align: start;
      border: 1px solid #846337;
      flex: 1 1 50%;
      border-radius: 0;
      color: #eef4ef;
      background: linear-gradient(105deg, rgba(22, 17, 12, 0.94), rgba(52, 35, 21, 0.9));
    }
    .player:first-child {
      border-radius: 0.8rem 0 0 0.8rem;
    }
    .player:last-child {
      border-radius: 0 0.8rem 0.8rem 0;
    }
    .players:has(.player:nth-child(3)) {
      gap: 0.2rem;
    }
    .players:has(.player:nth-child(3)) .player {
      min-width: 11.1rem;
      flex-basis: 11.1rem;
      border-radius: 0.8rem;
    }
    .player.active {
      border-color: #e5bd62;
      box-shadow:
        inset 0 -2px #e5bd62,
        0 0.15rem 0.5rem rgba(0, 0, 0, 0.4);
    }
    .player.self {
      background: linear-gradient(105deg, #273924, #172318);
    }
    .player.dead {
      opacity: 0.65;
    }
    .avatar {
      display: grid;
      width: 2.05rem;
      height: 2.05rem;
      grid-row: 1 / -1;
      place-items: center;
      border-radius: 50%;
      color: #142019;
      background: radial-gradient(circle at 35% 30%, #e0b660, #66411d 60%, #21140c);
      font-size: 1rem;
      font-weight: 900;
    }
    .name {
      display: block;
      width: 100%;
      overflow: hidden;
      font:
        800 0.74rem/1.05 Georgia,
        serif;
      font-weight: 750;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      color: #b9aa91;
      color: #d2b984;
      font-size: 0.68rem;
      white-space: nowrap;
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
  readonly playerOpened = output<string>();
  readonly menuOpened = output<void>();
  readonly historyOpened = output<void>();

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
