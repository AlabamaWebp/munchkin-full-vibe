import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  APPLICATION_NAME,
  type AvailableGameAction,
  type GameCardView,
  type GameCardType,
  type GameBadStuffEffectView,
  type GameCardUnavailableReason,
  type GameClientCommand,
  type GameDeckType,
  type GameEffectView,
  type GameEquipmentSlot,
  type GameLogEntryView,
  type GamePhase,
  type GamePlayerView,
  type GameView,
} from '@munchkin-lan/contracts';
import { CardDetailsDialogComponent } from './card-details-dialog.component';
import { AutoFocusDirective } from './auto-focus.directive';
import { EquipmentLayoutComponent, type EquipmentLayoutLabels } from './equipment-layout.component';
import { GameCardComponent } from './game-card.component';
import { LobbyClient } from './lobby-client';
import { LocalizationService, type AppLocale } from './localization';

@Component({
  selector: 'app-root',
  imports: [
    FormsModule,
    AutoFocusDirective,
    CardDetailsDialogComponent,
    EquipmentLayoutComponent,
    GameCardComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly lobbyClient = inject(LobbyClient);
  private readonly localization = inject(LocalizationService);

  protected readonly title = APPLICATION_NAME;
  protected readonly playerName = signal('');
  protected readonly roomCode = signal('');
  protected readonly selectedCard = signal<GameCardView | null>(null);
  protected readonly selectedLogEntry = signal<GameLogEntryView | null>(null);
  protected readonly selectedPlayerId = signal<string | null>(null);
  protected readonly publicCardEvents = signal<readonly GameLogEntryView[]>([]);
  protected readonly feedbackEvents = signal<readonly GameLogEntryView[]>([]);
  protected readonly targeting = signal<{
    readonly kind: 'CURSE' | 'TRADE';
    readonly card: GameCardView;
    readonly eligiblePlayerIds: readonly string[];
  } | null>(null);
  protected readonly confirmation = signal<{
    readonly command: GameClientCommand;
    readonly card: GameCardView;
    readonly targetLabel: string;
  } | null>(null);
  protected readonly historyOpen = signal(false);
  protected readonly saleOpen = signal(false);
  protected readonly saleCardIds = signal<readonly string[]>([]);
  protected readonly discardCardIds = signal<readonly string[]>([]);
  protected readonly isFullscreen = signal(document.fullscreenElement !== null);
  protected readonly fullscreenSupported =
    typeof document.documentElement.requestFullscreen === 'function';
  protected readonly locale = this.localization.locale;
  protected readonly t = this.localization.translate.bind(this.localization);
  protected readonly errorMessage = this.localization.errorMessage.bind(this.localization);
  protected readonly cardName = this.localization.cardName.bind(this.localization);
  protected readonly cardDescription = this.localization.cardDescription.bind(this.localization);
  protected readonly cardsCount = this.localization.cardsCount.bind(this.localization);

  protected readonly connection = this.lobbyClient.connection;
  protected readonly lobby = this.lobbyClient.lobby;
  protected readonly game = this.lobbyClient.game;
  protected readonly playerId = this.lobbyClient.playerId;
  protected readonly error = this.lobbyClient.error;
  protected readonly pending = this.lobbyClient.pending;
  protected readonly isHost = this.lobbyClient.isHost;
  protected readonly hasStarted = this.lobbyClient.hasStarted;
  protected readonly recentPublicEvents = computed(() =>
    (this.game()?.gameLog ?? []).filter((entry) => entry.visibility === 'PUBLIC').slice(-5),
  );
  private presentationGameKey: string | null = null;
  private lastPresentedSequence = 0;
  private lastFeedbackSequence = 0;

  constructor() {
    effect(() => this.synchronizePresentation(this.game()));
  }

  protected createRoom(): void {
    this.lobbyClient.createRoom(this.playerName());
  }

  protected joinRoom(): void {
    this.lobbyClient.joinRoom(this.playerName(), this.roomCode());
  }

  protected startGame(): void {
    this.lobbyClient.startGame();
  }

  protected rematch(): void {
    this.closeCardDetails();
    this.selectedPlayerId.set(null);
    this.historyOpen.set(false);
    this.lobbyClient.rematch();
  }

  protected returnToLobby(): void {
    this.closeCardDetails();
    this.selectedPlayerId.set(null);
    this.historyOpen.set(false);
    this.lobbyClient.returnToLobby();
  }

  protected sendAction(action: AvailableGameAction): void {
    this.lobbyClient.sendGameCommand({ type: action });
  }

  protected equip(card: GameCardView): void {
    this.lobbyClient.sendGameCommand({ type: 'EQUIP_ITEM', cardId: card.instanceId });
  }

  protected unequip(card: GameCardView): void {
    this.lobbyClient.sendGameCommand({ type: 'UNEQUIP_ITEM', cardId: card.instanceId });
  }

  protected playRole(card: GameCardView): void {
    this.lobbyClient.sendGameCommand({ type: 'PLAY_ROLE', cardId: card.instanceId });
  }

  protected beginTargeting(game: GameView, card: GameCardView, kind: 'CURSE' | 'TRADE'): void {
    this.closeCardDetails();
    this.targeting.set({
      kind,
      card,
      eligiblePlayerIds: game.players
        .filter((player) => kind === 'CURSE' || player.playerId !== game.viewerPlayerId)
        .map((player) => player.playerId),
    });
  }

  protected openSale(): void {
    this.saleCardIds.set([]);
    this.saleOpen.set(true);
  }

  protected closeSale(): void {
    this.saleCardIds.set([]);
    this.saleOpen.set(false);
  }

  protected saleCards(game: GameView): readonly GameCardView[] {
    const sellable = new Set(game.expandedRuleActions.sellableItemCardIds);
    return [...game.self.hand, ...game.self.equipment].filter((card) =>
      sellable.has(card.instanceId),
    );
  }

  protected toggleSaleCard(cardId: string): void {
    const selected = this.saleCardIds();
    this.saleCardIds.set(
      selected.includes(cardId) ? selected.filter((id) => id !== cardId) : [...selected, cardId],
    );
  }

  protected saleTotal(game: GameView): number {
    const selected = new Set(this.saleCardIds());
    return this.saleCards(game).reduce(
      (total, card) => total + (selected.has(card.instanceId) ? (card.equipment?.value ?? 0) : 0),
      0,
    );
  }

  protected saleLevels(game: GameView): number {
    return Math.floor(this.saleTotal(game) / 1000);
  }

  protected confirmSale(game: GameView): void {
    if (this.saleTotal(game) < 1000) return;
    this.lobbyClient.sendGameCommand({ type: 'SELL_ITEMS', cardIds: this.saleCardIds() });
    this.closeSale();
  }

  protected chooseTarget(game: GameView, playerId: string): void {
    const targeting = this.targeting();
    if (targeting === null || !targeting.eligiblePlayerIds.includes(playerId)) return;
    this.confirmation.set({
      card: targeting.card,
      targetLabel: this.lookupPlayerName(game, playerId),
      command:
        targeting.kind === 'CURSE'
          ? { type: 'PLAY_CURSE', cardId: targeting.card.instanceId, targetPlayerId: playerId }
          : { type: 'TRADE_ITEM', cardId: targeting.card.instanceId, recipientId: playerId },
    });
  }

  protected confirmTargetAction(): void {
    const confirmation = this.confirmation();
    if (confirmation === null) return;
    this.lobbyClient.sendGameCommand(confirmation.command);
    this.confirmation.set(null);
    this.targeting.set(null);
  }

  protected resolveCharity(game: GameView): void {
    if (game.expandedRuleActions.charityCardCount === 0) return;
    this.lobbyClient.sendGameCommand({ type: 'GIVE_RANDOM_CHARITY' });
  }

  protected decisionCards(game: GameView): readonly GameCardView[] {
    const decision = game.pendingDecision;
    if (decision === null || decision.playerId !== game.viewerPlayerId) return [];
    const selectable = new Set(decision.selectableCardIds);
    return (decision.zone === 'HAND' ? game.self.hand : game.self.equipment).filter((card) =>
      selectable.has(card.instanceId),
    );
  }

  protected toggleDiscardCard(cardId: string): void {
    const selected = this.discardCardIds();
    this.discardCardIds.set(
      selected.includes(cardId) ? selected.filter((id) => id !== cardId) : [...selected, cardId],
    );
  }

  protected confirmDiscard(game: GameView): void {
    if (this.discardCardIds().length !== game.pendingDecision?.count) return;
    this.lobbyClient.sendGameCommand({
      type: 'RESOLVE_CARD_DISCARD',
      cardIds: this.discardCardIds(),
    });
    this.discardCardIds.set([]);
  }

  protected expandedActionIncludes(ids: readonly string[], card: GameCardView): boolean {
    return ids.includes(card.instanceId);
  }

  protected playCombatCard(card: GameCardView, targetSide: 'PLAYERS' | 'MONSTER'): void {
    this.closeCardDetails();
    this.confirmation.set({
      card,
      targetLabel: this.t(targetSide === 'PLAYERS' ? 'playerSide' : 'monsterSide'),
      command: { type: 'PLAY_CARD', cardId: card.instanceId, targetSide },
    });
  }

  protected canPlayCombatCard(
    game: {
      readonly playableCombatCards: {
        readonly playersSideCardIds: readonly string[];
        readonly monsterSideCardIds: readonly string[];
      };
    },
    card: GameCardView,
    targetSide: 'PLAYERS' | 'MONSTER',
  ): boolean {
    const ids =
      targetSide === 'PLAYERS'
        ? game.playableCombatCards.playersSideCardIds
        : game.playableCombatCards.monsterSideCardIds;
    return ids.includes(card.instanceId);
  }

  protected requestHelp(helperId: string): void {
    this.lobbyClient.sendGameCommand({ type: 'REQUEST_HELP', helperId });
  }

  protected lookupPlayerName(
    game: { readonly players: readonly { readonly playerId: string; readonly name: string }[] },
    playerId: string,
  ): string {
    return game.players.find((player) => player.playerId === playerId)?.name ?? playerId;
  }

  protected selectedPlayer(game: GameView): GamePlayerView | null {
    const playerId = this.selectedPlayerId();
    return playerId === null
      ? null
      : (game.players.find((player) => player.playerId === playerId) ?? null);
  }

  protected isPlayerConnected(playerId: string): boolean {
    return this.lobby()?.players.find((player) => player.playerId === playerId)?.connected ?? false;
  }

  protected openCard(card: GameCardView): void {
    this.selectedLogEntry.set(null);
    this.selectedCard.set(card);
  }

  protected openLogEntry(entry: GameLogEntryView): void {
    if (!this.logEntryCards(entry).length) return;
    this.selectedCard.set(null);
    this.selectedLogEntry.set(entry);
  }

  protected closeCardDetails(): void {
    this.selectedCard.set(null);
    this.selectedLogEntry.set(null);
  }

  protected logEntryCards(entry: GameLogEntryView): readonly GameCardView[] {
    return entry.cards ?? (entry.card === undefined ? [] : [entry.card]);
  }

  protected logEntryMeta(game: GameView, entry: GameLogEntryView): string {
    const source = entry.playerId ? this.lookupPlayerName(game, entry.playerId) : '';
    const target = entry.targetPlayerId ? this.lookupPlayerName(game, entry.targetPlayerId) : '';
    return `${this.t('historyEntryMeta')} ${entry.turnNumber} · ${this.phaseLabel(entry.phase)}${
      source ? ` · ${this.t('source')}: ${source}` : ''
    }${target ? ` · ${this.t('target')}: ${target}` : ''}`;
  }

  protected gameLogEntryLabel(game: GameView, entry: GameLogEntryView): string {
    const player = entry.playerId
      ? this.lookupPlayerName(game, entry.playerId)
      : this.t('historyUnknownPlayer');
    const target = entry.targetPlayerId
      ? this.lookupPlayerName(game, entry.targetPlayerId)
      : this.t('historyUnknownPlayer');
    const card = entry.card ? this.cardName(entry.card) : this.t('historyUnknownCard');
    const cards = entry.cards?.map((item) => this.cardName(item)).join(', ') ?? '';

    switch (entry.type) {
      case 'PLAYER_ADDED':
        return `${player} ${this.t('logPlayerAdded')}`;
      case 'GAME_STARTED':
        return `${this.t('logGameStarted')} ${player}.`;
      case 'CARDS_DEALT':
        return `${this.t('logCardsDealt')} ${entry.count ?? entry.cards?.length ?? 0}: ${cards}.`;
      case 'TURN_STARTED':
        return `${this.t('logTurnStarted')} ${player}.`;
      case 'TURN_ENDED':
        return `${player} ${this.t('logTurnEnded')}`;
      case 'DOOR_KICKED':
        return `${player} ${this.t('logDoorKicked')} ${card}.`;
      case 'CARD_DRAWN':
        return `${this.t('logCardDrawn')} ${card}.`;
      case 'CARD_ADDED_TO_HAND':
        return `${player} ${this.t('logCardAdded')} ${card}.`;
      case 'CARDS_DISCARDED':
        return `${player} ${this.t('logCardsDiscarded')} ${cards}.`;
      case 'CARDS_DISCARDED_SUMMARY':
        return `${player} ${this.t('logCardsDiscardedSummary')} ${entry.count ?? 0}.`;
      case 'CARD_DISCARD_REQUIRED':
        return `${player} ${this.t('logCardDiscardRequired')} ${entry.count ?? 0} — ${card}.`;
      case 'CURSE_RESOLVED':
        return `${this.t('logCurseResolved')} ${card} ${this.t('logOnPlayer')} ${player}.`;
      case 'COMBAT_STARTED':
        return `${player} ${this.t('historyCombatStarted')} ${card}.`;
      case 'COMBAT_UPDATED':
        return `${this.t('logCombatUpdated')} ${entry.playerPower ?? 0} : ${entry.monsterPower ?? 0}.`;
      case 'COMBAT_WON':
        return `${player} ${this.t('logCombatWon')} ${card}.`;
      case 'RUN_AWAY_ATTEMPTED':
        return `${player} ${this.t('logRunAway')} ${card}: ${entry.roll ?? 0} — ${
          entry.escaped ? this.t('runAwaySucceeded') : this.t('runAwayFailed')
        }.`;
      case 'BAD_STUFF_APPLIED':
        return `${this.t('logBadStuff')} ${card} ${this.t('logOnPlayer')} ${player}.`;
      case 'HELP_REQUESTED':
        return `${player} ${this.t('historyHelpRequested')} ${target}.`;
      case 'HELP_ACCEPTED':
        return `${target} ${this.t('historyHelpAccepted')} ${player}.`;
      case 'LEVEL_GAINED':
        return `${player} ${this.t('logLevelGained')} ${entry.amount ?? 0} (${this.t(
          'level',
        )} ${entry.newLevel ?? 0}).`;
      case 'LEVEL_LOST':
        return `${player} ${this.t('logLevelLost')} ${entry.amount ?? 0} (${this.t(
          'level',
        )} ${entry.newLevel ?? 0}).`;
      case 'TREASURE_GAINED':
        return `${player} ${this.t('logTreasureGained')} ${entry.count ?? 0}.`;
      case 'ROOM_LOOTED':
        return `${player} ${this.t('logRoomLooted')}`;
      case 'CARD_PLAYED':
        return `${player} ${this.t('logCardPlayed')} ${card}${
          entry.targetPlayerId
            ? ` ${this.t('logOnPlayer')} ${target}`
            : entry.side
              ? ` ${this.t(entry.side === 'PLAYERS' ? 'logForPlayers' : 'logForMonster')}`
              : ''
        }.`;
      case 'ITEM_EQUIPPED':
        return `${player} ${this.t('logItemEquipped')} ${card}.`;
      case 'ITEM_UNEQUIPPED':
        return `${player} ${this.t('logItemUnequipped')} ${card}.`;
      case 'ROLE_PLAYED':
        return `${player} ${this.t('logRolePlayed')} ${card}.`;
      case 'ITEMS_SOLD':
        return `${player} ${this.t('logItemsSold')} ${cards} (${entry.value ?? 0}, +${
          entry.amount ?? 0
        } ${this.t('levels')}).`;
      case 'ITEM_TRADED':
        return `${player} ${this.t('logItemTraded')} ${card} ${this.t('logToPlayer')} ${target}.`;
      case 'CHARITY_RESOLVED':
        return entry.targetPlayerId
          ? `${player} ${this.t('logCharityGiven')} ${entry.count ?? 0} ${this.t(
              'logToPlayer',
            )} ${target}.`
          : `${player} ${this.t('logCharityDiscarded')} ${entry.count ?? 0}.`;
      case 'PLAYER_DIED':
        return `${player} ${this.t('logPlayerDied')}`;
      case 'PLAYER_REVIVED':
        return `${player} ${this.t('logPlayerRevived')}`;
      case 'GAME_FINISHED':
        return `${player} ${this.t('logGameFinished')} ${entry.newLevel ?? 0}.`;
    }
  }

  protected canEquip(
    game: { readonly availableEquipmentActions: { readonly equipCardIds: readonly string[] } },
    card: GameCardView,
  ): boolean {
    return game.availableEquipmentActions.equipCardIds.includes(card.instanceId);
  }

  protected canUnequip(
    game: { readonly availableEquipmentActions: { readonly unequipCardIds: readonly string[] } },
    card: GameCardView,
  ): boolean {
    return game.availableEquipmentActions.unequipCardIds.includes(card.instanceId);
  }

  protected isCardPlayable(game: GameView, card: GameCardView): boolean {
    return [
      ...game.availableEquipmentActions.equipCardIds,
      ...game.availableEquipmentActions.unequipCardIds,
      ...game.playableCombatCards.playersSideCardIds,
      ...game.playableCombatCards.monsterSideCardIds,
      ...game.expandedRuleActions.playableRoleCardIds,
      ...game.expandedRuleActions.playableCurseCardIds,
      ...game.expandedRuleActions.sellableItemCardIds,
      ...game.expandedRuleActions.tradeableItemCardIds,
    ].includes(card.instanceId);
  }

  protected cardUnavailableReason(game: GameView, card: GameCardView): string {
    const reason = game.unavailableCardReasons.find(
      (candidate) => candidate.cardId === card.instanceId,
    )?.reason;
    if (reason === undefined) return '';
    const labels: Record<GameCardUnavailableReason, Parameters<typeof this.t>[0]> = {
      GAME_FINISHED: 'cardReasonFinished',
      PENDING_DECISION: 'cardReasonPendingDecision',
      WAITING_FOR_TURN: 'cardReasonWaitingTurn',
      COMBAT_ACTIVE: 'cardReasonCombatActive',
      NO_ACTIVE_COMBAT: 'cardReasonNoCombat',
      WRONG_PHASE: 'cardReasonWrongPhase',
      SLOT_OCCUPIED: 'errorEquipmentSlotOccupied',
      NOT_ENOUGH_FREE_HANDS: 'errorNotEnoughFreeHands',
      CLASS_REQUIRED: 'errorClassRequired',
      RACE_REQUIRED: 'errorRaceRequired',
      NO_AVAILABLE_ACTION: 'cardReasonNoAction',
    };
    return this.t(labels[reason]);
  }

  protected cardAriaLabel(game: GameView, card: GameCardView): string {
    return `${this.cardName(card)}. ${
      this.isCardPlayable(game, card) ? this.t('cardPlayableNow') : this.t('cardOpenDetails')
    }`;
  }

  protected cardTypeForDialog = (card: GameCardView): string => this.cardTypeLabel(card.type);
  protected effectForDialog = (effect: GameEffectView): string => this.effectLabel(effect);
  protected slotForDialog = (slot: GameEquipmentSlot): string => this.equipmentSlotLabel(slot);

  protected effectLabel(effect: GameEffectView): string {
    switch (effect.type) {
      case 'COMBAT_BONUS':
        return `${this.t('effectCombatBonus')} +${effect.amount}`;
      case 'MONSTER_COMBAT_BONUS':
        return `${this.t('effectMonsterBonus')} +${effect.amount}`;
      case 'GAIN_LEVEL':
        return `${this.t('effectGainLevel')} ${effect.amount}`;
      case 'LOSE_LEVEL':
        return `${this.t('effectLoseLevel')} ${effect.amount}`;
      case 'DRAW_CARDS':
        return `${this.t('effectDrawCards')} ${effect.count} · ${this.deckLabel(effect.deck)}`;
      case 'DISCARD_RANDOM_CARDS':
        return `${this.t('effectDiscardRandom')} ${effect.count}`;
      case 'DISCARD_CHOSEN_CARDS':
        return `${this.t('effectDiscardChosen')} ${effect.count}`;
      case 'DISCARD_ROLE':
        return `${this.t('effectDiscardRole')} ${this.cardTypeLabel(effect.role)}`;
      case 'DEATH':
        return this.t('effectDeath');
    }
  }

  protected equipmentLabels(): EquipmentLayoutLabels {
    return {
      head: this.t('slotHead'),
      body: this.t('slotBody'),
      feet: this.t('slotFeet'),
      leftHand: this.t('slotLeftHand'),
      rightHand: this.t('slotRightHand'),
      class: this.t('cardClass'),
      race: this.t('cardRace'),
      empty: this.t('emptySlot'),
      twoHanded: this.t('twoHanded'),
    };
  }

  protected combatCardBonus(card: GameCardView): number {
    return card.effects.reduce(
      (total, effect) =>
        effect.type === 'COMBAT_BONUS' || effect.type === 'MONSTER_COMBAT_BONUS'
          ? total + effect.amount
          : total,
      0,
    );
  }

  protected expectedActionLabel(game: GameView): string {
    const actor = this.lookupPlayerName(game, game.expectedAction.playerId);
    const labels = {
      DISCARD_CARDS: 'expectedDiscard',
      RESPOND_TO_HELP: 'expectedHelpResponse',
      COMBAT_DECISION: 'expectedCombatDecision',
      TAKE_TURN_ACTION: 'expectedTurnAction',
    } as const;
    return `${this.t(labels[game.expectedAction.type])}: ${actor}`;
  }

  protected dismissPublicEvent(sequence: number): void {
    this.publicCardEvents.update((entries) =>
      entries.filter((entry) => entry.sequence !== sequence),
    );
  }

  protected cancelTargeting(): void {
    this.targeting.set(null);
    this.confirmation.set(null);
  }

  @HostListener('document:keydown.escape')
  protected closeTopLayer(): void {
    if (this.confirmation() !== null) this.confirmation.set(null);
    else if (this.selectedLogEntry() !== null || this.selectedCard() !== null)
      this.closeCardDetails();
    else if (this.selectedPlayerId() !== null) this.selectedPlayerId.set(null);
    else if (this.saleOpen()) this.closeSale();
    else if (this.historyOpen()) this.historyOpen.set(false);
    else if (this.targeting() !== null) this.targeting.set(null);
  }

  @HostListener('document:fullscreenchange')
  protected synchronizeFullscreenState(): void {
    this.isFullscreen.set(document.fullscreenElement !== null);
  }

  protected async toggleFullscreen(): Promise<void> {
    if (!this.fullscreenSupported) return;

    try {
      if (document.fullscreenElement === null) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      this.synchronizeFullscreenState();
    }
  }

  private synchronizePresentation(game: GameView | null): void {
    if (game === null) {
      this.presentationGameKey = null;
      this.publicCardEvents.set([]);
      this.feedbackEvents.set([]);
      return;
    }
    const key = `munchkin-lan.seen-events.${game.gameId}.${game.viewerPlayerId}`;
    const maximumSequence = game.gameLog.at(-1)?.sequence ?? 0;
    if (this.presentationGameKey !== key) {
      this.presentationGameKey = key;
      const stored = window.localStorage.getItem(key);
      const baseline = stored === null ? maximumSequence : Number.parseInt(stored, 10);
      this.lastPresentedSequence = Number.isFinite(baseline) ? baseline : maximumSequence;
      this.lastFeedbackSequence = maximumSequence;
      this.publicCardEvents.set([]);
      window.localStorage.setItem(key, String(this.lastPresentedSequence));
      return;
    }

    const publicCardTypes = new Set<GameLogEntryView['type']>([
      'DOOR_KICKED',
      'CARD_PLAYED',
      'ITEM_EQUIPPED',
      'ITEM_UNEQUIPPED',
      'ROLE_PLAYED',
      'ITEM_TRADED',
    ]);
    const unseenCards = game.gameLog.filter(
      (entry) =>
        entry.sequence > this.lastPresentedSequence &&
        entry.visibility === 'PUBLIC' &&
        publicCardTypes.has(entry.type) &&
        this.logEntryCards(entry).length > 0,
    );
    if (unseenCards.length > 0) {
      this.publicCardEvents.update((entries) => [...entries, ...unseenCards].slice(-3));
      this.lastPresentedSequence = Math.max(...unseenCards.map((entry) => entry.sequence));
      window.localStorage.setItem(key, String(this.lastPresentedSequence));
    } else {
      this.lastPresentedSequence = Math.max(this.lastPresentedSequence, maximumSequence);
      window.localStorage.setItem(key, String(this.lastPresentedSequence));
    }

    const feedbackTypes = new Set<GameLogEntryView['type']>([
      'LEVEL_GAINED',
      'LEVEL_LOST',
      'TREASURE_GAINED',
      'RUN_AWAY_ATTEMPTED',
      'BAD_STUFF_APPLIED',
      'ITEM_EQUIPPED',
      'ITEM_UNEQUIPPED',
      'PLAYER_DIED',
      'PLAYER_REVIVED',
    ]);
    const feedback = game.gameLog.filter(
      (entry) => entry.sequence > this.lastFeedbackSequence && feedbackTypes.has(entry.type),
    );
    this.lastFeedbackSequence = maximumSequence;
    if (feedback.length > 0) {
      this.feedbackEvents.set(feedback.slice(-3));
      window.setTimeout(() => this.feedbackEvents.set([]), 7000);
    }
  }

  protected phaseLabel(phase: GamePhase): string {
    const labels = {
      LOBBY: 'phaseLobby',
      TURN_START: 'phaseTurnStart',
      KICK_DOOR: 'phaseKickDoor',
      DOOR_RESOLUTION: 'phaseDoorResolution',
      POST_DOOR: 'phasePostDoor',
      LOOT_ROOM: 'phaseLootRoom',
      END_TURN: 'phaseEndTurn',
      FINISHED: 'phaseFinished',
    } as const;
    return this.t(labels[phase]);
  }

  protected turnStatusLabel(game: GameView): string {
    if (game.status === 'FINISHED') return this.phaseLabel(game.phase);
    if (game.expectedAction.playerId === game.viewerPlayerId) {
      return this.phaseLabel(game.phase);
    }

    const actor = this.lookupPlayerName(game, game.expectedAction.playerId);
    if (game.expectedAction.type === 'DISCARD_CARDS') {
      return `${actor} ${this.t('statusDiscardingCards')}`;
    }
    if (game.expectedAction.type === 'RESPOND_TO_HELP') {
      return `${actor} ${this.t('statusRespondingToHelp')}`;
    }
    if (game.expectedAction.type === 'COMBAT_DECISION') {
      return `${actor} ${this.t('statusResolvingCombat')}`;
    }

    const labels = {
      LOBBY: 'statusWaitingInLobby',
      TURN_START: 'statusStartingTurn',
      KICK_DOOR: 'statusOpeningDoor',
      DOOR_RESOLUTION: 'statusResolvingDoor',
      POST_DOOR: 'statusChoosingNextAction',
      LOOT_ROOM: 'statusLootingRoom',
      END_TURN: 'statusEndingTurn',
      FINISHED: 'phaseFinished',
    } as const;
    return `${actor} ${this.t(labels[game.phase])}`;
  }

  protected actionLabel(action: AvailableGameAction): string {
    const labels = {
      KICK_DOOR: 'actionKickDoor',
      ACCEPT_HELP: 'actionAcceptHelp',
      RESOLVE_COMBAT: 'actionResolveCombat',
      RUN_AWAY: 'actionRunAway',
      LOOT_ROOM: 'actionLootRoom',
      END_TURN: 'actionEndTurn',
    } as const;
    return this.t(labels[action]);
  }

  protected cardTypeLabel(type: GameCardType): string {
    const labels = {
      MONSTER: 'cardMonster',
      CURSE: 'cardCurse',
      EQUIPMENT: 'cardEquipment',
      TEMPORARY_BONUS: 'cardTemporaryBonus',
      MONSTER_MODIFIER: 'cardMonsterModifier',
      OTHER: 'cardOther',
      CLASS: 'cardClass',
      RACE: 'cardRace',
    } as const;
    return this.t(labels[type]);
  }

  protected deckLabel(deck: GameDeckType): string {
    return this.t(deck === 'DOOR' ? 'door' : 'treasure');
  }

  protected equipmentSlotLabel(slot: GameEquipmentSlot): string {
    const labels = {
      HEAD: 'slotHead',
      BODY: 'slotBody',
      FEET: 'slotFeet',
      HANDS: 'slotHands',
    } as const;
    return this.t(labels[slot]);
  }

  protected badStuffLabel(effect: GameBadStuffEffectView): string {
    if (effect.type === 'LOSE_LEVEL') {
      return `${this.t('badStuffLoseLevel')} ${effect.amount}`;
    }
    if (effect.type === 'DISCARD_ROLE') {
      return `${this.t('badStuffDiscardRole')} ${this.cardTypeLabel(effect.role)}`;
    }
    if (effect.type === 'DEATH') return this.t('badStuffDeath');
    const random = effect.type === 'DISCARD_RANDOM_CARDS';
    return `${this.t(
      effect.zone === 'HAND'
        ? random
          ? 'badStuffDiscardHand'
          : 'badStuffChooseHand'
        : random
          ? 'badStuffDiscardEquipment'
          : 'badStuffChooseEquipment',
    )} ${effect.count}`;
  }

  protected setLocale(locale: AppLocale): void {
    this.localization.setLocale(locale);
  }

  protected normalizeRoomCode(value: string): void {
    this.roomCode.set(value.toUpperCase());
  }
}
