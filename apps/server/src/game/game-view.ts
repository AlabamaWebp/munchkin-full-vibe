import type {
  AvailableIntentView,
  GameCardView,
  GameLogEventType,
  GameLogEntryView,
  GameView,
  PresentedGameEventView,
} from '@munchkin-lan/contracts';
import {
  canEquipItem,
  canChangeEquipment,
  canUnequipItem,
  calculateCombatPower,
  combatPowerBreakdown,
  calculateCombatSidePower,
  calculateMonsterCurrentStrength,
  calculateMonsterPower,
  calculateMonsterTreasures,
  canLookForTrouble,
  canScavenge,
  CardType,
  equipmentConflict,
  equipmentCombatBonus,
  equipmentRestriction,
  GamePhase,
  HAND_LIMIT,
  type CardInstance,
  type GameLogEntry,
  type GameState,
  type PlayerId,
  roleCapacity,
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
    artKey: definition.artKey,
    name: definition.name,
    description: definition.description,
    type: definition.type,
    deck: definition.deck,
    setId: definition.setId,
    tags: definition.tags,
    sellable:
      definition.sellable ??
      (definition.deck === 'TREASURE' && (definition.goldValue ?? 0) > 0),
    tradeable: definition.tradeable ?? definition.type === CardType.EQUIPMENT,
    ...(definition.goldValue === undefined
      ? {}
      : { goldValue: definition.goldValue }),
    ...(definition.play === undefined ? {} : { play: definition.play }),
    effects: definition.effects,
    ...(definition.equipment === undefined
      ? {}
      : {
          equipment: {
            ...definition.equipment,
            hands:
              definition.equipment.hands ??
              (definition.equipment.slot === 'HANDS' ? 1 : 0),
            restrictions: definition.equipment.restrictions ?? [],
            value: definition.goldValue ?? 0,
            combatBonus:
              definition.equipment.combatBonus ??
              definition.effects.reduce(
                (total, effect) =>
                  effect.type === 'COMBAT_BONUS'
                    ? total + effect.amount
                    : total,
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
      ...player.classCards,
      ...player.raceCards,
      ...player.rolePermissionCards,
      ...player.equipmentAttachments.map((attachment) => attachment.card),
      ...(player.hirelingCard === null ? [] : [player.hirelingCard]),
      ...(player.mountCard === null ? [] : [player.mountCard]),
    ]),
    ...(state.combat === null
      ? []
      : state.combat.monsters.flatMap((monster) => [
          monster.monster,
          monster.sourceCard,
          ...monster.playedCards.map((played) => played.card),
        ])),
    ...(state.pendingDecision?.type === 'DISCARD_CARDS' &&
    state.pendingDecision.completion.type === 'CURSE'
      ? [state.pendingDecision.completion.card]
      : []),
    ...(state.curseResponse === null ? [] : [state.curseResponse.curseCard]),
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
    case 'DECK_RESHUFFLED':
      return { ...base, deck: event.deck };
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
        decisionId: event.decisionId,
        expiresAtEpochMs: event.expiresAtEpochMs,
      };
    case 'CURSE_RESPONSE_REQUIRED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.curseCardId),
        responseId: event.responseId,
        expiresAtEpochMs: event.expiresAtEpochMs,
      };
    case 'CURSE_RESPONSE_RESOLVED':
      return {
        ...base,
        playerId: event.playerId,
        responseId: event.responseId,
        outcome: event.outcome,
      };
    case 'CURSE_PROTECTION_USED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
        ...(event.protectedCardId === undefined
          ? {}
          : { protectedCardId: event.protectedCardId }),
      };
    case 'DECISION_AUTO_RESOLVED':
      return {
        ...base,
        playerId: event.playerId,
        decisionId: event.decisionId,
        outcome: event.decisionType,
      };
    case 'COMBAT_STARTED':
    case 'COMBAT_WON':
    case 'BAD_STUFF_APPLIED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.monsterCardId),
        encounterId: event.encounterId,
      };
    case 'LOOKED_FOR_TROUBLE':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.monsterCardId),
      };
    case 'MONSTER_ADDED':
      return {
        ...base,
        playerId: event.playerId,
        cards: [
          requiredLogCard(state, event.cardId),
          requiredLogCard(state, event.monsterCardId),
        ],
        encounterId: event.encounterId,
      };
    case 'MONSTER_CLONED':
      return {
        ...base,
        playerId: event.playerId,
        cards: [
          requiredLogCard(state, event.cardId),
          requiredLogCard(state, event.monsterCardId),
        ],
        encounterId: event.encounterId,
        sourceEncounterId: event.sourceEncounterId,
      };
    case 'COMBAT_UPDATED':
      return {
        ...base,
        playerId: event.playerId,
        playerPower: event.playerPower,
        monsterPower: event.monsterPower,
      };
    case 'COMBAT_VICTORY_DECLARED':
      return {
        ...base,
        playerId: event.playerId,
        reactionWindowId: event.reactionWindowId,
        combatId: event.combatId,
        combatRevision: event.combatRevision,
        expiresAtEpochMs: event.expiresAtEpochMs,
      };
    case 'COMBAT_REACTION_PASSED':
    case 'COMBAT_REACTIONS_RESET':
      return {
        ...base,
        playerId: event.playerId,
        reactionWindowId: event.reactionWindowId,
      };
    case 'COMBAT_VICTORY_CANCELLED':
      return { ...base, playerId: event.playerId };
    case 'RUN_AWAY_ATTEMPTED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.monsterCardId),
        roll: event.roll,
        escaped: event.escaped,
        encounterId: event.encounterId,
      };
    case 'HELP_OFFERED':
    case 'HELP_COUNTERED':
    case 'HELP_OFFER_ACCEPTED':
    case 'HELP_OFFER_REJECTED':
    case 'HELP_OFFER_CANCELLED':
      return {
        ...base,
        playerId: event.playerId,
        targetPlayerId: event.helperId,
        offerId: event.offerId,
        ...('expiresAtEpochMs' in event
          ? { expiresAtEpochMs: event.expiresAtEpochMs }
          : {}),
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
    case 'SCAVENGED':
      return { ...base, playerId: event.playerId, count: event.count };
    case 'COMBAT_REWARD_CARDS':
      return {
        ...base,
        playerId: event.playerId,
        cards: logCards(state, event.cardIds),
        count: event.cardIds.length,
      };
    case 'SCAVENGED_CARD':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
      };
    case 'CARD_PLAYED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
        ...(event.target?.type === 'PLAYER'
          ? { targetPlayerId: event.target.playerId }
          : {}),
        ...(event.target?.type === 'COMBAT' ? { side: event.target.side } : {}),
        ...(event.target?.type === 'COMBAT' && event.target.side === 'MONSTER'
          ? { encounterId: event.target.encounterId }
          : {}),
      };
    case 'ROLE_PLAYED':
    case 'ROLE_DISCARDED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
        role: event.role,
      };
    case 'ROLE_PERMISSION_PLAYED':
    case 'ROLE_PERMISSION_DISCARDED':
      return {
        ...base,
        playerId: event.playerId,
        card: requiredLogCard(state, event.cardId),
        role: event.role,
      };
    case 'ROLE_RETENTION_REQUIRED':
      return {
        ...base,
        playerId: event.playerId,
        role: event.role,
        decisionId: event.decisionId,
        expiresAtEpochMs: event.expiresAtEpochMs,
      };
    case 'ROLE_RETAINED':
      return {
        ...base,
        playerId: event.playerId,
        role: event.role,
        card: requiredLogCard(state, event.keptCardId),
      };
    case 'CARDS_SOLD':
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
    case 'CHARITY_CARDS_REVEALED':
      return {
        ...base,
        playerId: event.playerId,
        ...(event.recipientId === null
          ? {}
          : { targetPlayerId: event.recipientId }),
        cards: logCards(state, event.cardIds),
        count: event.cardIds.length,
      };
    case 'GAME_FINISHED':
      return {
        ...base,
        playerId: event.winnerId,
        newLevel: event.winningLevel,
      };
  }
}

