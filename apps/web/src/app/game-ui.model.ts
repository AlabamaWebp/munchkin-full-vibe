import type { GameCardView, GameLogEntryView, GameView } from '@munchkin-lan/contracts';

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
  const drawDeck = entry.deck ?? entry.hiddenCard?.deck;
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
      : entry.type === 'CARD_DRAWN' && drawDeck !== undefined
        ? [
            combinedDrawReceipt(
              game,
              game.gameLog.filter(
                (candidate) =>
                  candidate.type === 'CARD_DRAWN' &&
                  candidate.playerId === entry.playerId &&
                  candidate.phase === game.phase &&
                  candidate.turnNumber === game.turnNumber &&
                  (candidate.deck ?? candidate.hiddenCard?.deck) === drawDeck,
              ),
            ),
          ]
        : [receipt(entry)];
  const latestReceipt = receipts.at(-1) ?? receipt(entry);
  return { ...latestReceipt, receipts };
}

function combinedDrawReceipt(
  game: GameView,
  entries: readonly GameLogEntryView[],
): StageCardReceipt {
  const entry = entries.at(-1);
  if (entry === undefined) throw new Error('A card-draw receipt requires an entry.');
  const cards = entries.flatMap((candidate) =>
    candidate.card === undefined ? (candidate.cards ?? []) : [candidate.card],
  );
  const deck = entry.deck ?? entry.hiddenCard?.deck;
  if (deck === undefined) throw new Error('A card-draw receipt requires a deck.');
  const count =
    cards.length || entries.reduce((sum, candidate) => sum + (candidate.hiddenCard?.count ?? 0), 0);
  return {
    entry,
    cards,
    hiddenCard: cards.length > 0 ? undefined : { deck, count },
    summary: `${playerName(game, entry.playerId)} получил ${deckCardsLabel(deck, count)} в закрытую`,
  };
}

export function presentEvents(
  game: GameView,
  cardName: (card: GameCardView) => string = (card) => card.name,
): readonly PresentedEvent[] {
  const visible = [
    ...(game.presentation.blocking === null ? [] : [game.presentation.blocking]),
    ...game.presentation.important,
    ...game.presentation.routine,
  ]
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.sequence === entry.sequence) === index,
    )
    .sort((left, right) => left.sequence - right.sequence)
    .filter((entry, _index, entries) => !isSupersededReward(entry, entries));
  return visible
    .map((entry) => ({
      entry,
      priority: entry.priority,
      summary: eventSummary(game, entry, cardName),
    }))
    .filter((event) => event.summary.length > 0);
}

/**
 * A combat reward records both its public count and its private card receipt.
 * The receipt is the richer history item, so suppress only the redundant
 * aggregate presentation; the authoritative events remain untouched.
 */
function isSupersededReward(
  entry: GameLogEntryView,
  entries: readonly GameLogEntryView[],
): boolean {
  return (
    entry.type === 'TREASURE_GAINED' &&
    entries.some(
      (candidate) =>
        candidate.type === 'COMBAT_REWARD_CARDS' &&
        candidate.playerId === entry.playerId &&
        candidate.turnNumber === entry.turnNumber &&
        candidate.phase === entry.phase &&
        candidate.count === entry.count,
    )
  );
}

/** Event sequences already explained by the persistent stage card surface. */
export function stageExplainedEventSequences(game: GameView): readonly number[] {
  return latestStageCardEvent(game)?.receipts.map((receipt) => receipt.entry.sequence) ?? [];
}

