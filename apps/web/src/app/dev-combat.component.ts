import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { GameCardView, GamePlayerView, GameView } from '@munchkin-lan/contracts';
import { GameShellComponent } from './game-shell.component';

const card = (id: string, name: string, type: GameCardView['type'], extra: Partial<GameCardView> = {}): GameCardView => ({
  instanceId: id, definitionId: id, artKey: `dev.${id}`, name, description: 'Демонстрационная карта для проверки мобильного интерфейса.', type, deck: type === 'MONSTER' ? 'DOOR' : 'TREASURE', effects: [], ...extra,
});
const monster = card('clockwork-troll', 'Раздражённый тролль', 'MONSTER', { artKey: 'core.clockwork-yak', monster: { strength: 9, levelRewards: 1, treasureRewards: 2, badStuff: [{ type: 'LOSE_LEVEL', amount: 1 }] } });
const sword = card('line-sword', 'Линейный клинок', 'EQUIPMENT', { artKey: 'core.tuning-fork-rapier', equipment: { slot: 'HANDS', hands: 1, combatBonus: 4, restrictions: [], value: 400 } });
const boots = card('boots', 'Ботинки', 'EQUIPMENT', { artKey: 'core.boots-of-purposeful-squeaking', equipment: { slot: 'FEET', hands: 0, combatBonus: 1, restrictions: [], value: 200 } });
const potion = card('potion', 'Зелье храбрости', 'TEMPORARY_BONUS', { artKey: 'core.bottled-applause', effects: [{ type: 'COMBAT_BONUS', amount: 2 }], play: { timings: ['ACTIVE_COMBAT'], target: 'COMBAT_PLAYERS' } });
const player = (playerId: string, name: string, level: number, handCount: number, combatPower: number, equipment: readonly GameCardView[] = []): GamePlayerView => ({ playerId, name, level, handCount, equipment, temporaryCombatBonus: 0, equipmentCombatBonus: equipment.reduce((total, item) => total + (item.equipment?.combatBonus ?? 0), 0), combatPower, classCard: null, raceCard: null, isDead: false });
const self = player('ada', 'Барон Сырок', 3, 5, 7, [boots, sword]);

export const DEV_COMBAT_GAME: GameView = {
  gameId: 'DEV-COMBAT', viewerPlayerId: 'ada', status: 'IN_PROGRESS', phase: 'DOOR_RESOLUTION', activePlayerId: 'ada', turnNumber: 7, winnerId: null,
  players: [self, player('goblin', 'Гоблин на зарплате', 2, 4, 4)],
  self: { ...self, hand: [potion, card('hex', 'Подлый пинок', 'COMBAT_CURSE', { artKey: 'core.strategic-banana-peel' }), sword, card('helper', 'Помощник варвара', 'HIRELING', { artKey: 'core.lantern-folk' }), card('rat', 'Проклятие трусливого', 'CURSE', { artKey: 'core.curse-memory-moths' })] },
  combat: { combatId: 'dev-combat', playerId: 'ada', revision: 1, monsters: [{ encounterId: 'troll', monster, sourceCard: monster, clonedFromEncounterId: null, baseStrength: 9, strengthModifier: 0, currentStrength: 9, baseLevelRewards: 1, baseTreasureRewards: 2, treasureModifier: 0, currentTreasures: 2, playedCards: [] }], playerPower: 7, monsterPower: 9, requestedHelperId: null, helperId: null, helperContribution: 0, reactionWindow: null, history: [] },
  lastRunAwayResult: null, pendingDecision: null, curseResponse: null,
  gameLog: [{ sequence: 1, turnNumber: 7, phase: 'DOOR_RESOLUTION', type: 'COMBAT_STARTED', visibility: 'PUBLIC', playerId: 'ada', card: monster }],
  presentation: { blocking: null, important: [{ sequence: 1, turnNumber: 7, phase: 'DOOR_RESOLUTION', type: 'COMBAT_STARTED', visibility: 'PUBLIC', playerId: 'ada', card: monster, priority: 'IMPORTANT', summaryCode: 'COMBAT_STARTED', requiresViewerAction: false }], routine: [] },
  expectedAction: { type: 'COMBAT_DECISION', playerId: 'ada' }, deckCounts: { door: 42, treasure: 36 },
  availableIntents: [
    { id: 'play-potion', kind: 'PLAY_CARD', reasonCode: 'OPTIONAL_CARD_PLAY', cardId: 'potion', target: { type: 'PLAYERS' }, combatId: 'dev-combat', combatRevision: 1 },
    { id: 'help', kind: 'PROPOSE_HELP', reasonCode: 'OPTIONAL_CARD_PLAY', helperIds: ['goblin'], minTreasures: 0, maxTreasures: 2, combatId: 'dev-combat', combatRevision: 1 },
    { id: 'run', kind: 'RUN_AWAY', reasonCode: 'COMBAT_LOSING', combatId: 'dev-combat', combatRevision: 1 },
  ], unavailableCardReasons: [{ cardId: 'line-sword', reason: 'COMBAT_ACTIVE' }],
};

@Component({ selector: 'app-dev-combat', imports: [GameShellComponent], changeDetection: ChangeDetectionStrategy.OnPush, template: '<app-game-shell [game]="game" connectionOverride="CONNECTED" />' })
export class DevCombatComponent { protected readonly game = DEV_COMBAT_GAME; }
