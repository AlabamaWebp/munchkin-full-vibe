import type {
  GameCardView,
  GameLogEntryView,
  GameView,
} from '@munchkin-lan/contracts';

export type GameStageKind =
  | 'TURN_READY'
  | 'DOOR_REVEAL'
  | 'POST_DOOR_CHOICE'
  | 'COMBAT_OPEN'
  | 'COMBAT_REACTION'
  | 'RUN_AWAY_SEQUENCE'
  | 'BLOCKING_DECISION'
  | 'TURN_CLEANUP'
  | 'FINISHED';

export interface PresentedEvent {
  readonly entry: GameLogEntryView;
  readonly priority: 'BLOCKING' | 'IMPORTANT' | 'ROUTINE';
  readonly summary: string;
}

/**
 * A public or viewer-private card event that belongs to the phase and turn
 * currently shown on the table. Event entries are stamped by the server, so
 * this deliberately disappears as soon as play advances.
 */
export interface StageCardEvent {
  readonly entry: GameLogEntryView;
  readonly cards: readonly GameCardView[];
  readonly hiddenCard: GameLogEntryView['hiddenCard'];
  readonly summary: string;
  readonly receipts: readonly StageCardReceipt[];
}

export interface StageCardReceipt {
  readonly entry: GameLogEntryView;
  readonly cards: readonly GameCardView[];
  readonly hiddenCard: GameLogEntryView['hiddenCard'];
  readonly summary: string;
}

export function selectStage(game: GameView): GameStageKind {
  if (game.status === 'FINISHED' || game.phase === 'FINISHED') return 'FINISHED';
  if (game.combat?.reactionWindow !== null && game.combat?.reactionWindow !== undefined)
    return 'COMBAT_REACTION';
  if (game.combat !== null) return 'COMBAT_OPEN';
  if (game.pendingDecision !== null || game.curseResponse !== null) return 'BLOCKING_DECISION';
  if (game.lastRunAwayResult !== null) return 'RUN_AWAY_SEQUENCE';
  if (game.phase === 'TURN_START' || game.phase === 'KICK_DOOR') return 'TURN_READY';
  if (game.phase === 'DOOR_RESOLUTION') return 'DOOR_REVEAL';
  if (game.phase === 'POST_DOOR' || game.phase === 'LOOT_ROOM') return 'POST_DOOR_CHOICE';
  return 'TURN_CLEANUP';
}

export function latestStageCardEvent(game: GameView): StageCardEvent | null {
  const entry = [...game.gameLog]
    .reverse()
    .find(
      (candidate) =>
        candidate.phase === game.phase &&
        candidate.turnNumber === game.turnNumber &&
        candidate.type !== 'CARDS_DEALT' &&
        (candidate.card !== undefined ||
          (candidate.cards?.length ?? 0) > 0 ||
          candidate.hiddenCard !== undefined),
    );
  if (entry === undefined) return null;

  const receipt = (candidate: GameLogEntryView): StageCardReceipt => ({
    entry: candidate,
    cards: candidate.cards ?? (candidate.card === undefined ? [] : [candidate.card]),
    hiddenCard: candidate.hiddenCard,
    summary: eventSummary(game, candidate),
  });
  const receipts =
    entry.type === 'COMBAT_REWARD_CARDS'
      ? game.gameLog
          .filter(
            (candidate) =>
              candidate.type === 'COMBAT_REWARD_CARDS' &&
              candidate.phase === game.phase &&
              candidate.turnNumber === game.turnNumber,
          )
          .map(receipt)
      : [receipt(entry)];
  const latestReceipt = receipt(entry);
  return { ...latestReceipt, receipts };
}

export function presentEvents(game: GameView): readonly PresentedEvent[] {
  return [
    ...(game.presentation.blocking === null ? [] : [game.presentation.blocking]),
    ...game.presentation.important,
    ...game.presentation.routine,
  ]
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.sequence === entry.sequence) === index,
    )
    .sort((left, right) => left.sequence - right.sequence)
    .map((entry) => ({
      entry,
      priority: entry.priority,
      summary: eventSummary(game, entry),
    }))
    .filter((event) => event.summary.length > 0);
}

