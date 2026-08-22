import { randomInt } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  GameActionAck,
  GameClientCommand,
  GameView,
} from '@munchkin-lan/contracts';
import {
  createGame,
  createSeededRandomSource,
  executeCommand,
  getNextDeadlineEpochMs,
  processExpiredState,
  parseCardInstanceId,
  parseCombatId,
  parseCurseResponseId,
  parseEncounterId,
  parseGameId,
  parseHelpOfferId,
  parsePendingDecisionId,
  parsePlayerId,
  type GameCommand,
  type GameState,
  type Clock,
} from '@munchkin-lan/game-engine';
import type { LobbyGamePlayer } from '../lobby/lobby.service';
import { createGameView } from './game-view';

export const GAME_CLOCK = Symbol('GAME_CLOCK');
export const SYSTEM_GAME_CLOCK: Clock = { now: () => Date.now() };

@Injectable()
export class GameService {
  private readonly games = new Map<string, GameState>();
  private readonly deadlineTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private deadlineListener: ((roomCode: string) => void) | null = null;

  constructor(
    @Optional()
    @Inject(GAME_CLOCK)
    private readonly clock: Clock = SYSTEM_GAME_CLOCK,
  ) {}

  setDeadlineListener(listener: (roomCode: string) => void): void {
    this.deadlineListener = listener;
  }

