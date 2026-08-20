import type { GameCardView, GameView } from '@munchkin-lan/contracts';
import {
  canEquipItem,
  canChangeEquipment,
  canUnequipItem,
  calculateCombatPower,
  calculateCombatSidePower,
  calculateMonsterPower,
  CardType,
  equipmentCombatBonus,
  GamePhase,
  type CardInstance,
  type GameState,
  type PlayerId,
} from '@munchkin-lan/game-engine';

function cardView(state: GameState, card: CardInstance): GameCardView {
  const definition = state.cardDefinitions.find(
    (candidate) => candidate.id === card.definitionId,
  );
  if (definition === undefined) {
    throw new TypeError(
      `Missing definition for visible card ${card.instanceId}.`,
    );
  }
  return {
    instanceId: card.instanceId,
    definitionId: definition.id,
    name: definition.name,
    description: definition.description,
    type: definition.type,
    deck: definition.deck,
    ...(definition.equipment === undefined
      ? {}
      : {
          equipment: {
            ...definition.equipment,
            value: definition.equipment.value ?? 0,
            combatBonus: definition.effects.reduce(
              (total, effect) =>
                effect.type === 'COMBAT_BONUS' ? total + effect.amount : total,
              0,
            ),
          },
        }),
    ...(definition.monster === undefined
      ? {}
      : { monster: definition.monster }),
  };
}

function availableActions(
  state: GameState,
  viewerPlayerId: PlayerId,
): GameView['availableActions'] {
  if (state.combat?.requestedHelperId === viewerPlayerId)
    return ['ACCEPT_HELP'];
  if (state.activePlayerId !== viewerPlayerId) return [];
  if (state.combat !== null)
    return calculateCombatSidePower(state) > calculateMonsterPower(state)
      ? ['RESOLVE_COMBAT']
      : ['RUN_AWAY'];
  if (state.phase === GamePhase.TURN_START) return ['KICK_DOOR'];
  if (state.phase === GamePhase.POST_DOOR) return ['LOOT_ROOM', 'END_TURN'];
  if (state.phase === GamePhase.END_TURN) return ['END_TURN'];
  return [];
}