function eventSummary(game: GameView, entry: GameLogEntryView): string {
  const player =
    game.players.find((candidate) => candidate.playerId === entry.playerId)?.name ?? 'Игрок';
  const target = game.players.find(
    (candidate) => candidate.playerId === entry.targetPlayerId,
  )?.name;
  const card = entry.card?.name ?? entry.cards?.[0]?.name;
  switch (entry.type) {
    case 'TURN_STARTED':
      return `Ход: ${player}`;
    case 'DOOR_KICKED':
      return `${player} открыл ${card ?? 'дверь'}`;
    case 'CARD_ADDED_TO_HAND':
      return `${player} получил ${card ?? 'карту'}`;
    case 'CARD_DRAWN':
      return entry.hiddenCard === undefined
        ? `${player} получил ${card ?? 'карту'}`
        : `${player} получил закрытую карту`;
    case 'LOOKED_FOR_TROUBLE':
      return `${player} нашёл неприятности: ${card ?? 'монстр'}`;
    case 'CURSE_RESOLVED':
      return `Проклятие ${card ?? ''}${target ? ` → ${target}` : ''}`.trim();
    case 'COMBAT_STARTED':
      return `${player} вступил в бой${card ? `: ${card}` : ''}`;
    case 'CARD_PLAYED':
      return `${player} сыграл ${card ?? 'карту'}${target ? ` на игрока ${target}` : ''}`;
    case 'CARDS_DISCARDED':
      return `${player} сбросил ${entry.count ?? 0} карт`;
    case 'HELP_OFFERED':
      return `${player} предложил помощь`;
    case 'HELP_COUNTERED':
      return `${player} изменил условия помощи`;
    case 'HELP_OFFER_ACCEPTED':
      return `Помощь согласована`;
    case 'COMBAT_VICTORY_DECLARED':
      return `${player} объявил победу`;
    case 'COMBAT_VICTORY_CANCELLED':
      return `Победа отменена: силы изменились`;
    case 'COMBAT_WON':
      return `${player} выиграл бой`;
    case 'RUN_AWAY_ATTEMPTED':
      return `${player}: побег ${entry.escaped ? 'успешен' : 'не удался'}`;
    case 'BAD_STUFF_APPLIED':
      return `Применено Непотребство${card ? `: ${card}` : ''}`;
    case 'LEVEL_GAINED':
      return `${player} получил ур. ${entry.amount ?? 1}`;
    case 'LEVEL_LOST':
      return `${player} потерял ур. ${entry.amount ?? 1}`;
    case 'TREASURE_GAINED':
      return `${player} получил сокровища: ${entry.count ?? 0}`;
    case 'COMBAT_REWARD_CARDS':
      return entry.hiddenCard === undefined
        ? `${player} получил сокровища`
        : `${player} получил закрытые сокровища`;
    case 'SCAVENGED':
      return `${player} нашёл снаряжение`;
    case 'SCAVENGED_CARD':
      return entry.hiddenCard === undefined
        ? `${player} получил ${card ?? 'карту'}`
        : `${player} получил закрытую карту`;
    case 'PLAYER_DIED':
      return `${player} погиб`;
    case 'PLAYER_REVIVED':
      return `${player} вернулся в игру`;
    case 'GAME_FINISHED':
      return `${player} победил`;
    case 'ITEM_EQUIPPED':
      return `${player} надел ${card ?? 'предмет'}`;
    case 'ITEM_UNEQUIPPED':
      return `${player} снял ${card ?? 'предмет'}`;
    case 'ROLE_PLAYED':
      return `${player} выбрал ${entry.role === 'CLASS' ? 'класс' : 'расу'}: ${card ?? 'роль'}`;
    case 'ROLE_DISCARDED':
      return `${player} сбросил ${entry.role === 'CLASS' ? 'класс' : 'расу'}: ${card ?? 'роль'}`;
    case 'ROLE_PERMISSION_PLAYED':
      return `${player} активировал разрешение роли: ${card ?? 'карту'}`;
    case 'ROLE_PERMISSION_DISCARDED':
      return `${player} сбросил разрешение роли: ${card ?? 'карту'}`;
    case 'CARDS_SOLD':
      return `${player} продал карты`;
    case 'ITEM_TRADED':
      return `${player} передал ${card ?? 'предмет'}${target ? ` игроку ${target}` : ''}`;
    case 'CHARITY_RESOLVED':
      return `${player} раздал милостыню`;
    default:
      return '';
  }
}

export function unavailableReason(game: GameView, cardId: string): string {
  const reason = game.unavailableCardReasons.find((entry) => entry.cardId === cardId)?.reason;
  const labels: Record<NonNullable<typeof reason>, string> = {
    GAME_FINISHED: 'Игра завершена',
    PENDING_DECISION: 'Сначала завершите обязательный выбор',
    REACTION_WINDOW_ACTIVE: 'Сейчас разрешены только реакции',
    REACTION_ALREADY_CONFIRMED: 'Вы уже ответили',
    WAITING_FOR_TURN: 'Доступно только в ваш ход',
    COMBAT_ACTIVE: 'Недоступно во время боя',
    NO_ACTIVE_COMBAT: 'Требуется активный бой',
    WRONG_PHASE: 'Сейчас эту карту сыграть нельзя',
    SLOT_OCCUPIED: 'Слот занят',
    NOT_ENOUGH_FREE_HANDS: 'Не хватает свободных рук',
    CLASS_REQUIRED: 'Не подходит класс',
    RACE_REQUIRED: 'Не подходит раса',
    NO_AVAILABLE_ACTION: 'Нет доступного действия',
  };
  return reason === undefined ? 'Можно использовать позже' : labels[reason];
}
