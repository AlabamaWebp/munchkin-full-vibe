import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  AvailableGameAction,
  AvailableIntentView,
  GameCardView,
  GameClientCommand,
  GameConditionView,
  GameEffectView,
  GameModifierView,
  GameRoleAbilityView,
  GameView,
} from '@munchkin-lan/contracts';
import { ActionDockComponent, type ActionDockUtilityAction } from './action-dock.component';
import { AutoFocusDirective } from './auto-focus.directive';
import { CardArtworkComponent } from './card-artwork.component';
import { CompactGameCardComponent } from './compact-game-card.component';
import { EquipmentLayoutComponent } from './equipment-layout.component';
import { FocusTrapDirective } from './focus-trap.directive';
import { GameStageComponent } from './game-stage.component';
import {
  presentEvents,
  selectStage,
  stageExplainedEventSequences,
  unavailableReason,
} from './game-ui.model';
import { HandDockComponent } from './hand-dock.component';
import { LobbyClient, type ConnectionState, type UserFacingError } from './lobby-client';
import { LocalizationService } from './localization';
import { PlayerHudComponent } from './player-hud.component';
import { RecentEventsComponent } from './recent-events.component';

interface PickerOption {
  readonly id: string;
  readonly label: string;
  readonly facts?: string;
  readonly playerColor?: GameView['players'][number]['color'];
}

interface TargetPickerState {
  readonly title: string;
  readonly card: GameCardView;
  readonly kind:
    'CURSE' | 'PLAYER_CARD' | 'COMBAT_CURSE' | 'MONSTER' | 'HAND_MONSTER' | 'EQUIPMENT' | 'TRADE';
  readonly options: readonly PickerOption[];
}

interface CardUse {
  readonly label: string;
  readonly command?: GameClientCommand;
  readonly picker?: TargetPickerState;
  readonly roleAbility?: Extract<AvailableIntentView, { readonly kind: 'USE_ROLE_ABILITY' }>;
}

