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
          <strong>{{ activeName() }}</strong>
          <span>Ход {{ game().turnNumber }} · {{ phaseLabel() }}</span>
        </div>
        @if (connection() !== 'CONNECTED') {
          <span class="warning" role="status">Нет связи</span>
        }
        <button type="button" aria-label="Открыть меню" (click)="menuOpened.emit()">•••</button>
      </div>
      <div class="players" [style.--player-count]="game().players.length">
        @for (player of game().players; track player.playerId) {
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
            <b>ур. {{ player.level }}</b>
            <small
              >{{ player.handCount }}🂠
              @if (player.playerId === game().viewerPlayerId) {
                · ВЫ
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
      gap: 0.35rem;
      min-width: 0;
    }
    .turn-line {
      display: flex;
      min-height: 2.8rem;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .turn-line > div {
      display: grid;
      min-width: 0;
    }
    strong {
      overflow: hidden;
      font:
        800 1rem/1.05 Georgia,
        serif;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .turn-line span {
      color: #b7c3ba;
      font-size: 0.68rem;
    }
    .turn-line button {
      width: 2.75rem;
      min-width: 2.75rem;
      min-height: 2.75rem;
      border: 1px solid #536359;
      border-radius: 999px;
      color: #f5f8f6;
      background: #19251e;
    }
    .warning {
      padding: 0.25rem 0.45rem;
      border-radius: 999px;
      color: #ffd6bf !important;
      background: #7a3525;
    }
    .players {
      display: grid;
      grid-template-columns: repeat(var(--player-count), minmax(0, 1fr));
      gap: 0.2rem;
      min-width: 0;
      overflow: hidden;
    }
    .player {
      display: grid;
      min-width: 0;
      min-height: 3.7rem;
      padding: 0.25rem 0.12rem;
      place-items: center;
      gap: 0.05rem;
      border: 1px solid #34483c;
      border-radius: 0.55rem;
      color: #eef4ef;
      background: rgba(19, 31, 24, 0.9);
    }
    .player.active {
      border-color: #e5bd62;
      box-shadow: inset 0 -2px #e5bd62;
    }
    .player.self {
      background: #20392a;
    }
    .player.dead {
      opacity: 0.65;
    }
    .avatar {
      display: grid;
      width: 1.3rem;
      height: 1.3rem;
      place-items: center;
      border-radius: 50%;
      color: #142019;
      background: #b4d3bd;
      font-size: 0.65rem;
      font-weight: 900;
    }
    .name {
      display: block;
      width: 100%;
      overflow: hidden;
      font-size: clamp(0.55rem, 2.2vw, 0.7rem);
      font-weight: 750;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    b,
    small {
      font-size: 0.54rem;
      white-space: nowrap;
    }
    small {
      color: #aebbb2;
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
