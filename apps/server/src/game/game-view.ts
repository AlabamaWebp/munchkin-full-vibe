import type {
  GameCardView,
  GameLogEntryView,
  GameView,
} from '@munchkin-lan/contracts';
import {
  canEquipItem,
  canChangeEquipment,
  canUnequipItem,
  calculateCombatPower,
  calculateCombatSidePower,
  calculateMonsterPower,
  CardType,
  equipmentConflict,
  equipmentCombatBonus,
  equipmentRestriction,
  GamePhase,
  type CardInstance,
  type GameLogEntry,
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
    effects: definition.effects,
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

function cardById(state: GameState, cardId: string): GameCardView | null {
  const cards = [
    ...state.doorDeck,
    ...state.treasureDeck,
    ...state.doorDiscard,
    ...state.treasureDiscard,
    ...state.players.flatMap((player) => [
      ...player.hand,
      ...player.equipment,
      ...(player.classCard === null ? [] : [player.classCard]),
      ...(player.raceCard === null ? [] : [player.raceCard]),
    ]),
    ...(state.combat === null ? [] : [state.combat.monster]),
    ...(state.pendingDecision?.completion.type === 'CURSE'
      ? [state.pendingDecision.completion.card]
      : []),
  ];
  const card = cards.find((candidate) => candidate.instanceId === cardId);
  return card === undefined ? null : cardView(state, card);
}

function requiredLogCard(state: GameState, cardId: string): GameCardView {
  const card = cardById(state, cardId);
  if (card === null) {
    throw new TypeError(`Missing card ${cardId} referenced by the game log.`);
  }
  return card;
}

function logCards(
  state: GameState,
  cardIds: readonly string[],
): GameCardView[] {
  return cardIds.flatMap((cardId) => {
    const card = cardById(state, cardId);
    return card === null ? [] : [card];
  });
}

function projectLogEntry(
  state: GameState,
  entry: GameLogEntry,
): GameLogEntryView {
  const base = {
    sequence: entry.sequence,
    turnNumber: entry.turnNumber,
    phase: entry.phase,
    type: entry.event.type,
    visibility: entry.event.visibility,
  } as const;
  const event = entry.event;

  switch (event.type) {
    case 'PLAYER_ADDED':
      return { ...base, playerId: event.playerId };
    case 'GAME_STARTED':
      return { ...base, playerId: event.activePlayerId };
    case 'CARDS_DEALT':
      return {
        ...base,
        playerId: event.playerId,
        cards: logCards(state, [
          ...event.doorCardIds,
          ...event.treasureCardIds,
        ]),
        count: event.doorCardIds.length + event.treasureCardIds.length,
      };
    case 'TURN_STARTED':
    case 'TURN_ENDED':
    case 'ROOM_LOOTED':
    case 'PLAYER_DIED':
    case 'PLAYER_REVIVED':
      return { ...base, playerId: event.playerId };
    case 'DOOR_KICKED':
    case 'CARD_ADDED_TO_HAND':
    case 'CURSE_RESOLVED':
    case 'ITEM_EQUIPPED':
    case 'ITEM_UNEQUIPPED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
      };
    case 'CARD_DRAWN':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
      };
    case 'CARDS_DISCARDED':
      return {
        ...base,
        playerId: event.playerId,
        cards: logCards(state, event.cardIds),
        count: event.cardIds.length,
      };
    case 'CARDS_DISCARDED_SUMMARY':
      return {
        ...base,
        playerId: event.playerId,
        count: event.count,
        zone: event.zone,
      };
    case 'CARD_DISCARD_REQUIRED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.sourceCardId),
        count: event.count,
        zone: event.zone,
      };
    case 'COMBAT_STARTED':
    case 'COMBAT_WON':
    case 'BAD_STUFF_APPLIED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.monsterCardId),
      };
    case 'COMBAT_UPDATED':
      return {
        ...base,
        playerId: event.playerId,
        playerPower: event.playerPower,
        monsterPower: event.monsterPower,
      };
    case 'RUN_AWAY_ATTEMPTED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.monsterCardId),
        roll: event.roll,
        escaped: event.escaped,
      };
    case 'HELP_REQUESTED':
    case 'HELP_ACCEPTED':
      return {
        ...base,
        playerId: event.playerId,
        targetPlayerId: event.helperId,
      };
    case 'LEVEL_GAINED':
    case 'LEVEL_LOST':
      return {
        ...base,
        playerId: event.playerId,
        amount: event.amount,
        newLevel: event.newLevel,
      };
    case 'TREASURE_GAINED':
      return { ...base, playerId: event.playerId, count: event.count };
    case 'CARD_PLAYED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
        ...(event.target?.type === 'PLAYER'
          ? { targetPlayerId: event.target.playerId }
          : {}),
        ...(event.target?.type === 'COMBAT' ? { side: event.target.side } : {}),
      };
    case 'ROLE_PLAYED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
        role: event.role,
      };
    case 'ITEMS_SOLD':
      return {
        ...base,
        playerId: event.playerId,
        cards: logCards(state, event.cardIds),
        value: event.value,
        amount: event.levelsGained,
      };
    case 'ITEM_TRADED':
      return {
        ...base,
        playerId: event.playerId,
        targetPlayerId: event.recipientId,
        card: requiredLogCard(state, event.cardId),
      };
    case 'CHARITY_RESOLVED':
      return {
        ...base,
        playerId: event.playerId,
        ...(event.recipientId === null
          ? {}
          : { targetPlayerId: event.recipientId }),
        count: event.count,
      };
    case 'GAME_FINISHED':
      return {
        ...base,
        playerId: event.winnerId,
        newLevel: event.winningLevel,
      };
  }
}