function projectHiddenPrivateCardReceipt(
  entry: GameLogEntry,
): GameLogEntryView | null {
  const base = {
    sequence: entry.sequence,
    turnNumber: entry.turnNumber,
    phase: entry.phase,
    type: entry.event.type,
    visibility: 'PUBLIC' as const,
  };
  const event = entry.event;

  switch (event.type) {
    case 'CARD_DRAWN':
      return {
        ...base,
        playerId: event.playerId,
        hiddenCard: { deck: event.deck, count: 1 },
      };
    case 'SCAVENGED_CARD':
      return {
        ...base,
        playerId: event.playerId,
        hiddenCard: { deck: 'TREASURE', count: 1 },
      };
    case 'COMBAT_REWARD_CARDS':
      return {
        ...base,
        playerId: event.playerId,
        hiddenCard: { deck: 'TREASURE', count: event.cardIds.length },
      };
    default:
      return null;
  }
}

export const EVENT_IMPORTANCE = {
  PLAYER_ADDED: 'ROUTINE',
  GAME_STARTED: 'IMPORTANT',
  CARDS_DEALT: 'ROUTINE',
  TURN_STARTED: 'IMPORTANT',
  DOOR_KICKED: 'IMPORTANT',
  DECK_RESHUFFLED: 'ROUTINE',
  LOOKED_FOR_TROUBLE: 'IMPORTANT',
  CARD_DRAWN: 'ROUTINE',
  CARD_ADDED_TO_HAND: 'ROUTINE',
  CARDS_DISCARDED: 'ROUTINE',
  CARDS_DISCARDED_SUMMARY: 'IMPORTANT',
  CARD_DISCARD_REQUIRED: 'IMPORTANT',
  CURSE_RESOLVED: 'IMPORTANT',
  CURSE_RESPONSE_REQUIRED: 'IMPORTANT',
  CURSE_RESPONSE_RESOLVED: 'IMPORTANT',
  CURSE_PROTECTION_USED: 'IMPORTANT',
  DECISION_AUTO_RESOLVED: 'IMPORTANT',
  COMBAT_STARTED: 'IMPORTANT',
  MONSTER_ADDED: 'IMPORTANT',
  MONSTER_CLONED: 'IMPORTANT',
  COMBAT_UPDATED: 'ROUTINE',
  COMBAT_VICTORY_DECLARED: 'IMPORTANT',
  COMBAT_REACTION_PASSED: 'ROUTINE',
  COMBAT_REACTIONS_RESET: 'IMPORTANT',
  COMBAT_VICTORY_CANCELLED: 'IMPORTANT',
  COMBAT_WON: 'IMPORTANT',
  RUN_AWAY_ATTEMPTED: 'IMPORTANT',
  BAD_STUFF_APPLIED: 'IMPORTANT',
  HELP_OFFERED: 'IMPORTANT',
  HELP_COUNTERED: 'IMPORTANT',
  HELP_OFFER_ACCEPTED: 'IMPORTANT',
  HELP_OFFER_REJECTED: 'ROUTINE',
  HELP_OFFER_CANCELLED: 'ROUTINE',
  LEVEL_GAINED: 'IMPORTANT',
  LEVEL_LOST: 'IMPORTANT',
  TREASURE_GAINED: 'IMPORTANT',
  COMBAT_REWARD_CARDS: 'IMPORTANT',
  SCAVENGED: 'IMPORTANT',
  SCAVENGED_CARD: 'IMPORTANT',
  ROOM_LOOTED: 'ROUTINE',
  CARD_PLAYED: 'ROUTINE',
  ITEM_EQUIPPED: 'ROUTINE',
  ITEM_UNEQUIPPED: 'ROUTINE',
  ROLE_PLAYED: 'IMPORTANT',
  ROLE_DISCARDED: 'IMPORTANT',
  CARDS_SOLD: 'IMPORTANT',
  ROLE_PERMISSION_PLAYED: 'IMPORTANT',
  ROLE_PERMISSION_DISCARDED: 'IMPORTANT',
  ROLE_RETENTION_REQUIRED: 'IMPORTANT',
  ROLE_RETAINED: 'IMPORTANT',
  ITEM_TRADED: 'ROUTINE',
  CHARITY_RESOLVED: 'IMPORTANT',
  CHARITY_CARDS_REVEALED: 'ROUTINE',
  PLAYER_DIED: 'IMPORTANT',
  PLAYER_REVIVED: 'IMPORTANT',
  TURN_ENDED: 'ROUTINE',
  GAME_FINISHED: 'IMPORTANT',
} as const satisfies Record<GameLogEventType, 'IMPORTANT' | 'ROUTINE'>;

