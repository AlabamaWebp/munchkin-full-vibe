import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  APPLICATION_NAME,
  type AvailableGameAction,
  type GameCardView,
  type GameCardType,
  type GameBadStuffEffectView,
  type GameDeckType,
  type GameEquipmentSlot,
  type GamePhase,
  type GameView,
} from '@munchkin-lan/contracts';
import { LobbyClient } from './lobby-client';
import { LocalizationService, type AppLocale } from './localization';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
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
    this.selectedCard.set(null);
    this.lobbyClient.rematch();
  }

  protected returnToLobby(): void {
    this.selectedCard.set(null);
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

  protected playCurse(card: GameCardView, targetPlayerId: string): void {
    this.lobbyClient.sendGameCommand({
      type: 'PLAY_CURSE',
      cardId: card.instanceId,
      targetPlayerId,
    });
  }

  protected sell(card: GameCardView): void {
    this.lobbyClient.sendGameCommand({ type: 'SELL_ITEMS', cardIds: [card.instanceId] });
  }

  protected trade(card: GameCardView, recipientId: string): void {
    this.lobbyClient.sendGameCommand({ type: 'TRADE_ITEM', cardId: card.instanceId, recipientId });
  }

  protected resolveCharity(game: GameView): void {
    const count = game.expandedRuleActions.charityCardCount;
    if (count === 0) return;
    this.lobbyClient.sendGameCommand({
      type: 'GIVE_CHARITY',
      cardIds: game.self.hand.slice(0, count).map((card) => card.instanceId),
      recipientId: game.expandedRuleActions.charityRecipientIds[0] ?? null,
    });
  }

  protected expandedActionIncludes(ids: readonly string[], card: GameCardView): boolean {
    return ids.includes(card.instanceId);
  }

  protected playCombatCard(card: GameCardView, targetSide: 'PLAYERS' | 'MONSTER'): void {
    this.lobbyClient.sendGameCommand({
      type: 'PLAY_CARD',
      cardId: card.instanceId,
      targetSide,
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
    return `${this.t(
      effect.zone === 'HAND' ? 'badStuffDiscardHand' : 'badStuffDiscardEquipment',
    )} ${effect.count}`;
  }

  protected setLocale(locale: AppLocale): void {
    this.localization.setLocale(locale);
  }

  protected normalizeRoomCode(value: string): void {
    this.roomCode.set(value.toUpperCase());
  }
}