@Component({
  selector: 'app-game-shell',
  imports: [
    FormsModule,
    ActionDockComponent,
    AutoFocusDirective,
    CardArtworkComponent,
    CompactGameCardComponent,
    EquipmentLayoutComponent,
    FocusTrapDirective,
    GameStageComponent,
    HandDockComponent,
    PlayerHudComponent,
    RecentEventsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="game-shell" aria-label="Игровой стол">
      <app-player-hud
        [game]="game()"
        [connection]="connectionState()"
        [fullscreenSupported]="fullscreenSupported"
        [fullscreen]="isFullscreen()"
        (playerOpened)="selectedPlayerId.set($event)"
        (menuOpened)="menuOpen.set(true)"
        (fullscreenOpened)="toggleFullscreen()"
      />
      <app-recent-events [events]="recentEvents()" (historyOpened)="historyOpen.set(true)" />
      <app-game-stage
        [game]="game()"
        [stage]="stage()"
        [isHost]="isHost()"
        (cardOpened)="selectedCard.set($event)"
        (breakdownOpened)="breakdownOpen.set(true)"
        (helpOpened)="openHelp()"
        (rematchRequested)="rematch()"
        (returnToLobbyRequested)="returnToLobby()"
      />
      <app-action-dock
        [actions]="primaryActions()"
        [hasPlayableCombatCards]="hasPlayableCombatCards()"
        [utilityActions]="utilityActions()"
        [isOwnTurn]="game().activePlayerId === game().viewerPlayerId"
        (actionSelected)="sendAction($event)"
        (playCardOpened)="openCombatHand()"
        (utilityActionSelected)="openUtilityAction($event)"
      />
      <app-hand-dock
        [game]="game()"
        [playableIds]="playableIds()"
        [cardName]="displayCardName"
        (cardActivated)="activateCard($event)"
        (characterOpened)="selectedPlayerId.set(game().viewerPlayerId)"
        (fullHandOpened)="openFullHand()"
      />
      @if (error(); as commandError) {
        <p class="command-error" role="alert">{{ errorMessage(commandError) }}</p>
      }

      @if (game().curseResponse; as response) {
        <div class="backdrop blocking-backdrop">
          <section class="sheet decision-sheet" appFocusTrap role="dialog" aria-modal="true">
            <header>
              <div>
                <small>ОТВЕТ НА ПРОКЛЯТИЕ</small>
                <h2>{{ cardName(response.curseCard) }}</h2>
                <time>до {{ deadlineLabel(response.expiresAtEpochMs) }}</time>
              </div>
            </header>
            @if (response.playerId === game().viewerPlayerId) {
              <div class="sheet-scroll">
                <button type="button" class="primary" (click)="declineCurse(response.responseId)">
                  Принять проклятие
                </button>
                @for (cardId of response.cancelCardIds; track cardId) {
                  <button type="button" (click)="cancelCurse(response.responseId, cardId)">
                    Отменить · {{ ownCardName(cardId) }}
                  </button>
                }
                @for (cardId of response.itemGuardCardIds; track cardId) {
                  @for (itemId of response.protectableItemIds; track itemId) {
                    <button
                      type="button"
                      (click)="protectCurseItem(response.responseId, cardId, itemId)"
                    >
                      {{ ownCardName(cardId) }} · защитить {{ ownCardName(itemId) }}
                    </button>
                  }
                }
              </div>
            } @else {
              <footer>
                <p>Ждём {{ playerName(response.playerId) }}</p>
              </footer>
            }
          </section>
        </div>
      }

      @if (game().pendingDecision; as decision) {
        <div class="backdrop blocking-backdrop">
          <section
            class="sheet decision-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-title"
          >
            <header>
              <div>
                <small>ОБЯЗАТЕЛЬНО</small>
                <h2 id="decision-title">
                  {{ decision.type === 'DISCARD_CARDS' ? 'Выберите карты' : 'Оставьте одну роль' }}
                </h2>
                <time>до {{ deadlineLabel(decision.expiresAtEpochMs) }}</time>
              </div>
            </header>
            <div class="sheet-scroll">
              <p>
                {{
                  decision.type === 'DISCARD_CARDS'
                    ? 'Выберите ровно ' +
                      decision.count +
                      '. Причина: ' +
                      cardName(decision.sourceCard)
                    : 'Этот выбор нужен, чтобы продолжить игру.'
                }}
              </p>
              @if (decision.playerId === game().viewerPlayerId) {
                <p class="decision-count" aria-live="polite">
                  Выбрано {{ decisionSelection().length }} из
                  {{ decision.type === 'DISCARD_CARDS' ? decision.count : 1 }}
                </p>
              }
              <div class="picker-grid">
                @for (card of decisionCards(); track card.instanceId) {
                  <article
                    class="decision-card"
                    [class.selected]="decisionSelection().includes(card.instanceId)"
                  >
                    <button
                      type="button"
                      class="decision-card-artwork"
                      [attr.aria-label]="'Подробнее: ' + cardName(card)"
                      (click)="selectedCard.set(card)"
                    >
                      <app-card-artwork
                        [artKey]="card.artKey"
                        [label]="cardName(card)"
                        [compact]="true"
                      />
                    </button>
                    <button
                      type="button"
                      class="decision-card-select"
                      [attr.aria-pressed]="decisionSelection().includes(card.instanceId)"
                      (click)="toggleDecision(card.instanceId)"
                    >
                      <span>{{ cardName(card) }}</span>
                      <small>
                        {{ decisionSelection().includes(card.instanceId) ? 'Выбрано' : 'Выбрать' }}
                      </small>
                    </button>
                  </article>
                }
              </div>
            </div>
            @if (decision.playerId === game().viewerPlayerId) {
              <footer>
                <button
                  type="button"
                  class="primary"
                  [disabled]="!decisionReady()"
                  (click)="confirmDecision()"
                >
                  Подтвердить
                </button>
              </footer>
            } @else {
              <footer>
                <p>Ждём {{ playerName(decision.playerId) }}</p>
              </footer>
            }
          </section>
        </div>
      }

      @if (fullHandOpen()) {
        <div class="backdrop full-hand-backdrop">
          <section
            class="sheet full-hand-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="hand-title"
          >
            <header>
              <h2 id="hand-title">Рука · {{ game().self.hand.length }}</h2>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть руку"
                (click)="fullHandOpen.set(false)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll">
              <div class="hand-filters" aria-label="Фильтр руки">
                @for (filter of handFilters; track filter.id) {
                  <button
                    type="button"
                    [class.selected]="handFilter() === filter.id"
                    [attr.aria-pressed]="handFilter() === filter.id"
                    (click)="handFilter.set(filter.id)"
                  >
                    {{ filter.label }}
                  </button>
                }
              </div>
              <div class="full-hand-grid">
                @for (card of filteredHand(); track card.instanceId) {
                  <app-compact-game-card
                    [card]="card"
                    [cardName]="displayCardName"
                    [playable]="playableIds().includes(card.instanceId)"
                    [reason]="cardReason(card)"
                    [showDetails]="true"
                    [details]="compactHandFacts(card)"
                    (activated)="activateCard($event)"
                  />
                } @empty {
                  <p>В этой группе нет карт.</p>
                }
              </div>
            </div>
          </section>
        </div>
      }

      @if (targetPicker(); as picker) {
        <div class="backdrop">
          <section
            class="sheet compact-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="target-title"
          >
            <header>
              <h2 id="target-title">{{ picker.title }}</h2>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть выбор"
                (click)="targetPicker.set(null)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll option-list">
              @for (option of picker.options; track option.id) {
                <button type="button" (click)="chooseTarget(picker, option.id)">
                  @if (option.playerColor; as color) {
                    <span
                      class="target-avatar"
                      [class]="'target-avatar player-color-' + color.toLowerCase()"
                      aria-hidden="true"
                      >{{ option.label.charAt(0).toUpperCase() }}</span
                    >
                  }
                  <strong>{{ option.label }}</strong>
                  @if (option.facts) {
                    <small>{{ option.facts }}</small>
                  }
                </button>
              }
            </div>
          </section>
        </div>
      }

      @if (roleAbilityIntent(); as intent) {
        <div class="backdrop">
          <section
            class="sheet compact-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="ability-cost-title"
          >
            <header>
              <div>
                <small>ЦЕНА СПОСОБНОСТИ</small>
                <h2 id="ability-cost-title">Сбросьте {{ intent.cost.count }} карт.</h2>
              </div>
              <button type="button" aria-label="Закрыть выбор" (click)="closeRoleAbility()">
                ×
              </button>
            </header>
            <div class="sheet-scroll option-list">
              @for (cardId of intent.cost.eligibleCardIds; track cardId) {
                <button
                  type="button"
                  [class.selected]="roleAbilityCostSelection().includes(cardId)"
                  (click)="toggleRoleAbilityCost(cardId, intent.cost.count)"
                >
                  <strong>{{ ownCardName(cardId) }}</strong>
                  <small>{{
                    roleAbilityCostSelection().includes(cardId) ? 'Выбрано' : 'Нажмите для выбора'
                  }}</small>
                </button>
              }
            </div>
            <footer>
              <button
                type="button"
                class="primary"
                [disabled]="roleAbilityCostSelection().length !== intent.cost.count"
                (click)="confirmRoleAbility(intent)"
              >
                Применить способность
              </button>
            </footer>
          </section>
        </div>
      }

      @if (cardUses(); as uses) {
        <div class="backdrop">
          <section
            class="sheet compact-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="use-title"
          >
            <header>
              <h2 id="use-title">Как сыграть карту?</h2>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть меню действий"
                (click)="cardUses.set(null)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll option-list">
              @for (use of uses; track use.label) {
                <button type="button" (click)="chooseUse(use)">{{ use.label }}</button>
              }
            </div>
          </section>
        </div>
      }

      @if (helpOpen()) {
        <div class="backdrop">
          <section
            class="sheet compact-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <header>
              <h2 id="help-title">Помощь в бою</h2>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть переговоры"
                (click)="helpOpen.set(false)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll help-sheet">
              @if (game().combat?.helpOffer; as offer) {
                <p>
                  <strong>{{ playerName(game().combat!.playerId) }}</strong> просит
                  <strong>{{ playerName(offer.helperId) }}</strong>
                </p>
                <div class="power-preview">
                  <span>Активный {{ activeCombatPower() }}</span
                  ><span>Помощник {{ helperPower(offer.helperId) }}</span
                  ><span>Вместе {{ activeCombatPower() + helperPower(offer.helperId) }}</span
                  ><span>Монстры {{ game().combat!.monsterPower }}</span>
                </div>
                <p>
                  Предложено сокровищ:
                  <b>{{ offer.treasureCount }} / {{ combatTreasureReward() }}</b>
                </p>
                <p>
                  <time>Ответ до {{ deadlineLabel(offer.expiresAtEpochMs) }}</time>
                </p>
                @if (hasIntent('ACCEPT_HELP_OFFER')) {
                  <button class="primary" type="button" (click)="sendAction('ACCEPT_HELP_OFFER')">
                    Принять
                  </button>
                  <button type="button" (click)="sendAction('REJECT_HELP_OFFER')">
                    Отказаться
                  </button>
                }
                @if (hasIntent('CANCEL_HELP_OFFER')) {
                  <button type="button" (click)="sendAction('CANCEL_HELP_OFFER')">
                    Отозвать запрос
                  </button>
                }
              } @else {
                <label
                  >Кого позвать
                  <select
                    [ngModel]="selectedHelperId()"
                    (ngModelChange)="selectedHelperId.set($event)"
                  >
                    @for (id of helperIds(); track id) {
                      <option [value]="id">{{ playerName(id) }}</option>
                    }
                  </select>
                </label>
                <div class="counter">
                  <span>Сокровищ</span
                  ><button type="button" (click)="decreaseHelpTreasure()">−</button
                  ><b>{{ helpTreasure() }} / {{ helpTreasureLimits().max }}</b
                  ><button
                    type="button"
                    [disabled]="helpTreasure() >= helpTreasureLimits().max"
                    (click)="increaseHelpTreasure()"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  class="primary"
                  [disabled]="selectedHelperId() === null"
                  (click)="proposeHelp()"
                >
                  Отправить
                </button>
              }
            </div>
          </section>
        </div>
      }

      @if (selectedCard(); as card) {
        <div class="backdrop card-details-backdrop">
          <section
            class="sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-title"
          >
            <header>
              <div>
                <small>{{ cardType(card) }}</small>
                <h2 id="details-title">{{ cardName(card) }}</h2>
              </div>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть описание карты"
                (click)="selectedCard.set(null)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll card-details">
              <app-card-artwork [artKey]="card.artKey" [label]="cardName(card)" />
              <p>{{ cardDescription(card) }}</p>
              @if (card.equipped; as equipped) {
                <section class="equipment-detail" aria-label="Улучшения снаряжения">
                  <strong>Итоговый вклад: {{ signed(equipped.resolvedCombatBonus) }} силы</strong>
                  @if (card.equipment?.modifier) {
                    <span class="passive-effect-chip">Пассивный эффект</span>
                  }
                  @if (equipped.attachments.length > 0) {
                    <h3>Прикреплённые усилители</h3>
                    @for (attachment of equipped.attachments; track attachment.card.instanceId) {
                      <button
                        type="button"
                        class="equipment-attachment"
                        (click)="selectedCard.set(attachment.card)"
                      >
                        <app-card-artwork
                          [artKey]="attachment.card.artKey"
                          [label]="cardName(attachment.card)"
                          [compact]="true"
                        />
                        <span
                          ><b>{{ cardName(attachment.card) }}</b
                          ><small>+{{ attachment.combatBonus }} силы</small></span
                        >
                      </button>
                    }
                  }
                </section>
              }
              @for (fact of cardFacts(card); track fact) {
                <span>{{ fact }}</span>
              }
            </div>
            @if (cardActions(card).length > 0 || replacementCardIds(card).length > 0) {
              <footer class="card-detail-actions" aria-label="Действия с картой">
                @for (use of cardActions(card); track use.label) {
                  <button type="button" class="primary" (click)="chooseCardDetailUse(use)">
                    {{ use.label }}
                  </button>
                }
                @if (replacementCardIds(card).length > 0) {
                  <button type="button" class="primary" (click)="replaceEquipment(card)">
                    Переодеть · {{ signed(replacementPowerDelta(card)) }} силы
                  </button>
                }
              </footer>
            }
          </section>
        </div>
      }

      @if (historyOpen()) {
        <div class="backdrop">
          <section
            class="sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <header>
              <h2 id="history-title">История</h2>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть историю"
                (click)="historyOpen.set(false)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll history-list" #historyList>
              <div class="history-filters" aria-label="Фильтр истории">
                @for (filter of historyFilters(); track filter.id) {
                  <button
                    type="button"
                    [class.selected]="historyFilter() === filter.id"
                    [attr.aria-pressed]="historyFilter() === filter.id"
                    (click)="historyFilter.set(filter.id)"
                  >
                    {{ filter.label }}
                  </button>
                }
              </div>
              @for (turn of historyTurns(); track turn.turnNumber) {
                <section class="history-turn">
                  <h3>Ход {{ turn.turnNumber }}</h3>
                  @for (event of turn.events; track event.entry.sequence) {
                    <button
                      type="button"
                      [class]="historyEventClass(event.entry.type)"
                      [class.private]="event.entry.visibility === 'PRIVATE'"
                      (click)="openEventCard(event.entry.card ?? event.entry.cards?.[0] ?? null)"
                    >
                      <small>
                        {{ event.entry.visibility === 'PRIVATE' ? 'Только вам · ' : ''
                        }}{{ phaseLabel(event.entry.phase) }}
                      </small>
                      <span>{{ event.summary }}</span>
                    </button>
                  }
                </section>
              }
            </div>
          </section>
        </div>
      }

      @if (breakdownOpen()) {
        @if (game().combat; as combat) {
          <div class="backdrop">
            <section
              class="sheet compact-sheet"
              appFocusTrap
              role="dialog"
              aria-modal="true"
              aria-labelledby="breakdown-title"
            >
              <header>
                <h2 id="breakdown-title">Расчёт силы</h2>
                <button
                  type="button"
                  appAutoFocus
                  aria-label="Закрыть расчёт"
                  (click)="breakdownOpen.set(false)"
                >
                  ×
                </button>
              </header>
              <div class="sheet-scroll breakdown">
                <h3>Игроки · {{ combat.playerPower }}</h3>
                @for (line of combatBreakdown(combat.playerId); track $index) {
                  <p>
                    <span>{{ powerSource(line.source) }}</span
                    ><b>{{ signed(line.amount) }}</b>
                  </p>
                }
                <h3>Монстры · {{ combat.monsterPower }}</h3>
                @for (monster of combat.monsters; track monster.encounterId) {
                  <article class="breakdown-monster">
                    <app-card-artwork
                      [artKey]="monster.monster.artKey"
                      [label]="cardName(monster.monster)"
                      [compact]="true"
                    />
                    <div class="breakdown-monster-details">
                      <strong>{{ cardName(monster.monster) }}</strong>
                      <span
                        >Сила <b>{{ monster.currentStrength }}</b></span
                      >
                      <span
                        >Уровни <b>{{ monster.baseLevelRewards }}</b></span
                      >
                      <span
                        >Сокровища <b>{{ monster.currentTreasures }}</b></span
                      >
                      @for (played of monster.playedCards; track played.card.instanceId) {
                        <button
                          type="button"
                          class="breakdown-modifier"
                          (click)="selectedCard.set(played.card)"
                        >
                          <app-card-artwork
                            [artKey]="played.card.artKey"
                            [label]="cardName(played.card)"
                            [compact]="true"
                          />
                          <span
                            ><strong>{{ cardName(played.card) }}</strong
                            ><small
                              >Сила {{ signed(played.strengthModifier) }} · сокровища
                              {{ signed(played.treasureModifier) }}</small
                            ></span
                          >
                        </button>
                      }
                    </div>
                  </article>
                }
              </div>
            </section>
          </div>
        }
      }

      @if (selectedPlayerId(); as id) {
        <div class="backdrop">
          <section
            class="sheet compact-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="character-title"
          >
            <header>
              <h2 id="character-title">{{ playerName(id) }}</h2>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть персонажа"
                (click)="selectedPlayerId.set(null)"
              >
                ×
              </button>
            </header>
            @if (player(id); as value) {
              <div class="sheet-scroll character">
                <b>Уровень {{ value.level }} · сила {{ value.combatPower }}</b>
                <p>
                  Пол: {{ sexLabel(value.sex) }} · Рука: {{ value.handCount }}/{{
                    game().config?.maxHandSize ?? 5
                  }}
                </p>
                <p>{{ characterStatus(value) }}</p>
                <p>
                  Классы: {{ rolesLabel(value.classCards, value.classCard) }} · Расы:
                  {{ rolesLabel(value.raceCards, value.raceCard) }}
                </p>
                @if (
                  (value.hirelingCards?.length ?? 0) > 0 ||
                  (value.mountCards?.length ?? 0) > 0 ||
                  value.hirelingCard ||
                  value.mountCard
                ) {
                  <p>
                    Спутники:
                    {{ rolesLabel(value.hirelingCards, value.hirelingCard ?? null) }} ·
                    {{ rolesLabel(value.mountCards, value.mountCard ?? null) }}
                  </p>
                }
                <h3>Снаряжение</h3>
                <app-equipment-layout
                  [player]="value"
                  [labels]="equipmentLabels"
                  [cardName]="displayCardName"
                  (cardOpened)="selectedCard.set($event)"
                />
              </div>
            }
          </section>
        </div>
      }

      @if (menuOpen()) {
        <div class="backdrop">
          <section
            class="sheet menu-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
          >
            <header>
              <h2 id="menu-title">Меню</h2>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть меню"
                (click)="menuOpen.set(false)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll option-list">
              <button type="button" (click)="toggleLocale()">
                Язык: {{ locale() === 'ru' ? 'Русский' : 'English' }}
              </button>
              @if (game().status === 'FINISHED' && isHost()) {
                <button type="button" (click)="rematch()">Играть снова</button
                ><button type="button" (click)="returnToLobby()">В лобби</button>
              }
            </div>
          </section>
        </div>
      }

      @if (saleOpen()) {
        <div class="backdrop">
          <section
            class="sheet compact-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-title"
          >
            <header>
              <div>
                <small>ПРОДАЖА</small>
                <h2 id="sale-title">{{ saleTotal() }} / 1000</h2>
              </div>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть продажу"
                (click)="saleOpen.set(false)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll sale-sheet">
              <p>
                Будет получено уровней: {{ saleLevels() }}. Остаток {{ saleRemainder() }} не
                сохраняется.
              </p>
              @if (game().self.level >= 9) {
                <p class="warning-copy">Продажа не может дать 10-й победный уровень.</p>
              }
              @for (card of saleCards(); track card.instanceId) {
                <article
                  class="sale-card"
                  [class.selected]="saleSelection().includes(card.instanceId)"
                  [class.equipped]="isEquipped(card)"
                >
                  <div class="sale-card-main">
                    <button
                      type="button"
                      class="sale-card-artwork"
                      [attr.aria-label]="'Подробнее: ' + cardName(card)"
                      (click)="openSaleCard($event, card)"
                    >
                      <app-card-artwork
                        [artKey]="card.artKey"
                        [label]="cardName(card)"
                        [compact]="true"
                      />
                    </button>
                    <button
                      type="button"
                      class="sale-card-select"
                      [attr.aria-pressed]="saleSelection().includes(card.instanceId)"
                      (click)="toggleSale(card.instanceId)"
                    >
                      <span>{{ cardName(card) }}</span>
                      @if (isEquipped(card)) {
                        <small class="sale-card-badge">Надето</small>
                      }
                      <b>{{ card.goldValue ?? card.equipment?.value ?? 0 }}</b>
                    </button>
                  </div>
                </article>
              }
            </div>
            <footer>
              <button
                type="button"
                class="primary"
                [disabled]="saleTotal() < 1000 || saleLevels() === 0"
                (click)="confirmSale()"
              >
                Продать
              </button>
            </footer>
          </section>
        </div>
      }

      @if (charityOpen()) {
        <div class="backdrop">
          <section
            class="sheet compact-sheet"
            appFocusTrap
            role="dialog"
            aria-modal="true"
            aria-labelledby="charity-title"
          >
            <header>
              <div>
                <small>ЛИМИТ РУКИ</small>
                <h2 id="charity-title">Отдайте {{ charityIntent()?.count ?? 0 }}</h2>
              </div>
              <button
                type="button"
                appAutoFocus
                aria-label="Закрыть милостыню"
                (click)="charityOpen.set(false)"
              >
                ×
              </button>
            </header>
            <div class="sheet-scroll sale-sheet">
              <p>{{ charityRecipientCopy() }}</p>
              @for (card of game().self.hand; track card.instanceId) {
                <article
                  class="sale-card charity-card"
                  [class.selected]="charitySelection().includes(card.instanceId)"
                >
                  <div class="sale-card-main">
                    <button
                      type="button"
                      class="sale-card-artwork"
                      [attr.aria-label]="'Подробнее: ' + cardName(card)"
                      (click)="openSaleCard($event, card)"
                    >
                      <app-card-artwork
                        [artKey]="card.artKey"
                        [label]="cardName(card)"
                        [compact]="true"
                      />
                    </button>
                    <button
                      type="button"
                      class="sale-card-select"
                      [attr.aria-pressed]="charitySelection().includes(card.instanceId)"
                      (click)="toggleCharity(card.instanceId)"
                    >
                      <span>{{ cardName(card) }}</span>
                    </button>
                  </div>
                </article>
              }
              @if ((charityIntent()?.recipientIds?.length ?? 0) > 1) {
                <label
                  >Получатель
                  <select
                    [ngModel]="charityRecipientId()"
                    (ngModelChange)="charityRecipientId.set($event)"
                  >
                    @for (id of charityIntent()?.recipientIds ?? []; track id) {
                      <option [value]="id">{{ playerName(id) }}</option>
                    }
                  </select></label
                >
              }
            </div>
            <footer>
              <button
                type="button"
                class="primary"
                [disabled]="charitySelection().length !== (charityIntent()?.count ?? 0)"
                (click)="confirmCharity()"
              >
                Отдать
              </button>
            </footer>
          </section>
        </div>
      }
    </main>
  `,
  styleUrl: './game-shell.component.scss',
})
export class GameShellComponent {
  private readonly lobbyClient = inject(LobbyClient);
  private readonly localization = inject(LocalizationService);
  readonly game = input.required<GameView>();
  readonly error = input<UserFacingError | null>(null);
  readonly connectionOverride = input<ConnectionState | null>(null);
  protected readonly connection = this.lobbyClient.connection;
  protected readonly isHost = this.lobbyClient.isHost;
  protected readonly connectionState = computed(
    () => this.connectionOverride() ?? this.connection(),
  );
  protected readonly locale = this.localization.locale;
  protected readonly stage = computed(() => selectStage(this.game()));
  protected readonly allEvents = computed(() =>
    presentEvents(this.game(), (card) => this.cardName(card)),
  );
  protected readonly recentEvents = computed(() => {
    const stageSequences = new Set(stageExplainedEventSequences(this.game()));
    return this.allEvents()
      .filter((event) => !stageSequences.has(event.entry.sequence))
      .slice(-5)
      .reverse();
  });
  protected readonly playableIds = computed(() => this.collectPlayableIds());
  protected readonly sortedHand = computed(() =>
    [...this.game().self.hand].sort(
      (a, b) =>
        Number(this.playableIds().includes(b.instanceId)) -
        Number(this.playableIds().includes(a.instanceId)),
    ),
  );
  protected readonly filteredHand = computed(() => {
    const filter = this.handFilter();
    return this.sortedHand().filter((card) => {
      if (filter === 'ALL') return true;
      if (filter === 'PLAYABLE') return this.playableIds().includes(card.instanceId);
      if (filter === 'EQUIPMENT') return card.type === 'EQUIPMENT';
      if (filter === 'COMBAT')
        return (
          card.type === 'TEMPORARY_BONUS' && (card.play?.timings.includes('ACTIVE_COMBAT') ?? false)
        );
      if (filter === 'CURSES') return card.type === 'CURSE' || card.type === 'COMBAT_CURSE';
      if (filter === 'MONSTERS') return card.type === 'MONSTER';
      if (filter === 'RACES') return card.type === 'RACE';
      if (filter === 'CLASSES') return card.type === 'CLASS';
      return !['EQUIPMENT', 'MONSTER', 'CURSE', 'COMBAT_CURSE', 'RACE', 'CLASS'].includes(
        card.type,
      );
    });
  });
  protected readonly primaryActions = computed(() =>
    this.game()
      .availableIntents.map((intent) => intent.kind)
      .filter((kind): kind is AvailableGameAction =>
        [
          'KICK_DOOR',
          'LOOK_FOR_TROUBLE',
          'SCAVENGE',
          'PROPOSE_HELP',
          'ACCEPT_HELP_OFFER',
          'REJECT_HELP_OFFER',
          'CANCEL_HELP_OFFER',
          'DECLARE_COMBAT_VICTORY',
          'PASS_COMBAT_REACTION',
          'RUN_AWAY',
          'LOOT_ROOM',
          'END_TURN',
        ].includes(kind),
      ),
  );
  protected readonly hasPlayableCombatCards = computed(() =>
    this.game().availableIntents.some(
      (intent) => intent.kind === 'PLAY_CARD' && 'combatId' in intent,
    ),
  );
  protected readonly utilityActions = computed<readonly ActionDockUtilityAction[]>(() => [
    ...(this.saleCards().length > 0 && this.game().self.level < 9
      ? [{ id: 'SELL_CARDS' as const, label: 'Продать карты', hint: 'Получить уровни' }]
      : []),
    ...(this.charityIntent() === undefined
      ? []
      : [
          {
            id: 'GIVE_CHARITY' as const,
            label: 'Раздать милостыню',
            hint: `Отдать ${this.localization.cardsCount(this.charityIntent()!.count)}`,
          },
        ]),
  ]);
  protected readonly helperIds = computed(() => {
    const intent = this.intent('PROPOSE_HELP');
    return intent?.kind === 'PROPOSE_HELP' ? intent.helperIds : [];
  });
  protected readonly helpTreasureLimits = computed(() => {
    const proposal = this.intent('PROPOSE_HELP');
    if (proposal?.kind === 'PROPOSE_HELP')
      return { min: proposal.minTreasures, max: proposal.maxTreasures };
    return { min: 0, max: 0 };
  });
  protected readonly charityIntent = computed(() =>
    this.game().availableIntents.find(
      (intent): intent is Extract<AvailableIntentView, { kind: 'GIVE_CHARITY' }> =>
        intent.kind === 'GIVE_CHARITY',
    ),
  );
  protected readonly saleCards = computed(() => {
    const ids =
      this.game().availableIntents.find(
        (intent): intent is Extract<AvailableIntentView, { kind: 'SELL_CARDS' }> =>
          intent.kind === 'SELL_CARDS',
      )?.cardIds ?? [];
    return [...this.game().self.hand, ...this.game().self.equipment].filter((card) =>
      ids.includes(card.instanceId),
    );
  });
  protected readonly saleTotal = computed(() =>
    this.saleSelection().reduce(
      (total, cardId) =>
        total +
        (this.saleCards().find((card) => card.instanceId === cardId)?.goldValue ??
          this.saleCards().find((card) => card.instanceId === cardId)?.equipment?.value ??
          0),
      0,
    ),
  );
  protected readonly saleLevels = computed(() =>
    Math.min(Math.floor(this.saleTotal() / 1000), Math.max(0, 9 - this.game().self.level)),
  );
  protected readonly saleRemainder = computed(() => this.saleTotal() % 1000);
  protected readonly historyTurns = computed(() => {
    const events = this.allEvents().filter((event) => {
      if (this.historyFilter() === 'CURRENT_TURN')
        return event.entry.turnNumber === this.game().turnNumber;
      if (this.historyFilter().startsWith('PLAYER:')) {
        const playerId = this.historyFilter().slice('PLAYER:'.length);
        return event.entry.playerId === playerId || event.entry.targetPlayerId === playerId;
      }
      if (this.historyFilter() === 'COMBAT')
        return [
          'COMBAT_STARTED',
          'COMBAT_WON',
          'COMBAT_VICTORY_DECLARED',
          'COMBAT_VICTORY_CANCELLED',
          'RUN_AWAY_ATTEMPTED',
          'BAD_STUFF_APPLIED',
          'HELP_OFFERED',
          'HELP_OFFER_ACCEPTED',
        ].includes(event.entry.type);
      return true;
    });
    const grouped = new Map<number, typeof events>();
    for (const event of events)
      grouped.set(event.entry.turnNumber, [...(grouped.get(event.entry.turnNumber) ?? []), event]);
    return [...grouped.entries()]
      .sort(([leftTurn], [rightTurn]) => rightTurn - leftTurn)
      .map(([turnNumber, turnEvents]) => ({
        turnNumber,
        events: [...turnEvents].reverse(),
      }));
  });
  protected readonly handFilters = [
    { id: 'ALL', label: 'Все' },
    { id: 'PLAYABLE', label: 'Сейчас' },
    { id: 'EQUIPMENT', label: 'Снаряжение' },
    { id: 'COMBAT', label: 'Усиления в бою' },
    { id: 'CURSES', label: 'Проклятия' },
    { id: 'MONSTERS', label: 'Монстры' },
    { id: 'RACES', label: 'Расы' },
    { id: 'CLASSES', label: 'Классы' },
    { id: 'OTHER', label: 'Остальное' },
  ] as const;
  protected readonly historyFilters = computed(() => [
    { id: 'ALL', label: 'Все' },
    { id: 'CURRENT_TURN', label: 'Текущий ход' },
    { id: 'COMBAT', label: 'Бой' },
    ...this.game().players.map((player) => ({
      id: `PLAYER:${player.playerId}`,
      label: player.name,
    })),
  ]);
  protected readonly equipmentLabels = {
    head: 'Голова',
    body: 'Тело',
    feet: 'Ноги',
    leftHand: 'Левая рука',
    rightHand: 'Правая рука',
    class: 'Класс',
    race: 'Раса',
    hireling: 'Спутник',
    mount: 'Маунт',
    permissions: 'Разрешения',
    empty: 'Свободно',
    twoHanded: 'две руки',
  };
  protected readonly displayCardName = (card: GameCardView): string => this.cardName(card);
  protected readonly selectedCard = signal<GameCardView | null>(null);
  protected readonly selectedPlayerId = signal<string | null>(null);
  protected readonly fullHandOpen = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly breakdownOpen = signal(false);
  protected readonly helpOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly saleOpen = signal(false);
  protected readonly charityOpen = signal(false);
  protected readonly handFilter = signal<(typeof this.handFilters)[number]['id']>('ALL');
  protected readonly historyFilter = signal('ALL');
  protected readonly saleSelection = signal<readonly string[]>([]);
  protected readonly charitySelection = signal<readonly string[]>([]);
  protected readonly charityRecipientId = signal<string | null>(null);
  protected readonly targetPicker = signal<TargetPickerState | null>(null);
  protected readonly cardUses = signal<readonly CardUse[] | null>(null);
  protected readonly roleAbilityIntent = signal<Extract<
    AvailableIntentView,
    { readonly kind: 'USE_ROLE_ABILITY' }
  > | null>(null);
  protected readonly roleAbilityCostSelection = signal<readonly string[]>([]);
  protected readonly selectedHelperId = signal<string | null>(null);
  protected readonly helpTreasure = signal(0);
  protected readonly decisionSelection = signal<readonly string[]>([]);
  protected readonly isFullscreen = signal(document.fullscreenElement !== null);
  protected readonly fullscreenSupported =
    typeof document.documentElement.requestFullscreen === 'function';

  constructor() {
    effect(() => {
      const game = this.game();
      if (this.saleOpen() && (game.self.level >= 9 || this.saleCards().length === 0))
        this.saleOpen.set(false);
      if (this.charityOpen() && this.charityIntent() === undefined) this.charityOpen.set(false);
      const validSaleIds = new Set(this.saleCards().map((card) => card.instanceId));
      this.saleSelection.update((ids) => ids.filter((id) => validSaleIds.has(id)));
      const validHandIds = new Set(game.self.hand.map((card) => card.instanceId));
      this.charitySelection.update((ids) => ids.filter((id) => validHandIds.has(id)));
    });
  }

  protected sendAction(action: AvailableGameAction): void {
    if (action === 'LOOK_FOR_TROUBLE') {
      const cards = this.game().self.hand.filter((card) =>
        this.game().availableIntents.some(
          (intent) => intent.kind === 'LOOK_FOR_TROUBLE' && intent.cardId === card.instanceId,
        ),
      );
      this.openPickerForCards('Выберите монстра', cards, 'HAND_MONSTER');
      return;
    }
    if (action === 'PROPOSE_HELP') {
      this.openHelp();
      return;
    }
    const intent = this.intent(action);
    const command = intent === undefined ? null : this.commandForIntent(intent);
    if (command !== null) {
      this.helpOpen.set(false);
      this.send(command);
    }
  }
  protected openUtilityAction(action: ActionDockUtilityAction['id']): void {
    if (action === 'SELL_CARDS') this.saleOpen.set(true);
    else this.charityOpen.set(true);
  }

  protected activateCard(card: GameCardView): void {
    this.selectedCard.set(card);
  }

  protected chooseCardDetailUse(use: CardUse): void {
    this.selectedCard.set(null);
    this.selectedPlayerId.set(null);
    this.chooseUse(use);
  }

  protected replacementCardIds(card: GameCardView): readonly string[] {
    return this.equipmentReplacementIntent(card)?.replaceCardIds ?? [];
  }

  protected replaceEquipment(card: GameCardView): void {
    const cardIds = this.replacementCardIds(card);
    if (cardIds.length === 0) return;
    this.selectedCard.set(null);
    this.lobbyClient.sendGameCommands([
      ...cardIds.map((cardId) => ({ type: 'UNEQUIP_ITEM' as const, cardId })),
      { type: 'EQUIP_ITEM', cardId: card.instanceId },
    ]);
  }

  protected replacementPowerDelta(card: GameCardView): number {
    return this.equipmentReplacementIntent(card)?.permanentCombatPowerIncrease ?? 0;
  }

  private equipmentReplacementIntent(card: GameCardView):
    | (Extract<AvailableIntentView, { readonly kind: 'EQUIP_ITEM' }> & {
        readonly replaceCardIds: readonly string[];
        readonly permanentCombatPowerIncrease: number;
      })
    | undefined {
    return this.game().availableIntents.find(
      (
        intent,
      ): intent is Extract<AvailableIntentView, { readonly kind: 'EQUIP_ITEM' }> & {
        readonly replaceCardIds: readonly string[];
        readonly permanentCombatPowerIncrease: number;
      } =>
        intent.kind === 'EQUIP_ITEM' &&
        intent.cardId === card.instanceId &&
        intent.replaceCardIds !== undefined &&
        intent.permanentCombatPowerIncrease !== undefined,
    );
  }

  protected chooseUse(use: CardUse): void {
    this.cardUses.set(null);
    if (use.command?.type !== 'EQUIP_ITEM') this.fullHandOpen.set(false);
    if (use.command) this.send(use.command);
    else if (use.picker) this.targetPicker.set(use.picker);
    else if (use.roleAbility) {
      this.roleAbilityCostSelection.set([]);
      this.roleAbilityIntent.set(use.roleAbility);
    }
  }

  protected toggleRoleAbilityCost(cardId: string, maximum: number): void {
    this.roleAbilityCostSelection.update((ids) =>
      ids.includes(cardId)
        ? ids.filter((id) => id !== cardId)
        : ids.length < maximum
          ? [...ids, cardId]
          : ids,
    );
  }

  protected closeRoleAbility(): void {
    this.roleAbilityIntent.set(null);
    this.roleAbilityCostSelection.set([]);
  }

  protected confirmRoleAbility(
    intent: Extract<AvailableIntentView, { readonly kind: 'USE_ROLE_ABILITY' }>,
  ): void {
    if (this.roleAbilityCostSelection().length !== intent.cost.count) return;
    this.send({
      type: 'USE_ROLE_ABILITY',
      roleCardId: intent.roleCardId,
      costCardIds: this.roleAbilityCostSelection(),
      target:
        intent.target.type === 'EQUIPMENT'
          ? { type: 'EQUIPMENT', cardId: intent.target.cardId }
          : intent.target,
      ...('combatId' in intent
        ? {
            combatId: intent.combatId,
            combatRevision: intent.combatRevision,
            ...(intent.reactionWindowId === undefined
              ? {}
              : { reactionWindowId: intent.reactionWindowId }),
          }
        : {}),
    });
    this.closeRoleAbility();
  }

  protected chooseTarget(picker: TargetPickerState, id: string): void {
    this.targetPicker.set(null);
    const reactionWindowId = this.game().combat?.reactionWindow?.windowId;
    if (picker.kind === 'CURSE')
      this.send({ type: 'PLAY_CURSE', cardId: picker.card.instanceId, targetPlayerId: id });
    else if (picker.kind === 'PLAYER_CARD')
      this.send({
        type: 'PLAY_CARD',
        cardId: picker.card.instanceId,
        target: { type: 'PLAYER', playerId: id },
      });
    else if (picker.kind === 'COMBAT_CURSE' && reactionWindowId !== undefined)
      this.send({
        type: 'PLAY_COMBAT_CURSE',
        cardId: picker.card.instanceId,
        targetPlayerId: id,
        reactionWindowId,
        combatId: this.game().combat!.combatId,
        combatRevision: this.game().combat!.revision,
      });
    else if (picker.kind === 'MONSTER')
      this.send({
        type: 'PLAY_CARD',
        cardId: picker.card.instanceId,
        target: { type: 'MONSTER', encounterId: id },
        combatId: this.game().combat?.combatId,
        combatRevision: this.game().combat?.revision,
      });
    else if (picker.kind === 'HAND_MONSTER') {
      if (
        this.game().availableIntents.some(
          (intent) => intent.kind === 'LOOK_FOR_TROUBLE' && intent.cardId === id,
        )
      )
        this.send({ type: 'LOOK_FOR_TROUBLE', cardId: id });
      else
        this.send({
          type: 'PLAY_CARD',
          cardId: picker.card.instanceId,
          target: { type: 'HAND_MONSTER', monsterCardId: id },
          combatId: this.game().combat?.combatId,
          combatRevision: this.game().combat?.revision,
        });
    } else if (picker.kind === 'EQUIPMENT')
      this.send({
        type: 'PLAY_CARD',
        cardId: picker.card.instanceId,
        target: { type: 'EQUIPMENT', cardId: id },
      });
    else if (picker.kind === 'TRADE')
      this.send({ type: 'TRADE_ITEM', cardId: picker.card.instanceId, recipientId: id });
  }

  protected openHelp(): void {
    this.selectedHelperId.set(
      this.helperIds()[0] ?? this.game().combat?.helpOffer?.helperId ?? null,
    );
    this.helpTreasure.set(
      this.clampHelpTreasure(this.game().combat?.helpOffer?.treasureCount ?? 0),
    );
    this.helpOpen.set(true);
  }
  protected openCombatHand(): void {
    this.handFilter.set('COMBAT');
    this.fullHandOpen.set(true);
  }
  protected openFullHand(): void {
    this.handFilter.set('ALL');
    this.fullHandOpen.set(true);
  }
  protected proposeHelp(): void {
    const combat = this.game().combat,
      id = this.selectedHelperId();
    if (combat && id) {
      this.send({
        type: 'PROPOSE_HELP',
        helperId: id,
        treasureCount: this.clampHelpTreasure(this.helpTreasure()),
        combatId: combat.combatId,
        combatRevision: combat.revision,
      });
      this.helpOpen.set(false);
    }
  }
  protected decreaseHelpTreasure(): void {
    this.helpTreasure.update((value) => this.clampHelpTreasure(value - 1));
  }
  protected increaseHelpTreasure(): void {
    this.helpTreasure.update((value) => this.clampHelpTreasure(value + 1));
  }
  private clampHelpTreasure(value: number): number {
    const { min, max } = this.helpTreasureLimits();
    return Math.max(min, Math.min(max, value));
  }
  protected activeCombatPower(): number {
    return (
      this.game().players.find((player) => player.playerId === this.game().combat?.playerId)
        ?.combatPower ?? 0
    );
  }
  protected helperPower(id: string): number {
    return this.game().players.find((player) => player.playerId === id)?.combatPower ?? 0;
  }
  protected combatTreasureReward(): number {
    return (
      this.game().combat?.monsters.reduce(
        (total, monster) => total + monster.currentTreasures,
        0,
      ) ?? 0
    );
  }
  protected playerName(id: string): string {
    return this.player(id)?.name ?? 'Игрок';
  }
  protected ownCardName(id: string): string {
    const card = [...this.game().self.hand, ...this.game().self.equipment].find(
      (candidate) => candidate.instanceId === id,
    );
    return card === undefined ? 'карта' : this.cardName(card);
  }
  protected deadlineLabel(expiresAtEpochMs: number): string {
    return new Date(expiresAtEpochMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  protected declineCurse(responseId: string): void {
    this.send({
      type: 'RESPOND_TO_CURSE',
      responseId,
      response: { type: 'DECLINE' },
    });
  }
  protected cancelCurse(responseId: string, cardId: string): void {
    this.send({
      type: 'RESPOND_TO_CURSE',
      responseId,
      response: { type: 'USE_PROTECTION', cardId },
    });
  }
  protected protectCurseItem(responseId: string, cardId: string, protectedCardId: string): void {
    this.send({
      type: 'RESPOND_TO_CURSE',
      responseId,
      response: { type: 'USE_PROTECTION', cardId, protectedCardId },
    });
  }
  protected player(id: string) {
    return this.game().players.find((candidate) => candidate.playerId === id) ?? null;
  }
  protected cardReason(card: GameCardView): string {
    return unavailableReason(this.game(), card.instanceId);
  }
  protected errorMessage(error: UserFacingError): string {
    return this.localization.errorMessage(error);
  }
  protected cardName(card: GameCardView): string {
    return this.localization.cardName(card);
  }
  protected cardDescription(card: GameCardView): string {
    return this.localization.cardDescription(card);
  }
  protected cardType(card: GameCardView): string {
    return (
      {
        MONSTER: 'Монстр',
        CURSE: 'Проклятие',
        COMBAT_CURSE: 'Боевое проклятие',
        EQUIPMENT: 'Снаряжение',
        TEMPORARY_BONUS: 'Разовый бонус',
        MONSTER_MODIFIER: 'Модификатор монстра',
        ADD_MONSTER: 'Добавить монстра',
        CLONE_MONSTER: 'Клон монстра',
        CLASS: 'Класс',
        RACE: 'Раса',
        HIRELING: 'Наёмник',
        MOUNT: 'Скакун',
        ROLE_PERMISSION: 'Разрешение роли',
        ATTACHMENT: 'Усилитель',
        UTILITY: 'Утилита',
        OTHER: 'Карта',
      } as Record<GameCardView['type'], string>
    )[card.type];
  }
  protected historyEventClass(type: string): string {
    const tone =
      type.startsWith('COMBAT_') || type === 'RUN_AWAY_ATTEMPTED' || type === 'BAD_STUFF_APPLIED'
        ? 'combat'
        : type.startsWith('HELP_')
          ? 'help'
          : type.includes('TREASURE') || type.includes('LEVEL') || type === 'CARDS_SOLD'
            ? 'reward'
            : type.includes('CURSE')
              ? 'curse'
              : type.includes('CARD') || type.includes('ITEM') || type === 'DOOR_KICKED'
                ? 'card'
                : type.includes('PLAYER') || type.startsWith('TURN_')
                  ? 'player'
                  : 'other';
    return `history-event history-event-${tone}`;
  }
  protected sexLabel(sex: GameView['self']['sex']): string {
    return sex === 'MALE' ? 'мужской' : sex === 'FEMALE' ? 'женский' : 'не выбран';
  }
  protected characterStatus(player: GameView['players'][number]): string {
    if (player.isDead)
      return 'Вы мертвы. В начале своего следующего хода вернётесь с новыми закрытыми картами.';
    if (this.game().combat?.playerId === player.playerId) return 'Сейчас в бою.';
    if (this.game().combat?.helpAgreement?.helperId === player.playerId)
      return 'Помогает в текущем бою.';
    return 'В игре.';
  }
  protected rolesLabel(
    cards: readonly GameCardView[] | undefined,
    fallback: GameCardView | null,
  ): string {
    const values = cards ?? (fallback ? [fallback] : []);
    return values.length ? values.map((card) => this.cardName(card)).join(', ') : 'нет';
  }
  protected openEventCard(card: GameCardView | null): void {
    if (card) this.selectedCard.set(card);
  }
  protected toggleSale(cardId: string): void {
    this.saleSelection.update((ids) =>
      ids.includes(cardId) ? ids.filter((id) => id !== cardId) : [...ids, cardId],
    );
  }
  protected isEquipped(card: GameCardView): boolean {
    return this.game().self.equipment.some((equipped) => equipped.instanceId === card.instanceId);
  }
  protected openSaleCard(event: Event, card: GameCardView): void {
    event.stopPropagation();
    this.selectedCard.set(card);
  }
  protected confirmSale(): void {
    if (this.saleTotal() < 1000 || this.saleLevels() === 0) return;
    this.send({ type: 'SELL_ITEMS', cardIds: this.saleSelection() });
    this.saleOpen.set(false);
  }
  protected toggleCharity(cardId: string): void {
    const limit = this.charityIntent()?.count ?? 0;
    this.charitySelection.update((ids) =>
      ids.includes(cardId)
        ? ids.filter((id) => id !== cardId)
        : ids.length < limit
          ? [...ids, cardId]
          : ids,
    );
  }
  protected charityRecipientCopy(): string {
    const recipients = this.charityIntent()?.recipientIds ?? [];
    return recipients.length === 0
      ? 'Вы наименьшего уровня: выбранные карты будут сброшены.'
      : recipients.length === 1
        ? `Карты получит ${this.playerName(recipients[0]!)}`
        : 'Выберите игрока с наименьшим уровнем.';
  }
  protected confirmCharity(): void {
    const recipients = this.charityIntent()?.recipientIds ?? [];
    const recipientId = recipients.length === 1 ? recipients[0]! : this.charityRecipientId();
    if (this.charitySelection().length !== (this.charityIntent()?.count ?? 0)) return;
    this.send({ type: 'GIVE_CHARITY', cardIds: this.charitySelection(), recipientId });
    this.charityOpen.set(false);
  }
  protected signed(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }
  protected powerSource(source: string): string {
    return (
      (
        {
          LEVEL: 'Уровень',
          EQUIPMENT: 'Снаряжение',
          ROLE: 'Роль',
          COMPANION: 'Спутник',
          ACTIVE_EFFECT: 'Эффект',
          MAKESHIFT_TOOLS: 'Подручные средства',
        } as Record<string, string>
      )[source] ?? source
    );
  }
  protected phaseLabel(phase: GameView['phase']): string {
    return (
      {
        LOBBY: 'лобби',
        TURN_START: 'начало хода',
        KICK_DOOR: 'дверь',
        DOOR_RESOLUTION: 'результат двери',
        POST_DOOR: 'выбор',
        LOOT_ROOM: 'добыча',
        END_TURN: 'конец хода',
        FINISHED: 'конец игры',
      } as Record<GameView['phase'], string>
    )[phase];
  }
  protected combatBreakdown(playerId: string) {
    return (
      this.game().players.find((player) => player.playerId === playerId)?.combatPowerBreakdown ?? []
    );
  }

  protected decisionCards(): readonly GameCardView[] {
    const decision = this.game().pendingDecision;
    return decision?.selectableCards ?? [];
  }
  protected toggleDecision(id: string): void {
    const decision = this.game().pendingDecision;
    if (!decision || decision.playerId !== this.game().viewerPlayerId) return;
    if (decision.type === 'CHOOSE_ROLE_TO_KEEP') {
      this.decisionSelection.set([id]);
      return;
    }
    this.decisionSelection.update((ids) =>
      ids.includes(id)
        ? ids.filter((value) => value !== id)
        : ids.length < decision.count
          ? [...ids, id]
          : ids,
    );
  }
  protected decisionReady(): boolean {
    const decision = this.game().pendingDecision;
    if (!decision || decision.playerId !== this.game().viewerPlayerId) return false;
    return (
      this.decisionSelection().length === (decision.type === 'DISCARD_CARDS' ? decision.count : 1)
    );
  }
  protected confirmDecision(): void {
    const decision = this.game().pendingDecision;
    if (!decision || !this.decisionReady()) return;
    if (decision.type === 'DISCARD_CARDS') {
      const intent = this.game().availableIntents.find(
        (candidate): candidate is Extract<AvailableIntentView, { kind: 'RESOLVE_CARD_DISCARD' }> =>
          candidate.kind === 'RESOLVE_CARD_DISCARD',
      );
      this.send({
        type: 'RESOLVE_CARD_DISCARD',
        decisionId: decision.decisionId,
        cardIds: this.decisionSelection(),
        ...(intent?.combatId === undefined
          ? {}
          : {
              combatId: intent.combatId,
              combatRevision: intent.combatRevision,
            }),
      });
    } else {
      this.send({
        type: 'RESOLVE_ROLE_RETENTION',
        decisionId: decision.decisionId,
        keepCardId: this.decisionSelection()[0]!,
      });
    }
    this.decisionSelection.set([]);
  }

  protected cardFacts(card: GameCardView): readonly string[] {
    const facts: string[] = [];
    facts.push(`Длительность: ${this.durationLabel(card.duration)}`);
    if (card.monster) {
      facts.push(
        `Сила: ${card.monster.strength ?? card.monster.level ?? 0}`,
        `Уровней: ${card.monster.levelRewards}`,
        `Сокровищ: ${card.monster.treasureRewards}`,
      );
      if (card.monster.badStuff.length)
        facts.push(
          `Непотребство: ${card.monster.badStuff.map((effect) => this.effectLabel(effect)).join(', ')}`,
        );
    }
    if (card.equipment)
      facts.push(
        `Бонус: +${card.equipment.combatBonus}`,
        `Слот: ${this.slotLabel(card.equipment.slot)}`,
        `Руки: ${card.equipment.hands}`,
      );
    if (card.equipped) {
      facts.push(`Итоговый вклад: ${this.signed(card.equipped.resolvedCombatBonus)} силы`);
      if (card.equipped.attachments.length)
        facts.push(
          `Усилители: ${card.equipped.attachments.map((attachment) => `${this.cardName(attachment.card)} (+${attachment.combatBonus})`).join(', ')}`,
        );
    }
    if (card.effects.length > 0)
      facts.push(...card.effects.map((effect) => `Эффект: ${this.cardEffectLabel(effect)}`));
    for (const modifier of card.monster?.modifiers ?? [])
      facts.push(`Пассив монстра: ${this.modifierLabel(modifier)}`);
    if (card.equipment?.modifier)
      facts.push(`Пассив снаряжения: ${this.modifierLabel(card.equipment.modifier)}`);
    if (card.companion)
      facts.push(
        `Спутник: +${card.companion.combatBonus} к боевой силе${card.companion.modifier ? `; ${this.modifierLabel(card.companion.modifier)}` : ''}`,
      );
    if (card.role?.modifier) facts.push(`Пассив роли: ${this.modifierLabel(card.role.modifier)}`);
    if (card.role?.activeAbility)
      facts.push(`Активная способность: ${this.roleAbilityLabel(card.role.activeAbility)}`);
    if (card.curse)
      facts.push(
        `Тяжесть проклятия: ${{ EARLY: 'ранняя', MID: 'средняя', LATE: 'поздняя' }[card.curse.severity]}`,
      );
    if (card.curseProtection)
      facts.push(
        `Защита: ${card.curseProtection.mode === 'CANCEL' ? 'отменяет подходящее проклятие' : 'защищает один подходящий предмет'}${card.curseProtection.conditions?.length ? ` (${card.curseProtection.conditions.map((condition) => this.conditionLabel(condition)).join(' и ')})` : ''}`,
      );
    if (card.rolePermission)
      facts.push(
        `Постоянно разрешает ещё одну роль: ${card.rolePermission.role === 'CLASS' ? 'Класс' : 'Раса'}`,
      );
    for (const modifier of card.capacityModifiers ?? [])
      facts.push(
        `Вместимость: ${modifier.amount >= 0 ? '+' : ''}${modifier.amount} ${
          {
            HEAD: 'голова',
            HANDS: 'руки',
            HIRELING: 'наёмник',
            MOUNT: 'ездовой спутник',
          }[modifier.capacity]
        }`,
      );
    if (card.permanentCombatUpgrade === true)
      facts.push('Авторитетная оценка: есть легальное постоянное усиление');
    if (card.attachment)
      facts.push(
        `Прикрепление: +${card.attachment.combatBonus}; цели с метками ${card.attachment.allowedTags.map((tag) => this.tagLabel(tag)).join(', ')}`,
      );
    if (card.goldValue) facts.push(`Цена: ${card.goldValue}`);
    if (card.sellable === false) facts.push('Не продаётся');
    if (card.sellable === true) facts.push('Можно продать');
    if (card.tags?.length)
      facts.push(`Метки: ${card.tags.map((tag) => this.tagLabel(tag)).join(', ')}`);
    if (card.play)
      facts.push(
        `Время: ${card.play.timings.map((timing) => this.timingLabel(timing)).join(', ')} · цель: ${this.targetLabel(card.play.target)}`,
      );
    if (card.equipment?.restrictions.length)
      facts.push(
        `Ограничения: ${card.equipment.restrictions.map((restriction) => `${restriction.type === 'CLASS' ? 'класс' : 'раса'} ${this.localization.definitionName(restriction.definitionId)}`).join(', ')}`,
      );
    return facts;
  }
  private durationLabel(duration: GameCardView['duration']): string {
    return (
      {
        ONE_SHOT: 'одноразовая',
        END_OF_COMBAT: 'до конца боя',
        WHILE_EQUIPPED: 'пока надето',
        WHILE_ROLE_ACTIVE: 'пока роль активна',
        WHILE_IN_SLOT: 'пока спутник в слоте',
        WHILE_ATTACHED: 'пока прикреплено',
        WHILE_IN_PLAY: 'пока карта в игре',
        ENCOUNTER_PASSIVE: 'пассивно в столкновении',
      } as const
    )[duration];
  }
  private cardEffectLabel(effect: GameEffectView): string {
    switch (effect.type) {
      case 'COMBAT_BONUS':
        return `${effect.amount >= 0 ? '+' : ''}${effect.amount} стороне игроков`;
      case 'COMBAT_SIDE_BONUS':
        return `${effect.amount >= 0 ? '+' : ''}${effect.amount} выбранной стороне боя`;
      case 'MONSTER_COMBAT_BONUS':
        return `${effect.amount >= 0 ? '+' : ''}${effect.amount} выбранному монстру`;
      case 'MODIFY_MONSTER':
        return `${effect.strength >= 0 ? '+' : ''}${effect.strength} силы и ${effect.treasures >= 0 ? '+' : ''}${effect.treasures} сокровищ выбранному монстру`;
      case 'ADD_MONSTER_TO_COMBAT':
        return 'добавляет выбранного монстра из руки в бой';
      case 'CLONE_COMBAT_MONSTER':
        return 'создаёт копию выбранного монстра в бою';
      case 'GAIN_LEVEL':
        return `получить ${effect.amount} уровень`;
      case 'LOSE_LEVEL':
        return `потерять ${effect.amount} уровень`;
      case 'DRAW_CARDS':
        return `взять ${effect.count} из колоды ${effect.deck === 'DOOR' ? 'Дверей' : 'Сокровищ'}`;
      case 'STEAL_RANDOM_HAND_CARD':
        return 'украсть случайную карту из руки выбранного игрока';
      case 'AMBUSH_MONSTERS':
        return 'начать бой с двумя случайно выбранными монстрами';
      case 'DISCARD_RANDOM_CARDS':
      case 'DISCARD_CHOSEN_CARDS':
        return `${effect.type === 'DISCARD_RANDOM_CARDS' ? 'случайно ' : ''}сбросить ${effect.count} из ${effect.zone === 'HAND' ? 'руки' : 'снаряжения'}`;
      case 'DISCARD_ROLE':
        return `сбросить ${effect.role === 'CLASS' ? 'Класс' : 'Расу'}`;
      case 'DEATH':
        return 'погибнуть';
    }
  }
  private conditionLabel(condition: GameConditionView): string {
    switch (condition.type) {
      case 'PLAYER_HAS_CLASS':
      case 'PLAYER_HAS_RACE':
      case 'CARD_DEFINITION_IS':
        return `при наличии ${condition.anyOf.map((id) => this.localization.definitionName(id)).join(' или ')}`;
      case 'PLAYER_SEX_IS':
        return condition.sex === 'MALE' ? 'для мужчины' : 'для женщины';
      case 'MONSTER_HAS_TAG':
        return `против ${condition.anyOf.map((tag) => this.tagLabel(tag)).join(' или ')}`;
      case 'EQUIPPED_HAS_TAG':
        return `при ${condition.atLeast}+ предметах ${condition.anyOf.map((tag) => this.tagLabel(tag)).join(' или ')}`;
      case 'CURSE_MATCHES':
        return `для подходящего проклятия${condition.anyTag?.length ? ` (${condition.anyTag.map((tag) => this.tagLabel(tag)).join(' или ')})` : ''}`;
    }
  }
  private modifierLabel(modifier: GameModifierView): string {
    const conditions =
      modifier.conditions.length === 0
        ? ''
        : `, ${modifier.conditions.map((condition) => this.conditionLabel(condition)).join(' и ')}`;
    switch (modifier.type) {
      case 'COMBAT_POWER':
        return `${modifier.amount >= 0 ? '+' : ''}${modifier.amount} к боевой силе${conditions}`;
      case 'EQUIPMENT_TAG_BONUS':
        return `+${modifier.amountPerCard} за предмет ${modifier.tags.map((tag) => this.tagLabel(tag)).join(' или ')}, максимум ${modifier.maxCards}${conditions}`;
      case 'RUN_AWAY_ROLL':
        return `${modifier.amount >= 0 ? '+' : ''}${modifier.amount} к броску побега${conditions}`;
      case 'AUTOMATIC_PROTECTION':
        return `автоматическая защита ${modifier.protection}${conditions}`;
    }
  }
  private roleAbilityLabel(ability: GameRoleAbilityView): string {
    const cost = `сбросить ${ability.cost.count} карт из руки`;
    if (ability.type === 'DRAW_CARDS')
      return `${cost}, взять ${ability.count} из колоды ${ability.deck === 'DOOR' ? 'Дверей' : 'Сокровищ'}; один раз за ход`;
    if (ability.type === 'RUN_AWAY_BONUS')
      return `${cost}, получить ${ability.amount >= 0 ? '+' : ''}${ability.amount} к своему броску побега; один раз за бой`;
    if (ability.type === 'STEAL_EQUIPPED_ITEM')
      return `${cost}, попытаться забрать выбранное снаряжение (${ability.successChance.numerator}/${ability.successChance.denominator}); один раз за ход`;
    return `${cost}, дать ${ability.amount >= 0 ? '+' : ''}${ability.amount} стороне игроков; один раз за бой`;
  }
  protected compactHandFacts(card: GameCardView): readonly string[] {
    const effectBonus = card.effects.flatMap((effect) => {
      switch (effect.type) {
        case 'COMBAT_BONUS':
        case 'COMBAT_SIDE_BONUS':
        case 'MONSTER_COMBAT_BONUS':
          return [effect.amount];
        default:
          return [];
      }
    })[0];
    const bonus = card.equipment?.combatBonus ?? effectBonus;
    const combatValue = card.monster
      ? `Сила ${card.monster.strength ?? card.monster.level ?? 0}`
      : bonus === undefined
        ? '—'
        : `${bonus >= 0 ? '+' : ''}${bonus}`;
    const price = card.goldValue ?? card.equipment?.value;
    return [this.compactCardType(card), combatValue, price === undefined ? '—' : `${price}`];
  }
  private compactCardType(card: GameCardView): string {
    const labels: Partial<Record<GameCardView['type'], string>> = {
      EQUIPMENT: 'Снар.',
      TEMPORARY_BONUS: 'Бонус',
      MONSTER: 'Монстр',
      CURSE: 'Прокл.',
      COMBAT_CURSE: 'Бой. прокл.',
      CLASS: 'Класс',
      RACE: 'Раса',
      ROLE_PERMISSION: 'Роль',
    };
    return labels[card.type] ?? 'Карта';
  }
  private slotLabel(slot: NonNullable<GameCardView['equipment']>['slot']): string {
    return ({ HEAD: 'голова', BODY: 'тело', FEET: 'ноги', HANDS: 'руки' } as const)[slot];
  }
  private effectLabel(
    effect: GameCardView['monster'] extends infer Monster
      ? NonNullable<Monster> extends { readonly badStuff: readonly (infer Effect)[] }
        ? Effect
        : never
      : never,
  ): string {
    if (typeof effect !== 'object' || effect === null || !('type' in effect)) return 'эффект';
    if (effect.type === 'LOSE_LEVEL') return `потеря уровня ${effect.amount}`;
    if (effect.type === 'DEATH') return 'смерть';
    if (effect.type === 'DISCARD_ROLE')
      return `сброс ${effect.role === 'CLASS' ? 'класса' : 'расы'}`;
    return `сброс ${effect.count} карт`;
  }
  private tagLabel(tag: NonNullable<GameCardView['tags']>[number]): string {
    return (
      {
        BEAST: 'зверь',
        CONSTRUCT: 'конструкт',
        ARCANE: 'магия',
        UNDEAD: 'нежить',
        WEAPON: 'оружие',
        ARMOR: 'доспех',
        BLADE: 'клинок',
        BLUNT: 'дробящее',
        MAGIC: 'магическое',
        HEX: 'сглаз',
        TRAP: 'ловушка',
      } as const
    )[tag];
  }
  private timingLabel(timing: NonNullable<GameCardView['play']>['timings'][number]): string {
    return (
      {
        TURN: 'ход',
        POST_DOOR: 'после открытия двери',
        ACTIVE_COMBAT: 'бой',
        VICTORY_REACTION: 'реакция на победу',
        WHEN_DRAWN: 'при взятии',
      } as const
    )[timing];
  }
  private targetLabel(target: NonNullable<GameCardView['play']>['target']): string {
    return (
      {
        SELF: 'себя',
        ANY_PLAYER: 'игрока',
        COMBAT_PLAYERS: 'сторону игроков',
        COMBAT_PLAYER: 'участника боя',
        COMBAT_SIDE: 'сторону игроков или точного монстра',
        MONSTER_ENCOUNTER: 'монстра',
        HAND_MONSTER: 'монстра из руки',
        EQUIPMENT: 'снаряжение',
      } as const
    )[target];
  }
  protected toggleLocale(): void {
    this.localization.setLocale(this.locale() === 'ru' ? 'en' : 'ru');
  }
  protected async toggleFullscreen(): Promise<void> {
    if (!this.fullscreenSupported) return;
    if (document.fullscreenElement === null) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
    this.isFullscreen.set(document.fullscreenElement !== null);
  }
  protected rematch(): void {
    this.lobbyClient.rematch();
  }
  protected returnToLobby(): void {
    this.lobbyClient.returnToLobby();
  }

  @HostListener('document:fullscreenchange') protected syncFullscreen(): void {
    this.isFullscreen.set(document.fullscreenElement !== null);
  }
  @HostListener('document:keydown.escape') protected closeTopLayer(): void {
    if (this.selectedCard()) this.selectedCard.set(null);
    else if (this.roleAbilityIntent()) this.closeRoleAbility();
    else if (this.targetPicker()) this.targetPicker.set(null);
    else if (this.cardUses()) this.cardUses.set(null);
    else if (this.selectedPlayerId()) this.selectedPlayerId.set(null);
    else if (this.breakdownOpen()) this.breakdownOpen.set(false);
    else if (this.helpOpen()) this.helpOpen.set(false);
    else if (this.charityOpen()) this.charityOpen.set(false);
    else if (this.saleOpen()) this.saleOpen.set(false);
    else if (this.fullHandOpen()) this.fullHandOpen.set(false);
    else if (this.historyOpen()) this.historyOpen.set(false);
    else if (this.menuOpen()) this.menuOpen.set(false);
  }

  protected send(command: GameClientCommand): void {
    this.lobbyClient.sendGameCommand(command);
  }
  protected hasIntent(kind: AvailableIntentView['kind']): boolean {
    return this.game().availableIntents.some((intent) => intent.kind === kind);
  }
  private intent(kind: AvailableIntentView['kind']): AvailableIntentView | undefined {
    return this.game().availableIntents.find((intent) => intent.kind === kind);
  }
  private commandForIntent(intent: AvailableIntentView): GameClientCommand | null {
    switch (intent.kind) {
      case 'KICK_DOOR':
      case 'LOOT_ROOM':
      case 'SCAVENGE':
      case 'END_TURN':
        return { type: intent.kind };
      case 'LOOK_FOR_TROUBLE':
      case 'EQUIP_ITEM':
      case 'UNEQUIP_ITEM':
      case 'PLAY_ROLE_PERMISSION':
      case 'DISCARD_ROLE_PERMISSION':
        return { type: intent.kind, cardId: intent.cardId };
      case 'PLAY_ROLE':
        return {
          type: intent.kind,
          cardId: intent.cardId,
          ...(intent.replaceCardId === undefined ? {} : { replaceCardId: intent.replaceCardId }),
        };
      case 'DECLARE_COMBAT_VICTORY':
      case 'RUN_AWAY':
        return {
          type: intent.kind,
          combatId: intent.combatId,
          combatRevision: intent.combatRevision,
        };
      case 'PASS_COMBAT_REACTION':
        return {
          type: intent.kind,
          combatId: intent.combatId,
          combatRevision: intent.combatRevision,
          reactionWindowId: intent.reactionWindowId,
        };
      case 'ACCEPT_HELP_OFFER':
      case 'REJECT_HELP_OFFER':
      case 'CANCEL_HELP_OFFER':
        return {
          type: intent.kind,
          offerId: intent.offerId,
          combatId: intent.combatId,
          combatRevision: intent.combatRevision,
        };
      case 'PLAY_CARD': {
        const target = intent.target;
        if (target.type === 'PLAYER')
          return 'combatId' in intent
            ? {
                type: 'PLAY_COMBAT_CURSE',
                cardId: intent.cardId,
                targetPlayerId: target.playerId,
                reactionWindowId: intent.reactionWindowId!,
                combatId: intent.combatId,
                combatRevision: intent.combatRevision,
              }
            : {
                type: 'PLAY_CARD',
                cardId: intent.cardId,
                target,
              };
        if (target.type === 'SELF')
          return {
            type: 'PLAY_CARD',
            cardId: intent.cardId,
            target,
          };
        if (target.type === 'EQUIPMENT' || target.type === 'COMPANION')
          return {
            type: 'PLAY_CARD',
            cardId: intent.cardId,
            target,
          };
        if (!('combatId' in intent)) return null;
        return {
          type: 'PLAY_CARD',
          cardId: intent.cardId,
          target:
            target.type === 'PLAYERS'
              ? target
              : target.type === 'MONSTER'
                ? target
                : { type: 'HAND_MONSTER', monsterCardId: target.monsterCardId },
          combatId: intent.combatId,
          combatRevision: intent.combatRevision,
          ...(intent.reactionWindowId === undefined
            ? {}
            : { reactionWindowId: intent.reactionWindowId }),
        };
      }
      default:
        return null;
    }
  }
  private collectPlayableIds(): readonly string[] {
    return [
      ...new Set(
        this.game().availableIntents.flatMap((intent) =>
          'cardId' in intent ? [intent.cardId] : [],
        ),
      ),
    ];
  }
  protected cardActions(card: GameCardView): readonly CardUse[] {
    const game = this.game(),
      uses: CardUse[] = [];
    const intents = game.availableIntents.filter(
      (intent) => 'cardId' in intent && intent.cardId === card.instanceId,
    );
    const roleAbilityIntents = game.availableIntents.filter(
      (intent): intent is Extract<AvailableIntentView, { readonly kind: 'USE_ROLE_ABILITY' }> =>
        intent.kind === 'USE_ROLE_ABILITY' && intent.roleCardId === card.instanceId,
    );
    const roleAbilityIntent = roleAbilityIntents.find(
      (intent) => intent.abilityType !== 'STEAL_EQUIPPED_ITEM',
    );
    const lookIntent = intents.find((intent) => intent.kind === 'LOOK_FOR_TROUBLE');
    const equipIntent = intents.find(
      (intent) => intent.kind === 'EQUIP_ITEM' && intent.replaceCardIds === undefined,
    );
    const unequipIntent = intents.find((intent) => intent.kind === 'UNEQUIP_ITEM');
    const roleIntent = intents.find((intent) => intent.kind === 'PLAY_ROLE');
    const discardRoleIntent = intents.find((intent) => intent.kind === 'DISCARD_ROLE');
    const rolePermissionIntent = intents.find((intent) => intent.kind === 'PLAY_ROLE_PERMISSION');
    const discardRolePermissionIntent = intents.find(
      (intent) => intent.kind === 'DISCARD_ROLE_PERMISSION',
    );
    const selfIntent = intents.find(
      (intent): intent is Extract<AvailableIntentView, { kind: 'PLAY_CARD' }> =>
        intent.kind === 'PLAY_CARD' && intent.target.type === 'SELF',
    );
    const equipmentIntents = intents.filter(
      (intent): intent is Extract<AvailableIntentView, { kind: 'PLAY_CARD' }> =>
        intent.kind === 'PLAY_CARD' && intent.target.type === 'EQUIPMENT',
    );
    const curseIntents = intents.filter(
      (intent): intent is Extract<AvailableIntentView, { kind: 'PLAY_CARD' }> =>
        intent.kind === 'PLAY_CARD' && intent.target.type === 'PLAYER' && !('combatId' in intent),
    );
    const combatCurseIntents = intents.filter(
      (intent): intent is Extract<AvailableIntentView, { kind: 'PLAY_CARD' }> =>
        intent.kind === 'PLAY_CARD' && intent.target.type === 'PLAYER' && 'combatId' in intent,
    );
    const playerSideIntent = intents.find(
      (intent): intent is Extract<AvailableIntentView, { kind: 'PLAY_CARD'; combatId: string }> =>
        intent.kind === 'PLAY_CARD' && intent.target.type === 'PLAYERS' && 'combatId' in intent,
    );
    const monsterIntents = intents.filter(
      (intent): intent is Extract<AvailableIntentView, { kind: 'PLAY_CARD' }> =>
        intent.kind === 'PLAY_CARD' && intent.target.type === 'MONSTER',
    );
    const addIntents = intents.filter(
      (intent): intent is Extract<AvailableIntentView, { kind: 'PLAY_CARD' }> =>
        intent.kind === 'PLAY_CARD' && intent.target.type === 'HAND_MONSTER',
    );
    if (lookIntent)
      uses.push({
        label: 'Искать неприятности',
        command: { type: 'LOOK_FOR_TROUBLE', cardId: card.instanceId },
      });
    if (equipIntent)
      uses.push({ label: 'Надеть', command: { type: 'EQUIP_ITEM', cardId: card.instanceId } });
    if (unequipIntent)
      uses.push({ label: 'Снять', command: { type: 'UNEQUIP_ITEM', cardId: card.instanceId } });
    if (discardRoleIntent)
      uses.push({
        label: card.type === 'CLASS' ? 'Сбросить класс' : 'Сбросить расу',
        command: { type: 'DISCARD_ROLE', cardId: card.instanceId },
      });
    if (roleAbilityIntent)
      uses.push({
        label:
          roleAbilityIntent.abilityType === 'DRAW_CARDS'
            ? 'Обменять карты'
            : roleAbilityIntent.abilityType === 'RUN_AWAY_BONUS'
              ? 'Подготовить побег'
              : 'Применить боевую способность',
        roleAbility: roleAbilityIntent,
      });
    for (const theftIntent of roleAbilityIntents.filter(
      (intent) => intent.abilityType === 'STEAL_EQUIPPED_ITEM',
    )) {
      if (theftIntent.target.type !== 'EQUIPMENT') continue;
      const owner = game.players.find((player) => player.playerId === theftIntent.target.playerId);
      const target = owner?.equipment.find((item) => item.instanceId === theftIntent.target.cardId);
      uses.push({
        label: `Попытаться забрать: ${target?.name ?? 'снаряжение'} (${owner?.name ?? 'игрок'})`,
        roleAbility: theftIntent,
      });
    }
    if (roleIntent?.kind === 'PLAY_ROLE')
      uses.push({
        label: 'Сыграть роль',
        command: {
          type: 'PLAY_ROLE',
          cardId: card.instanceId,
          ...(roleIntent.replaceCardId === undefined
            ? {}
            : { replaceCardId: roleIntent.replaceCardId }),
        },
      });
    if (rolePermissionIntent)
      uses.push({
        label: 'Разрешить вторую роль',
        command: { type: 'PLAY_ROLE_PERMISSION', cardId: card.instanceId },
      });
    if (discardRolePermissionIntent)
      uses.push({
        label: 'Сбросить разрешение роли',
        command: { type: 'DISCARD_ROLE_PERMISSION', cardId: card.instanceId },
      });
    if (selfIntent)
      uses.push({
        label:
          card.type === 'HIRELING' || card.type === 'MOUNT' ? 'Призвать спутника' : 'Сыграть карту',
        command: { type: 'PLAY_CARD', cardId: card.instanceId, target: { type: 'SELF' } },
      });
    if (equipmentIntents.length > 0)
      uses.push(
        this.useWithTargets(
          'Улучшить снаряжение',
          'Выберите снаряжение',
          card,
          'EQUIPMENT',
          equipmentIntents.map((intent) => {
            const targetId = intent.target.type === 'EQUIPMENT' ? intent.target.cardId : '';
            const target = game.self.equipment.find((item) => item.instanceId === targetId);
            return {
              id: targetId,
              label: target?.name ?? 'Снаряжение',
              facts: target === undefined ? '' : this.cardFacts(target).join(' · '),
            };
          }),
        ),
      );
    if (curseIntents.length > 0) {
      const options = curseIntents.map((intent) => ({
        id: intent.target.type === 'PLAYER' ? intent.target.playerId : '',
        label: this.playerName(intent.target.type === 'PLAYER' ? intent.target.playerId : ''),
        playerColor: this.playerColor(
          intent.target.type === 'PLAYER' ? intent.target.playerId : '',
        ),
      }));
      uses.push(
        this.useWithTargets(
          card.type === 'CURSE' ? 'Наложить проклятие' : 'Сыграть на игрока',
          'Выберите цель',
          card,
          card.type === 'CURSE' ? 'CURSE' : 'PLAYER_CARD',
          options,
        ),
      );
    }
    if (combatCurseIntents.length > 0) {
      uses.push(
        this.useWithTargets(
          'Сыграть на игрока',
          'Выберите игрока',
          card,
          'COMBAT_CURSE',
          combatCurseIntents.map((intent) => ({
            id: intent.target.type === 'PLAYER' ? intent.target.playerId : '',
            label: this.playerName(intent.target.type === 'PLAYER' ? intent.target.playerId : ''),
            playerColor: this.playerColor(
              intent.target.type === 'PLAYER' ? intent.target.playerId : '',
            ),
          })),
        ),
      );
    }
    if (playerSideIntent)
      uses.push({
        label: 'Сыграть за игроков',
        command: {
          type: 'PLAY_CARD',
          cardId: card.instanceId,
          target: { type: 'PLAYERS' },
          reactionWindowId: playerSideIntent.reactionWindowId,
          combatId: playerSideIntent.combatId,
          combatRevision: playerSideIntent.combatRevision,
        },
      });
    if (monsterIntents.length > 0) {
      const supportsEitherSide = card.play?.target === 'COMBAT_SIDE';
      uses.push(
        this.useWithTargets(
          supportsEitherSide ? 'Помочь монстру' : 'Сыграть на монстра',
          supportsEitherSide ? 'Помочь какому монстру?' : 'Выберите монстра',
          card,
          'MONSTER',
          monsterIntents.map((intent) => ({
            id: intent.target.type === 'MONSTER' ? intent.target.encounterId : '',
            label: (() => {
              const target = game.combat?.monsters.find(
                (monster) =>
                  monster.encounterId ===
                  (intent.target.type === 'MONSTER' ? intent.target.encounterId : ''),
              );
              return target === undefined ? 'Монстр' : this.cardName(target.monster);
            })(),
            facts: (() => {
              const target = game.combat?.monsters.find(
                (monster) =>
                  monster.encounterId ===
                  (intent.target.type === 'MONSTER' ? intent.target.encounterId : ''),
              );
              return target
                ? `Сила ${target.currentStrength} · ${target.currentTreasures} сокр.`
                : '';
            })(),
          })),
        ),
      );
    }
    if (addIntents.length > 0) {
      uses.push(
        this.useWithTargets(
          'Добавить монстра',
          'Выберите монстра из руки',
          card,
          'HAND_MONSTER',
          addIntents.map((intent) => ({
            id: intent.target.type === 'HAND_MONSTER' ? intent.target.monsterCardId : '',
            label:
              game.self.hand.find(
                (value) =>
                  value.instanceId ===
                  (intent.target.type === 'HAND_MONSTER' ? intent.target.monsterCardId : ''),
              )?.name ?? 'Монстр',
            facts: this.cardFacts(
              game.self.hand.find(
                (value) =>
                  value.instanceId ===
                  (intent.target.type === 'HAND_MONSTER' ? intent.target.monsterCardId : ''),
              ) ?? card,
            ).join(' · '),
          })),
        ),
      );
    }
    return uses;
  }
  private useWithTargets(
    label: string,
    title: string,
    card: GameCardView,
    kind: TargetPickerState['kind'],
    options: readonly PickerOption[],
  ): CardUse {
    if (options.length === 1) {
      const option = options[0]!;
      if (kind === 'CURSE')
        return {
          label,
          command: { type: 'PLAY_CURSE', cardId: card.instanceId, targetPlayerId: option.id },
        };
      if (kind === 'COMBAT_CURSE' && this.game().combat?.reactionWindow)
        return {
          label,
          command: {
            type: 'PLAY_COMBAT_CURSE',
            cardId: card.instanceId,
            targetPlayerId: option.id,
            reactionWindowId: this.game().combat!.reactionWindow!.windowId,
            combatId: this.game().combat!.combatId,
            combatRevision: this.game().combat!.revision,
          },
        };
      if (kind === 'MONSTER')
        return {
          label,
          command: {
            type: 'PLAY_CARD',
            cardId: card.instanceId,
            target: { type: 'MONSTER', encounterId: option.id },
            combatId: this.game().combat?.combatId,
            combatRevision: this.game().combat?.revision,
          },
        };
      if (kind === 'HAND_MONSTER')
        return {
          label,
          command: {
            type: 'PLAY_CARD',
            cardId: card.instanceId,
            target: { type: 'HAND_MONSTER', monsterCardId: option.id },
            combatId: this.game().combat?.combatId,
            combatRevision: this.game().combat?.revision,
          },
        };
      if (kind === 'EQUIPMENT')
        return {
          label,
          command: {
            type: 'PLAY_CARD',
            cardId: card.instanceId,
            target: { type: 'EQUIPMENT', cardId: option.id },
          },
        };
    }
    return { label, picker: { title, card, kind, options } };
  }
  private playerColor(playerId: string): GameView['players'][number]['color'] {
    return this.game().players.find((player) => player.playerId === playerId)?.color;
  }
  private openPickerForCards(
    title: string,
    cards: readonly GameCardView[],
    kind: TargetPickerState['kind'],
  ): void {
    this.targetPicker.set({
      title,
      card:
        cards[0] ??
        ({
          instanceId: '',
          definitionId: '',
          artKey: '',
          name: '',
          description: '',
          duration: 'ONE_SHOT',
          type: 'OTHER',
          deck: 'DOOR',
          effects: [],
        } satisfies GameCardView),
      kind,
      options: cards.map((card) => ({
        id: card.instanceId,
        label: this.cardName(card),
        facts: this.cardFacts(card).join(' · '),
      })),
    });
  }
}