function requiresViewerAction(
  state: GameState,
  viewerPlayerId: PlayerId,
  entry: GameLogEntryView,
): boolean {
  if (
    entry.type === 'CARD_DISCARD_REQUIRED' ||
    entry.type === 'ROLE_RETENTION_REQUIRED'
  ) {
    const decision = state.pendingDecision;
    return (
      decision !== null &&
      decision.decisionId === entry.decisionId &&
      decision.playerId === viewerPlayerId
    );
  }
  if (entry.type === 'CURSE_RESPONSE_REQUIRED') {
    const response = state.curseResponse;
    return (
      response !== null &&
      response.responseId === entry.responseId &&
      response.targetPlayerId === viewerPlayerId
    );
  }
  if (entry.type === 'COMBAT_VICTORY_DECLARED') {
    const window = state.combat?.reactionWindow;
    return (
      window !== null &&
      window !== undefined &&
      window.windowId === entry.reactionWindowId &&
      !window.confirmedPlayerIds.includes(viewerPlayerId)
    );
  }
  if (entry.type === 'HELP_OFFERED' || entry.type === 'HELP_COUNTERED') {
    const offer = state.combat?.helpOffer;
    if (
      offer === null ||
      offer === undefined ||
      offer.offerId !== entry.offerId
    )
      return false;
    return (
      (offer.proposedBy === 'ACTIVE' && offer.helperId === viewerPlayerId) ||
      (offer.proposedBy === 'HELPER' &&
        state.combat?.playerId === viewerPlayerId)
    );
  }
  return false;
}

function presentEvents(
  state: GameState,
  viewerPlayerId: PlayerId,
  entries: readonly GameLogEntryView[],
): GameView['presentation'] {
  const presented = entries.map<PresentedGameEventView>((entry) => {
    const requiresAction = requiresViewerAction(state, viewerPlayerId, entry);
    return {
      ...entry,
      priority: requiresAction ? 'BLOCKING' : EVENT_IMPORTANCE[entry.type],
      summaryCode: entry.type,
      requiresViewerAction: requiresAction,
    };
  });
  return {
    blocking:
      [...presented].reverse().find((entry) => entry.priority === 'BLOCKING') ??
      null,
    important: presented.filter((entry) => entry.priority === 'IMPORTANT'),
    routine: presented.filter((entry) => entry.priority === 'ROUTINE'),
  };
}