function expectedAction(state: GameState): GameView['expectedAction'] {
  if (state.activePlayerId === null) {
    throw new TypeError('An active game requires an expected actor.');
  }
  if (state.pendingDecision !== null) {
    return { type: 'DISCARD_CARDS', playerId: state.pendingDecision.playerId };
  }
  if (
    state.combat?.requestedHelperId !== null &&
    state.combat?.requestedHelperId !== undefined
  ) {
    return {
      type: 'RESPOND_TO_HELP',
      playerId: state.combat.requestedHelperId,
    };
  }
  if (state.combat !== null) {
    return { type: 'COMBAT_DECISION', playerId: state.combat.playerId };
  }
  return { type: 'TAKE_TURN_ACTION', playerId: state.activePlayerId };
}

function unavailableCardReason(
  state: GameState,
  viewerPlayerId: PlayerId,
  card: CardInstance,
): GameView['unavailableCardReasons'][number]['reason'] | null {
  const player = state.players.find(
    (candidate) => candidate.id === viewerPlayerId,
  );
  if (player === undefined) return 'NO_AVAILABLE_ACTION';
  const definition = state.cardDefinitions.find(
    (candidate) => candidate.id === card.definitionId,
  );
  if (definition === undefined) return 'NO_AVAILABLE_ACTION';
  if (state.status === 'FINISHED') return 'GAME_FINISHED';
  if (state.pendingDecision !== null) return 'PENDING_DECISION';

  if (definition.type === CardType.CURSE) return null;
  if (
    state.combat !== null &&
    (definition.type === CardType.TEMPORARY_BONUS ||
      definition.type === CardType.MONSTER_MODIFIER)
  ) {
    return null;
  }
  if (
    definition.type === CardType.TEMPORARY_BONUS ||
    definition.type === CardType.MONSTER_MODIFIER
  ) {
    return 'NO_ACTIVE_COMBAT';
  }

  if (definition.type === CardType.EQUIPMENT) {
    if (
      canEquipItem(state, viewerPlayerId, card.instanceId) ||
      canUnequipItem(state, viewerPlayerId, card.instanceId)
    )
      return null;
    if (state.combat !== null) return 'COMBAT_ACTIVE';
    if (state.activePlayerId !== viewerPlayerId) return 'WAITING_FOR_TURN';
    if (!canChangeEquipment(state, viewerPlayerId)) return 'WRONG_PHASE';
    const restriction = equipmentRestriction(player, definition);
    if (restriction !== null) return restriction;
    const conflict = equipmentConflict(state, player, definition);
    if (conflict !== null) return conflict;
    return 'NO_AVAILABLE_ACTION';
  }

  if (definition.type === CardType.CLASS || definition.type === CardType.RACE) {
    if (state.combat !== null) return 'COMBAT_ACTIVE';
    if (state.activePlayerId !== viewerPlayerId) return 'WAITING_FOR_TURN';
    return 'WRONG_PHASE';
  }

  return 'NO_AVAILABLE_ACTION';
}

function availableActions(
  state: GameState,
  viewerPlayerId: PlayerId,
): GameView['availableActions'] {
  if (state.pendingDecision !== null) return [];
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
    pendingDecision:
      state.pendingDecision === null
        ? null
        : {
            type: state.pendingDecision.type,
            playerId: state.pendingDecision.playerId,
            zone: state.pendingDecision.zone,
            count: state.pendingDecision.count,
            sourceCard: cardView(state, {
              instanceId: state.pendingDecision.sourceCardId,
              definitionId: state.pendingDecision.sourceDefinitionId,
            }),
            selectableCardIds:
              state.pendingDecision.playerId === viewerPlayerId
                ? (state.pendingDecision.zone === 'HAND'
                    ? self.hand
                    : self.equipment
                  ).map((card) => card.instanceId)
                : [],
          },
    gameLog: state.eventLog
      .filter(
        (entry) =>
          entry.event.visibility === 'PUBLIC' ||
          entry.event.recipientPlayerId === viewerPlayerId,
      )
      .map((entry) => projectLogEntry(state, entry)),
    expectedAction: expectedAction(state),
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
      state.pendingDecision === null &&
      state.combat?.playerId === viewerPlayerId &&
      state.combat.helperId === null
        ? state.players
            .filter((player) => player.id !== viewerPlayerId)
            .map((player) => player.id)
        : [],
    playableCombatCards: {
      playersSideCardIds:
        state.combat === null || state.pendingDecision !== null
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
        state.combat === null || state.pendingDecision !== null
          ? []
          : self.hand
              .filter((card) => {
                const type = state.cardDefinitions.find(
                  (definition) => definition.id === card.definitionId,
                )?.type;
                return (
                  type === CardType.TEMPORARY_BONUS ||
                  type === CardType.MONSTER_MODIFIER
                );
              })
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
      playableCurseCardIds:
        state.pendingDecision === null
          ? self.hand
              .filter(
                (card) =>
                  state.cardDefinitions.find(
                    (definition) => definition.id === card.definitionId,
                  )?.type === CardType.CURSE,
              )
              .map((card) => card.instanceId)
          : [],
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
      tradeableItemCardIds: canChangeEquipment(state, viewerPlayerId)
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
        state.pendingDecision === null &&
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
    unavailableCardReasons: [...self.hand, ...self.equipment].flatMap(
      (card) => {
        const reason = unavailableCardReason(state, viewerPlayerId, card);
        return reason === null ? [] : [{ cardId: card.instanceId, reason }];
      },
    ),
  };
}