export function createGameView(
  state: GameState,
  viewerPlayerId: PlayerId,
): GameView {
  const self = state.players.find((player) => player.id === viewerPlayerId);
  if (self === undefined || state.activePlayerId === null) {
    throw new TypeError(
      'A game view requires a current player and an active game.',
    );
  }
  const publicPlayers = state.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    level: player.level,
    handCount: player.hand.length,
    equipment: player.equipment.map((card) => cardView(state, card)),
    temporaryCombatBonus: player.temporaryCombatBonus,
    equipmentCombatBonus: equipmentCombatBonus(state, player),
    combatPower: calculateCombatPower(state, player.id),
    classCard:
      player.classCard === null ? null : cardView(state, player.classCard),
    raceCard:
      player.raceCard === null ? null : cardView(state, player.raceCard),
    isDead: player.isDead,
  }));
  const ownPublic = publicPlayers.find(
    (player) => player.playerId === viewerPlayerId,
  );
  if (ownPublic === undefined)
    throw new TypeError('The viewer projection is missing.');

  return {
    gameId: state.id,
    viewerPlayerId,
    status: state.status,
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    winnerId: state.winnerId,
    players: publicPlayers,
    self: {
      ...ownPublic,
      hand: self.hand.map((card) => cardView(state, card)),
    },
    combat:
      state.combat === null
        ? null
        : {
            playerId: state.combat.playerId,
            monster: cardView(state, state.combat.monster),
            playerPower: calculateCombatSidePower(state),
            monsterPower: calculateMonsterPower(state),
            monsterBonus: state.combat.monsterBonus,
            requestedHelperId: state.combat.requestedHelperId,
            helperId: state.combat.helperId,
            helperContribution:
              state.combat.helperId === null
                ? 0
                : calculateCombatPower(state, state.combat.helperId),
            history: state.combat.history.map((entry) => {
              if (entry.type === 'COMBAT_STARTED') {
                return {
                  ...entry,
                  monster: cardView(state, state.combat!.monster),
                };
              }
              if (entry.type === 'CARD_PLAYED') {
                return {
                  type: entry.type,
                  playerId: entry.playerId,
                  side: entry.side,
                  card: cardView(state, {
                    instanceId: entry.cardId,
                    definitionId: entry.definitionId,
                  }),
                };
              }
              return entry;
            }),
          },
    lastRunAwayResult:
      state.lastRunAwayResult === null
        ? null
        : {
            playerId: state.lastRunAwayResult.playerId,
            monster: cardView(state, {
              instanceId: state.lastRunAwayResult.monsterCardId,
              definitionId: state.lastRunAwayResult.monsterDefinitionId,
            }),
            roll: state.lastRunAwayResult.roll,
            escaped: state.lastRunAwayResult.escaped,
            badStuffApplied: state.lastRunAwayResult.badStuffApplied,
          },
    deckCounts: {
      door: state.doorDeck.length,
      treasure: state.treasureDeck.length,
    },
    availableActions: availableActions(state, viewerPlayerId),
    availableEquipmentActions: {
      equipCardIds: self.hand
        .filter((card) => canEquipItem(state, viewerPlayerId, card.instanceId))
        .map((card) => card.instanceId),
      unequipCardIds: self.equipment
        .filter((card) =>
          canUnequipItem(state, viewerPlayerId, card.instanceId),
        )
        .map((card) => card.instanceId),
    },
    requestableHelperIds:
      state.combat?.playerId === viewerPlayerId &&
      state.combat.helperId === null
        ? state.players
            .filter((player) => player.id !== viewerPlayerId)
            .map((player) => player.id)
        : [],
    playableCombatCards: {
      playersSideCardIds:
        state.combat === null
          ? []
          : self.hand
              .filter(
                (card) =>
                  state.cardDefinitions.find(
                    (definition) => definition.id === card.definitionId,
                  )?.type === CardType.TEMPORARY_BONUS,
              )
              .map((card) => card.instanceId),
      monsterSideCardIds:
        state.combat === null
          ? []
          : self.hand
              .filter(
                (card) =>
                  state.cardDefinitions.find(
                    (definition) => definition.id === card.definitionId,
                  )?.type === CardType.MONSTER_MODIFIER,
              )
              .map((card) => card.instanceId),
    },
    expandedRuleActions: {
      playableRoleCardIds: canChangeEquipment(state, viewerPlayerId)
        ? self.hand
            .filter((card) => {
              const type = state.cardDefinitions.find(
                (definition) => definition.id === card.definitionId,
              )?.type;
              return type === CardType.CLASS || type === CardType.RACE;
            })
            .map((card) => card.instanceId)
        : [],
      playableCurseCardIds: self.hand
        .filter(
          (card) =>
            state.cardDefinitions.find(
              (definition) => definition.id === card.definitionId,
            )?.type === CardType.CURSE,
        )
        .map((card) => card.instanceId),
      sellableItemCardIds: canChangeEquipment(state, viewerPlayerId)
        ? [...self.hand, ...self.equipment]
            .filter(
              (card) =>
                state.cardDefinitions.find(
                  (definition) => definition.id === card.definitionId,
                )?.type === CardType.EQUIPMENT,
            )
            .map((card) => card.instanceId)
        : [],
      tradeableItemCardIds:
        state.combat === null
          ? [...self.hand, ...self.equipment]
              .filter(
                (card) =>
                  state.cardDefinitions.find(
                    (definition) => definition.id === card.definitionId,
                  )?.type === CardType.EQUIPMENT,
              )
              .map((card) => card.instanceId)
          : [],
      charityCardCount:
        state.activePlayerId === viewerPlayerId &&
        state.combat === null &&
        (state.phase === GamePhase.POST_DOOR ||
          state.phase === GamePhase.END_TURN)
          ? Math.max(0, self.hand.length - 5)
          : 0,
      charityRecipientIds: (() => {
        const minimum = Math.min(
          ...state.players.map((player) => player.level),
        );
        return self.level === minimum
          ? []
          : state.players
              .filter((player) => player.level === minimum)
              .map((player) => player.id);
      })(),
    },
  };
}