  startGame(
    roomCode: string,
    players: readonly LobbyGamePlayer[],
    config?: GameState['config'],
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
    let state = createGame({ id: parseGameId(roomCode), config });
    const random = createSeededRandomSource(randomInt(0x1_0000_0000));
    for (const player of players) {
      const result = executeCommand(
        state,
        {
          type: 'ADD_PLAYER',
          actorId: parsePlayerId(player.playerId),
          name: player.name,
          sex: player.sex,
        },
        { random, clock: this.clock },
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
      { random, clock: this.clock },
    );
    if (!started.success) return { success: false, error: started.error };
    this.games.set(roomCode, started.state);
    this.scheduleNextDeadline(roomCode);
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
    this.clearDeadline(roomCode);
    const restarted = this.startGame(roomCode, players);
    if (!restarted.success) {
      this.games.set(roomCode, current);
      this.scheduleNextDeadline(roomCode);
    }
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
    this.clearDeadline(roomCode);
    return { success: true };
  }

  execute(
    roomCode: string,
    playerId: string,
    command: GameClientCommand,
  ): GameActionAck {
    this.processDeadlines(roomCode, false);
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
        command.type === 'LOOK_FOR_TROUBLE' ||
        command.type === 'PLAY_CARD' ||
        command.type === 'PLAY_COMBAT_CURSE' ||
        command.type === 'PLAY_ROLE' ||
        command.type === 'PLAY_ROLE_PERMISSION' ||
        command.type === 'DISCARD_ROLE_PERMISSION' ||
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
      ((command.type === 'PLAY_CURSE' ||
        command.type === 'PLAY_COMBAT_CURSE') &&
        (typeof command.targetPlayerId !== 'string' ||
          command.targetPlayerId.trim().length === 0)) ||
      (command.type === 'TRADE_ITEM' &&
        (typeof command.recipientId !== 'string' ||
          command.recipientId.trim().length === 0)) ||
      (command.type === 'GIVE_CHARITY' &&
        command.recipientId !== null &&
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
      ((command.type === 'COUNTER_HELP' ||
        command.type === 'ACCEPT_HELP_OFFER' ||
        command.type === 'REJECT_HELP_OFFER' ||
        command.type === 'CANCEL_HELP_OFFER') &&
        (typeof command.offerId !== 'string' ||
          command.offerId.trim().length === 0)) ||
      ((command.type === 'RESOLVE_CARD_DISCARD' ||
        command.type === 'RESOLVE_ROLE_RETENTION') &&
        (typeof command.decisionId !== 'string' ||
          command.decisionId.trim().length === 0)) ||
      (command.type === 'RESOLVE_ROLE_RETENTION' &&
        (typeof command.keepCardId !== 'string' ||
          command.keepCardId.trim().length === 0)) ||
      (command.type === 'PLAY_ROLE' &&
        command.replaceCardId !== undefined &&
        (typeof command.replaceCardId !== 'string' ||
          command.replaceCardId.trim().length === 0)) ||
      (command.type === 'RESPOND_TO_CURSE' &&
        (typeof command.responseId !== 'string' ||
          command.responseId.trim().length === 0))
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_CARD_SELECTION',
          message: 'A valid stable action id is required.',
        },
      };
    }
    if (
      command.type === 'PROPOSE_HELP' &&
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
    if (
      (command.type === 'PROPOSE_HELP' || command.type === 'COUNTER_HELP') &&
      (!Number.isSafeInteger(command.treasureCount) ||
        command.treasureCount < 0)
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_CARD_SELECTION',
          message: 'A valid Treasure count is required.',
        },
      };
    }
    if (
      (command.type === 'PROPOSE_HELP' ||
        command.type === 'COUNTER_HELP' ||
        command.type === 'ACCEPT_HELP_OFFER' ||
        command.type === 'REJECT_HELP_OFFER' ||
        command.type === 'CANCEL_HELP_OFFER' ||
        command.type === 'PASS_COMBAT_REACTION' ||
        command.type === 'PLAY_COMBAT_CURSE' ||
        command.type === 'RUN_AWAY') &&
      (!Number.isSafeInteger(command.combatRevision) ||
        command.combatRevision < 1)
    ) {
      return {
        success: false,
        error: {
          code: 'STALE_COMBAT_STATE',
          message: 'A valid combat revision is required.',
        },
      };
    }
    if (
      (command.type === 'PLAY_COMBAT_CURSE' ||
        command.type === 'PROPOSE_HELP' ||
        command.type === 'COUNTER_HELP' ||
        command.type === 'ACCEPT_HELP_OFFER' ||
        command.type === 'REJECT_HELP_OFFER' ||
        command.type === 'CANCEL_HELP_OFFER' ||
        command.type === 'DECLARE_COMBAT_VICTORY' ||
        command.type === 'PASS_COMBAT_REACTION' ||
        command.type === 'RUN_AWAY') &&
      (typeof command.combatId !== 'string' ||
        command.combatId.trim().length === 0)
    ) {
      return {
        success: false,
        error: {
          code: 'STALE_COMBAT_STATE',
          message: 'A valid combat id is required.',
        },
      };
    }
    if (command.type === 'PLAY_CARD') {
      const target = command.target;
      const validTarget =
        target?.type === 'SELF' ||
        target?.type === 'PLAYERS' ||
        (target?.type === 'MONSTER' &&
          typeof target.encounterId === 'string' &&
          target.encounterId.trim().length > 0) ||
        (target?.type === 'HAND_MONSTER' &&
          typeof target.monsterCardId === 'string' &&
          target.monsterCardId.trim().length > 0) ||
        (target?.type === 'EQUIPMENT' &&
          typeof target.cardId === 'string' &&
          target.cardId.trim().length > 0);
      if (!validTarget) {
        return {
          success: false,
          error: {
            code: 'INVALID_TARGET',
            message: 'A valid typed combat target is required.',
          },
        };
      }
      if (
        (command.combatId === undefined) !==
          (command.combatRevision === undefined) ||
        (command.combatId !== undefined &&
          (command.combatId.trim().length === 0 ||
            !Number.isSafeInteger(command.combatRevision) ||
            command.combatRevision! < 1))
      ) {
        return {
          success: false,
          error: {
            code: 'STALE_COMBAT_STATE',
            message: 'A complete combat address is required.',
          },
        };
      }
      if (
        state.combat !== null &&
        (command.combatId === undefined || command.combatRevision === undefined)
      ) {
        return {
          success: false,
          error: {
            code: 'STALE_COMBAT_STATE',
            message: 'A combat card requires the current combat address.',
          },
        };
      }
    }
    if (
      command.type === 'RESOLVE_CARD_DISCARD' &&
      state.pendingDecision?.type === 'DISCARD_CARDS' &&
      state.pendingDecision.completion.type === 'RUN_AWAY' &&
      (command.combatId === undefined || command.combatRevision === undefined)
    ) {
      return {
        success: false,
        error: {
          code: 'STALE_COMBAT_STATE',
          message: 'A combat decision requires the current combat address.',
        },
      };
    }
    if (
      command.type === 'DECLARE_COMBAT_VICTORY' &&
      (!Number.isSafeInteger(command.combatRevision) ||
        command.combatRevision < 1)
    ) {
      return {
        success: false,
        error: {
          code: 'STALE_COMBAT_STATE',
          message: 'A valid combat revision is required.',
        },
      };
    }
    if (
      (command.type === 'PASS_COMBAT_REACTION' &&
        (!Number.isSafeInteger(command.reactionWindowId) ||
          command.reactionWindowId < 1)) ||
      (command.type === 'PLAY_COMBAT_CURSE' &&
        (!Number.isSafeInteger(command.reactionWindowId) ||
          command.reactionWindowId < 1)) ||
      (command.type === 'PLAY_CARD' &&
        command.reactionWindowId !== undefined &&
        (!Number.isSafeInteger(command.reactionWindowId) ||
          command.reactionWindowId < 1))
    ) {
      return {
        success: false,
        error: {
          code: 'STALE_COMBAT_REACTION',
          message: 'A valid combat reaction window is required.',
        },
      };
    }
    const domainCommand: GameCommand =
      command.type === 'PLAY_CARD'
        ? {
            type: command.type,
            actorId,
            cardId: parseCardInstanceId(command.cardId),
            target:
              command.target.type === 'SELF'
                ? { type: 'PLAYER', playerId: actorId }
                : command.target.type === 'PLAYERS'
                  ? { type: 'COMBAT', side: 'PLAYERS' }
                  : command.target.type === 'MONSTER'
                    ? {
                        type: 'COMBAT',
                        side: 'MONSTER',
                        encounterId: parseEncounterId(
                          command.target.encounterId,
                        ),
                      }
                    : command.target.type === 'HAND_MONSTER'
                      ? {
                          type: 'HAND_MONSTER',
                          cardId: parseCardInstanceId(
                            command.target.monsterCardId,
                          ),
                        }
                      : {
                          type: 'EQUIPMENT',
                          cardId: parseCardInstanceId(command.target.cardId),
                        },
            ...(command.reactionWindowId === undefined
              ? {}
              : { reactionWindowId: command.reactionWindowId }),
            ...(command.combatId === undefined
              ? {}
              : {
                  combatId: parseCombatId(command.combatId),
                  combatRevision: command.combatRevision,
                }),
          }
        : command.type === 'PLAY_COMBAT_CURSE'
          ? {
              type: 'PLAY_CARD',
              actorId,
              cardId: parseCardInstanceId(command.cardId),
              target: {
                type: 'PLAYER',
                playerId: parsePlayerId(command.targetPlayerId),
              },
              reactionWindowId: command.reactionWindowId,
              combatId: parseCombatId(command.combatId),
              combatRevision: command.combatRevision,
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
            : command.type === 'PROPOSE_HELP'
              ? {
                  type: command.type,
                  actorId,
                  helperId: parsePlayerId(command.helperId),
                  treasureCount: command.treasureCount,
                  combatId: parseCombatId(command.combatId),
                  combatRevision: command.combatRevision,
                }
              : command.type === 'COUNTER_HELP'
                ? {
                    type: command.type,
                    actorId,
                    offerId: parseHelpOfferId(command.offerId),
                    treasureCount: command.treasureCount,
                    combatId: parseCombatId(command.combatId),
                    combatRevision: command.combatRevision,
                  }
                : command.type === 'ACCEPT_HELP_OFFER' ||
                    command.type === 'REJECT_HELP_OFFER' ||
                    command.type === 'CANCEL_HELP_OFFER'
                  ? {
                      type: command.type,
                      actorId,
                      offerId: parseHelpOfferId(command.offerId),
                      combatId: parseCombatId(command.combatId),
                      combatRevision: command.combatRevision,
                    }
                  : command.type === 'LOOK_FOR_TROUBLE'
                    ? {
                        type: command.type,
                        actorId,
                        cardId: parseCardInstanceId(command.cardId),
                      }
                    : command.type === 'EQUIP_ITEM' ||
                        command.type === 'UNEQUIP_ITEM' ||
                        command.type === 'PLAY_ROLE_PERMISSION' ||
                        command.type === 'DISCARD_ROLE_PERMISSION'
                      ? {
                          type: command.type,
                          actorId,
                          cardId: parseCardInstanceId(command.cardId),
                        }
                      : command.type === 'PLAY_ROLE'
                        ? {
                            type: command.type,
                            actorId,
                            cardId: parseCardInstanceId(command.cardId),
                            ...(command.replaceCardId === undefined
                              ? {}
                              : {
                                  replaceCardId: parseCardInstanceId(
                                    command.replaceCardId,
                                  ),
                                }),
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
                                cardIds:
                                  command.cardIds.map(parseCardInstanceId),
                                decisionId: parsePendingDecisionId(
                                  command.decisionId,
                                ),
                                ...(command.combatId === undefined
                                  ? {}
                                  : {
                                      combatId: parseCombatId(command.combatId),
                                      combatRevision: command.combatRevision,
                                    }),
                              }
                            : command.type === 'RESOLVE_ROLE_RETENTION'
                              ? {
                                  type: command.type,
                                  actorId,
                                  decisionId: parsePendingDecisionId(
                                    command.decisionId,
                                  ),
                                  keepCardId: parseCardInstanceId(
                                    command.keepCardId,
                                  ),
                                }
                              : command.type === 'TRADE_ITEM'
                                ? {
                                    type: command.type,
                                    actorId,
                                    cardId: parseCardInstanceId(command.cardId),
                                    recipientId: parsePlayerId(
                                      command.recipientId,
                                    ),
                                  }
                                : command.type === 'GIVE_CHARITY'
                                  ? {
                                      type: command.type,
                                      actorId,
                                      cardIds:
                                        command.cardIds.map(
                                          parseCardInstanceId,
                                        ),
                                      recipientId:
                                        command.recipientId === null
                                          ? null
                                          : parsePlayerId(command.recipientId),
                                    }
                                  : command.type === 'GIVE_RANDOM_CHARITY'
                                    ? { type: command.type, actorId }
                                    : command.type === 'RESPOND_TO_CURSE'
                                      ? {
                                          type: command.type,
                                          actorId,
                                          responseId: parseCurseResponseId(
                                            command.responseId,
                                          ),
                                          response:
                                            command.response.type === 'DECLINE'
                                              ? command.response
                                              : {
                                                  type: 'USE_PROTECTION',
                                                  cardId: parseCardInstanceId(
                                                    command.response.cardId,
                                                  ),
                                                  ...(command.response
                                                    .protectedCardId ===
                                                  undefined
                                                    ? {}
                                                    : {
                                                        protectedCardId:
                                                          parseCardInstanceId(
                                                            command.response
                                                              .protectedCardId,
                                                          ),
                                                      }),
                                                },
                                        }
                                      : command.type ===
                                          'DECLARE_COMBAT_VICTORY'
                                        ? {
                                            type: command.type,
                                            actorId,
                                            combatId: parseCombatId(
                                              command.combatId,
                                            ),
                                            combatRevision:
                                              command.combatRevision,
                                          }
                                        : command.type ===
                                            'PASS_COMBAT_REACTION'
                                          ? {
                                              type: command.type,
                                              actorId,
                                              combatId: parseCombatId(
                                                command.combatId,
                                              ),
                                              combatRevision:
                                                command.combatRevision,
                                              reactionWindowId:
                                                command.reactionWindowId,
                                            }
                                          : command.type === 'RUN_AWAY'
                                            ? {
                                                type: command.type,
                                                actorId,
                                                combatId: parseCombatId(
                                                  command.combatId,
                                                ),
                                                combatRevision:
                                                  command.combatRevision,
                                              }
                                            : { type: command.type, actorId };
    const result = executeCommand(state, domainCommand, {
      random: createSeededRandomSource(randomInt(0x1_0000_0000)),
      clock: this.clock,
    });
    if (!result.success) return { success: false, error: result.error };
    this.games.set(roomCode, result.state);
    this.scheduleNextDeadline(roomCode);
    return { success: true };
  }

  getView(roomCode: string, playerId: string): GameView | null {
    this.processDeadlines(roomCode, false);
    const state = this.games.get(roomCode);
    return state === undefined
      ? null
      : createGameView(state, parsePlayerId(playerId));
  }

  processDeadlines(roomCode: string, notify = true): boolean {
    const state = this.games.get(roomCode);
    if (state === undefined) return false;
    const result = processExpiredState(state, {
      random: createSeededRandomSource(randomInt(0x1_0000_0000)),
      clock: this.clock,
    });
    if (!result.success || result.state === state) {
      this.scheduleNextDeadline(roomCode);
      return false;
    }
    this.games.set(roomCode, result.state);
    this.scheduleNextDeadline(roomCode);
    if (notify) this.deadlineListener?.(roomCode);
    return true;
  }

  private scheduleNextDeadline(roomCode: string): void {
    this.clearDeadline(roomCode);
    const state = this.games.get(roomCode);
    if (state === undefined) return;
    const deadline = getNextDeadlineEpochMs(state);
    if (deadline === null) return;
    const timer = setTimeout(
      () => this.processDeadlines(roomCode),
      Math.max(0, deadline - this.clock.now()),
    );
    timer.unref?.();
    this.deadlineTimers.set(roomCode, timer);
  }

  private clearDeadline(roomCode: string): void {
    const timer = this.deadlineTimers.get(roomCode);
    if (timer !== undefined) clearTimeout(timer);
    this.deadlineTimers.delete(roomCode);
  }
}
