import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  GameActionAck,
  GameClientCommand,
  GameView,
} from '@munchkin-lan/contracts';
import {
  createGame,
  createSeededRandomSource,
  executeCommand,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
  type GameCommand,
  type GameState,
} from '@munchkin-lan/game-engine';
import type { LobbyGamePlayer } from '../lobby/lobby.service';
import { createGameView } from './game-view';

@Injectable()
export class GameService {
  private readonly games = new Map<string, GameState>();

  startGame(
    roomCode: string,
    players: readonly LobbyGamePlayer[],
  ): GameActionAck {
    if (this.games.has(roomCode)) {
      return {
        success: false,
        error: {
          code: 'GAME_ALREADY_STARTED',
          message: 'The game has already started.',
        },
      };
    }
    let state = createGame({ id: parseGameId(roomCode) });
    const random = createSeededRandomSource(randomInt(0x1_0000_0000));
    for (const player of players) {
      const result = executeCommand(
        state,
        {
          type: 'ADD_PLAYER',
          actorId: parsePlayerId(player.playerId),
          name: player.name,
        },
        { random },
      );
      if (!result.success) return { success: false, error: result.error };
      state = result.state;
    }
    const firstPlayer = players[0];
    if (firstPlayer === undefined) {
      return {
        success: false,
        error: {
          code: 'NOT_ENOUGH_PLAYERS',
          message: 'The room has no players.',
        },
      };
    }
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: parsePlayerId(firstPlayer.playerId) },
      { random },
    );
    if (!started.success) return { success: false, error: started.error };
    this.games.set(roomCode, started.state);
    return { success: true };
  }

  rematch(
    roomCode: string,
    players: readonly LobbyGamePlayer[],
  ): GameActionAck {
    const current = this.games.get(roomCode);
    if (current?.status !== 'FINISHED') {
      return {
        success: false,
        error: {
          code: 'GAME_NOT_FINISHED',
          message: 'The game is not finished.',
        },
      };
    }
    this.games.delete(roomCode);
    const restarted = this.startGame(roomCode, players);
    if (!restarted.success) this.games.set(roomCode, current);
    return restarted;
  }

  removeFinishedGame(roomCode: string): GameActionAck {
    const current = this.games.get(roomCode);
    if (current?.status !== 'FINISHED') {
      return {
        success: false,
        error: {
          code: 'GAME_NOT_FINISHED',
          message: 'The game is not finished.',
        },
      };
    }
    this.games.delete(roomCode);
    return { success: true };
  }

  execute(
    roomCode: string,
    playerId: string,
    command: GameClientCommand,
  ): GameActionAck {
    const state = this.games.get(roomCode);
    if (state === undefined) {
      return {
        success: false,
        error: { code: 'GAME_NOT_FOUND', message: 'The game is not running.' },
      };
    }
    const actorId = parsePlayerId(playerId);
    if (
      (command.type === 'EQUIP_ITEM' ||
        command.type === 'UNEQUIP_ITEM' ||
        command.type === 'PLAY_CARD' ||
        command.type === 'PLAY_ROLE' ||
        command.type === 'PLAY_CURSE' ||
        command.type === 'TRADE_ITEM') &&
      (typeof command.cardId !== 'string' || command.cardId.trim().length === 0)
    ) {
      return {
        success: false,
        error: {
          code: 'CARD_NOT_IN_HAND',
          message: 'A valid card id is required.',
        },
      };
    }
    if (
      (command.type === 'PLAY_CURSE' &&
        (typeof command.targetPlayerId !== 'string' ||
          command.targetPlayerId.trim().length === 0)) ||
      (command.type === 'TRADE_ITEM' &&
        (typeof command.recipientId !== 'string' ||
          command.recipientId.trim().length === 0))
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_RECIPIENT',
          message: 'A valid recipient is required.',
        },
      };
    }
    if (
      (command.type === 'SELL_ITEMS' ||
        command.type === 'GIVE_CHARITY' ||
        command.type === 'RESOLVE_CARD_DISCARD') &&
      (!Array.isArray(command.cardIds) ||
        command.cardIds.some(
          (id) => typeof id !== 'string' || id.trim().length === 0,
        ))
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_CARD_SELECTION',
          message: 'Valid card ids are required.',
        },
      };
    }
    if (
      command.type === 'REQUEST_HELP' &&
      (typeof command.helperId !== 'string' ||
        command.helperId.trim().length === 0)
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_HELPER',
          message: 'A valid helper id is required.',
        },
      };
    }
    const domainCommand: GameCommand =
      command.type === 'PLAY_CARD'
        ? {
            type: command.type,
            actorId,
            cardId: parseCardInstanceId(command.cardId),
            target: { type: 'COMBAT', side: command.targetSide },
          }
        : command.type === 'PLAY_CURSE'
          ? {
              type: 'PLAY_CARD',
              actorId,
              cardId: parseCardInstanceId(command.cardId),
              target: {
                type: 'PLAYER',
                playerId: parsePlayerId(command.targetPlayerId),
              },
            }
          : command.type === 'REQUEST_HELP'
            ? {
                type: command.type,
                actorId,
                helperId: parsePlayerId(command.helperId),
              }
            : command.type === 'EQUIP_ITEM' ||
                command.type === 'UNEQUIP_ITEM' ||
                command.type === 'PLAY_ROLE'
              ? {
                  type: command.type,
                  actorId,
                  cardId: parseCardInstanceId(command.cardId),
                }
              : command.type === 'SELL_ITEMS'
                ? {
                    type: command.type,
                    actorId,
                    cardIds: command.cardIds.map(parseCardInstanceId),
                  }
                : command.type === 'RESOLVE_CARD_DISCARD'
                  ? {
                      type: command.type,
                      actorId,
                      cardIds: command.cardIds.map(parseCardInstanceId),
                    }
                  : command.type === 'TRADE_ITEM'
                    ? {
                        type: command.type,
                        actorId,
                        cardId: parseCardInstanceId(command.cardId),
                        recipientId: parsePlayerId(command.recipientId),
                      }
                    : command.type === 'GIVE_CHARITY'
                      ? {
                          type: command.type,
                          actorId,
                          cardIds: command.cardIds.map(parseCardInstanceId),
                          recipientId:
                            command.recipientId === null
                              ? null
                              : parsePlayerId(command.recipientId),
                        }
                      : command.type === 'GIVE_RANDOM_CHARITY'
                        ? { type: command.type, actorId }
                        : { type: command.type, actorId };
    const result = executeCommand(state, domainCommand, {
      random: createSeededRandomSource(randomInt(0x1_0000_0000)),
    });
    if (!result.success) return { success: false, error: result.error };
    this.games.set(roomCode, result.state);
    return { success: true };
  }

  getView(roomCode: string, playerId: string): GameView | null {
    const state = this.games.get(roomCode);
    return state === undefined
      ? null
      : createGameView(state, parsePlayerId(playerId));
  }
}