function expectedAction(state: GameState): GameView['expectedAction'] {
  if (state.activePlayerId === null) {
    throw new TypeError('An active game requires an expected actor.');
  }
  if (state.curseResponse !== null)
    return {
      type: 'CURSE_RESPONSE',
      playerId: state.curseResponse.targetPlayerId,
    };
  if (state.pendingDecision !== null) {
    return {
      type:
        state.pendingDecision.type === 'DISCARD_CARDS'
          ? 'DISCARD_CARDS'
          : 'RESOLVE_ROLE_RETENTION',
      playerId: state.pendingDecision.playerId,
    };
  }
  if (state.combat?.reactionWindow !== null && state.combat !== null) {
    const confirmed = new Set(state.combat.reactionWindow.confirmedPlayerIds);
    return {
      type: 'COMBAT_REACTIONS',
      playerId: state.combat.reactionWindow.claimantId,
      waitingPlayerIds: state.players
        .filter((player) => !confirmed.has(player.id))
        .map((player) => player.id),
    };
  }
  if (
    state.combat?.helpOffer !== null &&
    state.combat?.helpOffer !== undefined
  ) {
    return {
      type: 'RESPOND_TO_HELP',
      playerId:
        state.combat.helpOffer.proposedBy === 'ACTIVE'
          ? state.combat.helpOffer.helperId
          : state.combat.playerId,
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

  if (definition.type === CardType.MONSTER) {
    if (canLookForTrouble(state, viewerPlayerId, card.instanceId)) return null;
    if (state.combat !== null) return 'COMBAT_ACTIVE';
    if (state.activePlayerId !== viewerPlayerId) return 'WAITING_FOR_TURN';
    return 'WRONG_PHASE';
  }

  if (definition.type === CardType.CURSE) {
    const window = state.combat?.reactionWindow;
    if (
      window !== null &&
      window !== undefined &&
      window.confirmedPlayerIds.includes(viewerPlayerId)
    )
      return 'REACTION_ALREADY_CONFIRMED';
    return null;
  }
  if (definition.type === CardType.COMBAT_CURSE) {
    const window = state.combat?.reactionWindow;
    if (window === null || window === undefined) return 'NO_AVAILABLE_ACTION';
    return window.confirmedPlayerIds.includes(viewerPlayerId)
      ? 'REACTION_ALREADY_CONFIRMED'
      : null;
  }
  if (
    state.combat !== null &&
    (definition.type === CardType.TEMPORARY_BONUS ||
      definition.type === CardType.MONSTER_MODIFIER ||
      definition.type === CardType.ADD_MONSTER ||
      definition.type === CardType.CLONE_MONSTER)
  ) {
    const window = state.combat.reactionWindow;
    return window !== null && window.confirmedPlayerIds.includes(viewerPlayerId)
      ? 'REACTION_ALREADY_CONFIRMED'
      : null;
  }
  if (
    definition.type === CardType.TEMPORARY_BONUS ||
    definition.type === CardType.MONSTER_MODIFIER ||
    definition.type === CardType.ADD_MONSTER ||
    definition.type === CardType.CLONE_MONSTER
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

function canPlayCombatCard(state: GameState, playerId: PlayerId): boolean {
  if (state.combat === null || state.pendingDecision !== null) return false;
  const window = state.combat.reactionWindow;
  return window === null || !window.confirmedPlayerIds.includes(playerId);
}

function combatCardIntents(
  state: GameState,
  viewerPlayerId: PlayerId,
  self: GameState['players'][number],
): AvailableIntentView[] {
  const combat = state.combat;
  if (combat === null || !canPlayCombatCard(state, viewerPlayerId)) return [];
  const address = {
    combatId: combat.combatId,
    combatRevision: combat.revision,
  };
  const reactionWindowId = combat.reactionWindow?.windowId;
  return self.hand.flatMap<AvailableIntentView>((card) => {
    const definition = state.cardDefinitions.find(
      (candidate) => candidate.id === card.definitionId,
    );
    if (definition === undefined) return [];
    const base = {
      kind: 'PLAY_CARD' as const,
      reasonCode: 'OPTIONAL_CARD_PLAY' as const,
      cardId: card.instanceId,
      ...address,
      ...(reactionWindowId === undefined ? {} : { reactionWindowId }),
    };
    if (
      definition.type === CardType.TEMPORARY_BONUS &&
      definition.effects.length > 0 &&
      definition.effects.every((effect) => effect.type === 'COMBAT_BONUS')
    )
      return [
        {
          ...base,
          id: `play:${card.instanceId}:players:${combat.revision}`,
          target: { type: 'PLAYERS' },
        },
      ];
    if (
      definition.type === CardType.TEMPORARY_BONUS ||
      definition.type === CardType.MONSTER_MODIFIER ||
      definition.type === CardType.CLONE_MONSTER
    )
      return combat.monsters.map((monster) => ({
        ...base,
        id: `play:${card.instanceId}:monster:${monster.encounterId}:${combat.revision}`,
        target: {
          type: 'MONSTER' as const,
          encounterId: monster.encounterId,
        },
      }));
    if (definition.type === CardType.ADD_MONSTER)
      return self.hand.flatMap((monsterCard) =>
        monsterCard.instanceId !== card.instanceId &&
        state.cardDefinitions.find(
          (candidate) => candidate.id === monsterCard.definitionId,
        )?.type === CardType.MONSTER
          ? [
              {
                ...base,
                id: `play:${card.instanceId}:add:${monsterCard.instanceId}:${combat.revision}`,
                target: {
                  type: 'HAND_MONSTER' as const,
                  monsterCardId: monsterCard.instanceId,
                },
              },
            ]
          : [],
      );
    if (definition.type === CardType.CURSE)
      return state.players.map((player) => ({
        ...base,
        id: `curse:${card.instanceId}:${player.id}:${combat.revision}`,
        target: { type: 'PLAYER' as const, playerId: player.id },
      }));
    if (
      definition.type === CardType.COMBAT_CURSE &&
      combat.reactionWindow !== null
    )
      return [
        combat.playerId,
        ...(combat.helpAgreement === null
          ? []
          : [combat.helpAgreement.helperId]),
      ].map((playerId) => ({
        ...base,
        id: `play:${card.instanceId}:player:${playerId}:${combat.revision}`,
        target: { type: 'PLAYER' as const, playerId },
      }));
    return [];
  });
}

function availableIntents(
  state: GameState,
  viewerPlayerId: PlayerId,
): AvailableIntentView[] {
  const self = state.players.find((player) => player.id === viewerPlayerId);
  if (self === undefined || self.isDead || state.status === 'FINISHED')
    return [];
  const response = state.curseResponse;
  if (response !== null) {
    if (response.targetPlayerId !== viewerPlayerId) return [];
    return [
      {
        id: `curse-response:${response.responseId}`,
        kind: 'RESPOND_TO_CURSE',
        reasonCode: 'BLOCKING_RESPONSE',
        responseId: response.responseId,
        expiresAtEpochMs: response.expiresAtEpochMs,
        responses: [
          { type: 'DECLINE' },
          ...response.cancelCardIds.map((cardId) => ({
            type: 'CANCEL' as const,
            cardId,
          })),
          ...response.itemGuardCardIds.map((cardId) => ({
            type: 'PROTECT_ONE_ITEM' as const,
            cardId,
            protectedCardIds: response.protectableItemIds,
          })),
        ],
      },
    ];
  }
  const decision = state.pendingDecision;
  if (decision !== null) {
    if (decision.playerId !== viewerPlayerId) return [];
    if (decision.type === 'CHOOSE_ROLE_TO_KEEP')
      return [
        {
          id: `decision:${decision.decisionId}`,
          kind: 'RESOLVE_ROLE_RETENTION',
          reasonCode: 'BLOCKING_RESPONSE',
          decisionId: decision.decisionId,
          cardIds: decision.candidateCardIds,
          expiresAtEpochMs: decision.expiresAtEpochMs,
        },
      ];
    const source = decision.zone === 'HAND' ? self.hand : self.equipment;
    return [
      {
        id: `decision:${decision.decisionId}`,
        kind: 'RESOLVE_CARD_DISCARD',
        reasonCode: 'BLOCKING_RESPONSE',
        decisionId: decision.decisionId,
        cardIds: source
          .filter((card) => card.instanceId !== decision.protectedCardId)
          .map((card) => card.instanceId),
        count: decision.count,
        expiresAtEpochMs: decision.expiresAtEpochMs,
        ...(decision.completion.type === 'RUN_AWAY'
          ? {
              combatId: decision.completion.combatId,
              combatRevision: decision.completion.combatRevision,
            }
          : {}),
      },
    ];
  }
  const combat = state.combat;
  if (combat?.reactionWindow !== null && combat !== null) {
    if (combat.reactionWindow.confirmedPlayerIds.includes(viewerPlayerId))
      return [];
    return [
      {
        id: `reaction-pass:${combat.combatId}:${combat.reactionWindow.windowId}`,
        kind: 'PASS_COMBAT_REACTION',
        reasonCode: 'BLOCKING_RESPONSE',
        combatId: combat.combatId,
        combatRevision: combat.revision,
        reactionWindowId: combat.reactionWindow.windowId,
        expiresAtEpochMs: combat.reactionWindow.expiresAtEpochMs,
      },
      ...combatCardIntents(state, viewerPlayerId, self),
    ];
  }
  const intents: AvailableIntentView[] = [];
  const offer = combat?.helpOffer;
  if (combat !== null && offer !== null && offer !== undefined) {
    const address = {
      combatId: combat.combatId,
      combatRevision: combat.revision,
      offerId: offer.offerId,
      expiresAtEpochMs: offer.expiresAtEpochMs,
      reasonCode: 'BLOCKING_RESPONSE' as const,
    };
    const responderId =
      offer.proposedBy === 'ACTIVE' ? offer.helperId : combat.playerId;
    if (viewerPlayerId === responderId) {
      intents.push(
        {
          ...address,
          id: `help-accept:${offer.offerId}`,
          kind: 'ACCEPT_HELP_OFFER',
        },
        {
          ...address,
          id: `help-reject:${offer.offerId}`,
          kind: 'REJECT_HELP_OFFER',
        },
      );
      if (offer.proposedBy === 'ACTIVE')
        intents.push({
          ...address,
          id: `help-counter:${offer.offerId}`,
          kind: 'COUNTER_HELP',
          minTreasures: 0,
          maxTreasures: combat.monsters.reduce(
            (sum, monster) => sum + calculateMonsterTreasures(monster),
            0,
          ),
        });
    }
    if (viewerPlayerId === combat.playerId)
      intents.push({
        ...address,
        id: `help-cancel:${offer.offerId}`,
        kind: 'CANCEL_HELP_OFFER',
      });
    if (viewerPlayerId !== combat.playerId) return intents;
  }
  if (combat !== null) {
    intents.push(...combatCardIntents(state, viewerPlayerId, self));
    if (viewerPlayerId !== combat.playerId) return intents;
    const address = {
      combatId: combat.combatId,
      combatRevision: combat.revision,
    };
    if (calculateCombatSidePower(state) > calculateMonsterPower(state))
      intents.push({
        id: `victory:${combat.combatId}:${combat.revision}`,
        kind: 'DECLARE_COMBAT_VICTORY',
        reasonCode: 'COMBAT_WINNING',
        ...address,
      });
    else
      intents.push({
        id: `run-away:${combat.combatId}:${combat.revision}`,
        kind: 'RUN_AWAY',
        reasonCode: 'COMBAT_LOSING',
        ...address,
      });
    if (combat.helpAgreement === null && combat.helpOffer === null)
      intents.push({
        id: `help-propose:${combat.combatId}:${combat.revision}`,
        kind: 'PROPOSE_HELP',
        reasonCode: 'OPTIONAL_CARD_PLAY',
        ...address,
        helperIds: state.players
          .filter((player) => player.id !== viewerPlayerId && !player.isDead)
          .map((player) => player.id),
        minTreasures: 0,
        maxTreasures: combat.monsters.reduce(
          (sum, monster) => sum + calculateMonsterTreasures(monster),
          0,
        ),
      });
    return intents;
  }
  if (state.activePlayerId !== viewerPlayerId) {
    return self.hand.flatMap((card) => {
      const definition = state.cardDefinitions.find(
        (candidate) => candidate.id === card.definitionId,
      );
      return definition?.type === CardType.CURSE
        ? state.players.map((player) => ({
            id: `curse:${card.instanceId}:${player.id}`,
            kind: 'PLAY_CARD' as const,
            reasonCode: 'OPTIONAL_CARD_PLAY' as const,
            cardId: card.instanceId,
            target: { type: 'PLAYER' as const, playerId: player.id },
          }))
        : [];
    });
  }
  if (state.phase === GamePhase.TURN_START)
    intents.push({
      id: `kick-door:${state.turnNumber}`,
      kind: 'KICK_DOOR',
      reasonCode: 'PRIMARY_TURN_ACTION',
    });
  if (state.phase === GamePhase.POST_DOOR) {
    for (const card of self.hand) {
      if (canLookForTrouble(state, viewerPlayerId, card.instanceId))
        intents.push({
          id: `look-for-trouble:${card.instanceId}`,
          kind: 'LOOK_FOR_TROUBLE',
          reasonCode: 'PRIMARY_TURN_ACTION',
          cardId: card.instanceId,
        });
    }
    intents.push(
      canScavenge(state, viewerPlayerId)
        ? {
            id: `scavenge:${state.turnNumber}`,
            kind: 'SCAVENGE',
            reasonCode: 'PRIMARY_TURN_ACTION',
          }
        : {
            id: `loot-room:${state.turnNumber}`,
            kind: 'LOOT_ROOM',
            reasonCode: 'PRIMARY_TURN_ACTION',
          },
    );
  }
  if (canChangeEquipment(state, viewerPlayerId)) {
    for (const card of self.hand) {
      const definition = state.cardDefinitions.find(
        (candidate) => candidate.id === card.definitionId,
      );
      if (canEquipItem(state, viewerPlayerId, card.instanceId))
        intents.push({
          id: `equip:${card.instanceId}`,
          kind: 'EQUIP_ITEM',
          reasonCode: 'OPTIONAL_CARD_PLAY',
          cardId: card.instanceId,
        });
      if (
        definition?.type === CardType.CLASS ||
        definition?.type === CardType.RACE
      ) {
        const active =
          definition.type === CardType.CLASS ? self.classCards : self.raceCards;
        const capacity = roleCapacity(state, self, definition.type);
        const replacements = active.length >= capacity ? active : [undefined];
        for (const replacement of replacements)
          intents.push({
            id: `role:${card.instanceId}:${replacement?.instanceId ?? 'free'}`,
            kind: 'PLAY_ROLE',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: card.instanceId,
            ...(replacement === undefined
              ? {}
              : { replaceCardId: replacement.instanceId }),
          });
      }
      if (definition?.type === CardType.ROLE_PERMISSION)
        intents.push({
          id: `role-permission:${card.instanceId}`,
          kind: 'PLAY_ROLE_PERMISSION',
          reasonCode: 'OPTIONAL_CARD_PLAY',
          cardId: card.instanceId,
        });
      if (definition?.type === CardType.CURSE)
        for (const player of state.players)
          intents.push({
            id: `curse:${card.instanceId}:${player.id}`,
            kind: 'PLAY_CARD',
            reasonCode: 'OPTIONAL_CARD_PLAY',
            cardId: card.instanceId,
            target: { type: 'PLAYER', playerId: player.id },
          });
      if (
        definition?.type === CardType.UTILITY ||
        definition?.type === CardType.HIRELING ||
        definition?.type === CardType.MOUNT
      )
        intents.push({
          id: `play:${card.instanceId}:self`,
          kind: 'PLAY_CARD',
          reasonCode: 'OPTIONAL_CARD_PLAY',
          cardId: card.instanceId,
          target: { type: 'SELF' },
        });
      if (definition?.type === CardType.ATTACHMENT && definition.attachment)
        for (const host of self.equipment) {
          const hostDefinition = state.cardDefinitions.find(
            (candidate) => candidate.id === host.definitionId,
          );
          const allowed =
            hostDefinition !== undefined &&
            (definition.attachment.allowedDefinitionIds?.includes(
              hostDefinition.id,
            ) ??
              hostDefinition.tags.some((tag) =>
                definition.attachment!.allowedTags.includes(tag as never),
              ));
          const occupied = self.equipmentAttachments.some(
            (attachment) => attachment.attachedToCardId === host.instanceId,
          );
          if (allowed && !occupied)
            intents.push({
              id: `attach:${card.instanceId}:${host.instanceId}`,
              kind: 'PLAY_CARD',
              reasonCode: 'OPTIONAL_CARD_PLAY',
              cardId: card.instanceId,
              target: { type: 'EQUIPMENT', cardId: host.instanceId },
            });
        }
    }
    for (const card of self.equipment) {
      if (canUnequipItem(state, viewerPlayerId, card.instanceId))
        intents.push({
          id: `unequip:${card.instanceId}`,
          kind: 'UNEQUIP_ITEM',
          reasonCode: 'OPTIONAL_CARD_PLAY',
          cardId: card.instanceId,
        });
    }
    for (const card of [...self.classCards, ...self.raceCards])
      intents.push({
        id: `discard-role:${card.instanceId}`,
        kind: 'DISCARD_ROLE',
        reasonCode: 'OPTIONAL_CARD_PLAY',
        cardId: card.instanceId,
      });
    for (const card of self.rolePermissionCards)
      intents.push({
        id: `discard-role-permission:${card.instanceId}`,
        kind: 'DISCARD_ROLE_PERMISSION',
        reasonCode: 'OPTIONAL_CARD_PLAY',
        cardId: card.instanceId,
      });
    const sellable = [...self.hand, ...self.equipment]
      .filter((card) => {
        const definition = state.cardDefinitions.find(
          (candidate) => candidate.id === card.definitionId,
        );
        return (
          definition !== undefined &&
          (definition.sellable ??
            (definition.deck === 'TREASURE' && (definition.goldValue ?? 0) > 0))
        );
      })
      .map((card) => card.instanceId);
    if (sellable.length > 0 && self.level < 9)
      intents.push({
        id: `sell:${state.turnNumber}`,
        kind: 'SELL_CARDS',
        reasonCode: 'ECONOMY',
        cardIds: sellable,
        minimumValue: 1000,
      });
    const recipientIds = state.players
      .filter((player) => player.id !== viewerPlayerId)
      .map((player) => player.id);
    if (recipientIds.length > 0)
      for (const card of [...self.hand, ...self.equipment]) {
        const definition = state.cardDefinitions.find(
          (candidate) => candidate.id === card.definitionId,
        );
        if (
          definition !== undefined &&
          (definition.tradeable ?? definition.type === CardType.EQUIPMENT)
        )
          intents.push({
            id: `trade:${card.instanceId}`,
            kind: 'TRADE_CARD',
            reasonCode: 'ECONOMY',
            cardId: card.instanceId,
            recipientIds,
          });
      }
  }
  const excess = Math.max(0, self.hand.length - HAND_LIMIT);
  if (
    excess > 0 &&
    (state.phase === GamePhase.POST_DOOR || state.phase === GamePhase.END_TURN)
  ) {
    const minimum = Math.min(...state.players.map((player) => player.level));
    intents.push({
      id: `charity:${state.turnNumber}`,
      kind: 'GIVE_CHARITY',
      reasonCode: 'HAND_LIMIT',
      cardIds: self.hand.map((card) => card.instanceId),
      count: excess,
      recipientIds:
        self.level === minimum
          ? []
          : state.players
              .filter((player) => player.level === minimum)
              .map((player) => player.id),
      randomDefault: self.level === minimum,
    });
  }
  if (
    self.hand.length <= HAND_LIMIT &&
    (state.phase === GamePhase.POST_DOOR || state.phase === GamePhase.END_TURN)
  )
    intents.push({
      id: `end-turn:${state.turnNumber}`,
      kind: 'END_TURN',
      reasonCode: 'PRIMARY_TURN_ACTION',
    });
  return intents;
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
    sex: player.sex,
    level: player.level,
    handCount: player.hand.length,
    equipment: player.equipment.map((card) => cardView(state, card)),
    equipmentAttachments: player.equipmentAttachments.map((attachment) => ({
      card: cardView(state, attachment.card),
      attachedToCardId: attachment.attachedToCardId,
    })),
    temporaryCombatBonus: player.activeEffects
      .filter((effect) => effect.type === 'COMBAT_POWER')
      .reduce((total, effect) => total + effect.amount, 0),
    equipmentCombatBonus: equipmentCombatBonus(state, player),
    combatPower: combatPowerBreakdown(state, player.id).reduce(
      (sum, line) => sum + line.amount,
      0,
    ),
    combatPowerBreakdown: combatPowerBreakdown(state, player.id),
    classCard:
      player.classCards[0] === undefined
        ? null
        : cardView(state, player.classCards[0]),
    raceCard:
      player.raceCards[0] === undefined
        ? null
        : cardView(state, player.raceCards[0]),
    classCards: player.classCards.map((card) => cardView(state, card)),
    raceCards: player.raceCards.map((card) => cardView(state, card)),
    rolePermissionCards: player.rolePermissionCards.map((card) =>
      cardView(state, card),
    ),
    hirelingCard:
      player.hirelingCard === null
        ? null
        : cardView(state, player.hirelingCard),
    mountCard:
      player.mountCard === null ? null : cardView(state, player.mountCard),
    isDead: player.isDead,
  }));
  const ownPublic = publicPlayers.find(
    (player) => player.playerId === viewerPlayerId,
  );
  if (ownPublic === undefined)
    throw new TypeError('The viewer projection is missing.');
  const visibleLog = state.eventLog.flatMap((entry) => {
    if (
      entry.event.visibility === 'PUBLIC' ||
      entry.event.recipientPlayerId === viewerPlayerId
    )
      return [projectLogEntry(state, entry)];
    const hiddenReceipt = projectHiddenPrivateCardReceipt(entry);
    return hiddenReceipt === null ? [] : [hiddenReceipt];
  });

  return {
    gameId: state.id,
    viewerPlayerId,
    status: state.status,
    phase: state.phase,
    config: state.config,
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
            combatId: state.combat.combatId,
            playerId: state.combat.playerId,
            revision: state.combat.revision,
            monsters: state.combat.monsters.map((monster) => ({
              encounterId: monster.encounterId,
              monster: cardView(state, monster.monster),
              sourceCard: cardView(state, monster.sourceCard),
              clonedFromEncounterId: monster.clonedFromEncounterId,
              baseStrength: monster.baseStrength,
              strengthModifier: monster.strengthModifier,
              currentStrength: calculateMonsterCurrentStrength(state, monster),
              baseLevelRewards: monster.baseLevelRewards,
              baseTreasureRewards: monster.baseTreasureRewards,
              treasureModifier: monster.treasureModifier,
              currentTreasures: calculateMonsterTreasures(monster),
              playedCards: monster.playedCards.map((played) => ({
                ...played,
                card: cardView(state, played.card),
              })),
            })),
            playerPower: calculateCombatSidePower(state),
            monsterPower: calculateMonsterPower(state),
            requestedHelperId: state.combat.helpOffer?.helperId ?? null,
            helperId: state.combat.helpAgreement?.helperId ?? null,
            helpOffer: state.combat.helpOffer,
            helpAgreement: state.combat.helpAgreement,
            helperContribution:
              state.combat.helpAgreement == null
                ? 0
                : calculateCombatPower(
                    state,
                    state.combat.helpAgreement.helperId,
                  ),
            reactionWindow:
              state.combat.reactionWindow === null
                ? null
                : {
                    windowId: state.combat.reactionWindow.windowId,
                    claimantId: state.combat.reactionWindow.claimantId,
                    confirmedPlayerIds:
                      state.combat.reactionWindow.confirmedPlayerIds,
                    waitingPlayerIds: state.players
                      .filter(
                        (player) =>
                          !state.combat!.reactionWindow!.confirmedPlayerIds.includes(
                            player.id,
                          ),
                      )
                      .map((player) => player.id),
                    expiresAtEpochMs:
                      state.combat.reactionWindow.expiresAtEpochMs,
                  },
            runAway:
              state.combat.runAway === null
                ? null
                : {
                    currentCombatantId:
                      state.combat.runAway.combatantIds[
                        state.combat.runAway.sharedBadStuffCursor
                          ?.nextCombatantIndex ??
                          state.combat.runAway.cursor.combatantIndex
                      ] ?? null,
                    currentEncounterId:
                      state.combat.monsters[
                        state.combat.runAway.sharedBadStuffCursor
                          ?.encounterIndex ??
                          state.combat.runAway.cursor.encounterIndex
                      ]?.encounterId ?? null,
                    attempts: state.combat.runAway.attempts.map((attempt) => ({
                      combatantId: attempt.combatantId,
                      encounterId: attempt.encounterId,
                      roll: attempt.roll,
                      outcome: attempt.outcome,
                      badStuffApplied: attempt.badStuffApplied,
                    })),
                  },
            history: state.combat.history.map((entry) => {
              if (entry.type === 'COMBAT_STARTED') {
                const monster = state.combat!.monsters.find(
                  (candidate) => candidate.encounterId === entry.encounterId,
                );
                if (monster === undefined)
                  throw new TypeError(
                    `Combat history references missing encounter ${entry.encounterId}.`,
                  );
                return {
                  ...entry,
                  monster: cardView(state, monster.monster),
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
                  ...(entry.encounterId === undefined
                    ? {}
                    : { encounterId: entry.encounterId }),
                  ...(entry.targetPlayerId === undefined
                    ? {}
                    : { targetPlayerId: entry.targetPlayerId }),
                };
              }
              if (entry.type === 'MONSTER_ADDED') {
                const monster = state.combat!.monsters.find(
                  (candidate) => candidate.encounterId === entry.encounterId,
                );
                if (monster === undefined)
                  throw new TypeError(
                    `Combat history references missing encounter ${entry.encounterId}.`,
                  );
                return {
                  type: entry.type,
                  playerId: entry.playerId,
                  encounterId: entry.encounterId,
                  monster: cardView(state, monster.monster),
                  card: cardView(state, {
                    instanceId: entry.cardId,
                    definitionId: entry.definitionId,
                  }),
                };
              }
              if (entry.type === 'MONSTER_CLONED') {
                const monster = state.combat!.monsters.find(
                  (candidate) => candidate.encounterId === entry.encounterId,
                );
                if (monster === undefined)
                  throw new TypeError(
                    `Combat history references missing encounter ${entry.encounterId}.`,
                  );
                return {
                  type: entry.type,
                  playerId: entry.playerId,
                  encounterId: entry.encounterId,
                  sourceEncounterId: entry.sourceEncounterId,
                  monster: cardView(state, monster.monster),
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
            attempts: state.lastRunAwayResult.attempts.map((attempt) => ({
              encounterId: attempt.encounterId,
              monster: cardView(state, {
                instanceId: attempt.monsterCardId,
                definitionId: attempt.monsterDefinitionId,
              }),
              roll: attempt.roll ?? 0,
              escaped: attempt.outcome === 'ESCAPED',
              badStuffApplied: attempt.badStuffApplied,
            })),
          },
    pendingDecision:
      state.pendingDecision === null
        ? null
        : state.pendingDecision.type === 'DISCARD_CARDS'
          ? {
              decisionId: state.pendingDecision.decisionId,
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
              expiresAtEpochMs: state.pendingDecision.expiresAtEpochMs,
            }
          : {
              decisionId: state.pendingDecision.decisionId,
              type: state.pendingDecision.type,
              playerId: state.pendingDecision.playerId,
              role: state.pendingDecision.role,
              selectableCardIds:
                state.pendingDecision.playerId === viewerPlayerId
                  ? state.pendingDecision.candidateCardIds
                  : [],
              expiresAtEpochMs: state.pendingDecision.expiresAtEpochMs,
            },
    curseResponse:
      state.curseResponse === null
        ? null
        : {
            responseId: state.curseResponse.responseId,
            playerId: state.curseResponse.targetPlayerId,
            curseCard: cardView(state, state.curseResponse.curseCard),
            expiresAtEpochMs: state.curseResponse.expiresAtEpochMs,
            cancelCardIds:
              state.curseResponse.targetPlayerId === viewerPlayerId
                ? state.curseResponse.cancelCardIds
                : [],
            itemGuardCardIds:
              state.curseResponse.targetPlayerId === viewerPlayerId
                ? state.curseResponse.itemGuardCardIds
                : [],
            protectableItemIds:
              state.curseResponse.targetPlayerId === viewerPlayerId
                ? state.curseResponse.protectableItemIds
                : [],
          },
    gameLog: visibleLog,
    presentation: presentEvents(state, viewerPlayerId, visibleLog),
    expectedAction: expectedAction(state),
    deckCounts: {
      door: state.doorDeck.length,
      treasure: state.treasureDeck.length,
    },
    availableIntents: availableIntents(state, viewerPlayerId),
    unavailableCardReasons: [...self.hand, ...self.equipment].flatMap(
      (card) => {
        const reason = unavailableCardReason(state, viewerPlayerId, card);
        return reason === null ? [] : [{ cardId: card.instanceId, reason }];
      },
    ),
  };
}