function eventSummary(
  game: GameView,
  entry: GameLogEntryView,
  cardName: (card: GameCardView) => string = (card) => card.name,
): string {
  const player = playerName(game, entry.playerId);
  const target = game.players.find(
    (candidate) => candidate.playerId === entry.targetPlayerId,
  )?.name;
  const card = entry.card === undefined ? entry.cards?.[0] : entry.card;
  const cardLabel = card === undefined ? undefined : cardName(card);
  switch (entry.type) {
    case 'TURN_STARTED':
      return `Ход: ${player}`;
    case 'DOOR_KICKED':
      return `${player} открыл ${cardLabel ?? 'дверь'}`;
    case 'CARD_ADDED_TO_HAND':
      return `${player} получил ${cardLabel ?? 'карту'} в открытую`;
    case 'CARD_DRAWN':
      return `${player} получил ${deckCardsLabel(
        entry.deck ?? entry.hiddenCard?.deck ?? 'TREASURE',
        entry.hiddenCard?.count ?? 1,
      )} в закрытую`;
    case 'LOOKED_FOR_TROUBLE':
      return `${player} нашёл неприятности: ${cardLabel ?? 'монстр'}`;
    case 'CURSE_RESOLVED':
      return `Проклятие ${cardLabel ?? ''}${target ? ` → ${target}` : ''}`.trim();
    case 'COMBAT_STARTED':
      return `${player} вступил в бой${cardLabel ? `: ${cardLabel}` : ''}`;
    case 'CARD_PLAYED':
      return `${player} сыграл ${cardLabel ?? 'карту'}${target ? ` на игрока ${target}` : ''}`;
    case 'ROLE_ABILITY_USED':
      return `${player} применил способность ${cardLabel ?? 'роли'}${entry.amount === undefined ? '' : ` (${entry.amount >= 0 ? '+' : ''}${entry.amount})`}`;
    case 'CARDS_DISCARDED':
      return `${player} сбросил ${entry.count ?? 0} карт`;
    case 'HELP_OFFERED':
      return `${player} просит помощи за ${entry.count ?? 0}/${entry.totalTreasureCount ?? 0} сокровищ`;
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
      return `Применено Непотребство${cardLabel ? `: ${cardLabel}` : ''}`;
    case 'LEVEL_GAINED':
      return `${player} получил ур. ${entry.amount ?? 1}`;
    case 'LEVEL_LOST':
      return `${player} потерял ур. ${entry.amount ?? 1}`;
    case 'TREASURE_GAINED':
      return `${player} получил сокровища: ${entry.count ?? 0}`;
    case 'COMBAT_REWARD_CARDS':
      return `${player} получил ${treasureCardsLabel(
        entry.hiddenCard?.count ?? entry.cards?.length ?? entry.count ?? 0,
      )} в закрытую`;
    case 'SCAVENGED':
      return `${player} нашёл снаряжение`;
    case 'SCAVENGED_CARD':
      return entry.hiddenCard === undefined
        ? `${player} получил ${cardLabel ?? 'карту'} в закрытую`
        : `${player} получил карту сокровища в закрытую`;
    case 'PLAYER_DIED':
      return `${player} погиб`;
    case 'PLAYER_REVIVED':
      return `${player} вернулся в игру`;
    case 'GAME_FINISHED':
      return `${player} победил`;
    case 'ITEM_EQUIPPED':
      return `${player} надел ${cardLabel ?? 'предмет'}`;
    case 'ITEM_UNEQUIPPED':
      return `${player} снял ${cardLabel ?? 'предмет'}`;
    case 'ROLE_PLAYED':
      return `${player} выбрал ${entry.role === 'CLASS' ? 'класс' : 'расу'}: ${cardLabel ?? 'роль'}`;
    case 'ROLE_DISCARDED':
      return `${player} сбросил ${entry.role === 'CLASS' ? 'класс' : 'расу'}: ${cardLabel ?? 'роль'}`;
    case 'ROLE_PERMISSION_PLAYED':
      return `${player} активировал разрешение роли: ${cardLabel ?? 'карту'}`;
    case 'ROLE_PERMISSION_DISCARDED':
      return `${player} сбросил разрешение роли: ${cardLabel ?? 'карту'}`;
    case 'CARDS_SOLD':
      return `${player} продал карты`;
    case 'ITEM_TRADED':
      return `${player} передал ${cardLabel ?? 'предмет'}${target ? ` игроку ${target}` : ''}`;
    case 'CHARITY_RESOLVED':
      return `${player} раздал милостыню`;
    default:
      return '';
  }
}

function playerName(game: GameView, playerId: string | undefined): string {
  return game.players.find((candidate) => candidate.playerId === playerId)?.name ?? 'Игрок';
}

function deckCardsLabel(deck: 'DOOR' | 'TREASURE', count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    count === 1
      ? 'карту'
      : lastTwo >= 11 && lastTwo <= 14
        ? 'карт'
        : last >= 2 && last <= 4
          ? 'карты'
          : 'карт';
  const deckName =
    count === 1
      ? deck === 'DOOR'
        ? 'двери'
        : 'сокровища'
      : deck === 'DOOR'
        ? 'дверей'
        : 'сокровищ';
  return `${count} ${noun} ${deckName}`;
}

function treasureCardsLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    count === 1
      ? 'карту'
      : lastTwo >= 11 && lastTwo <= 14
        ? 'карт'
        : last >= 2 && last <= 4
          ? 'карты'
          : 'карт';
  return `${count} ${noun} сокровищ`;
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
