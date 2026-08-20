import {
  CardType,
  createGame,
  createSeededRandomSource,
  executeCommand,
  parseGameId,
  parseEncounterId,
  parsePlayerId,
  type GameState,
} from '@munchkin-lan/game-engine';
import { createGameView } from './game-view';

describe('createGameView', () => {
  it('shows the viewer hand while exposing only another hand count', () => {
    const adaId = parsePlayerId('ada');
    const graceId = parsePlayerId('grace');
    const random = createSeededRandomSource(42);
    let state: GameState = createGame({ id: parseGameId('ABCD') });

    for (const [actorId, name] of [
      [adaId, 'Ada'],
      [graceId, 'Grace'],
    ] as const) {
      const added = executeCommand(
        state,
        { type: 'ADD_PLAYER', actorId, name },
        { random },
      );
      if (!added.success) throw new Error(added.error.message);
      state = added.state;
    }
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: adaId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);

    const adaView = createGameView(started.state, adaId);
    const graceState = started.state.players.find(
      (player) => player.id === graceId,
    );
    expect(adaView.self.hand).toHaveLength(8);
    expect(
      adaView.players.find((player) => player.playerId === graceId),
    ).toEqual(expect.objectContaining({ handCount: 8 }));
    expect(adaView.players[1]).not.toHaveProperty('hand');
    expect(
      adaView.gameLog.filter((entry) => entry.type === 'CARDS_DEALT'),
    ).toEqual([expect.objectContaining({ playerId: adaId, count: 8 })]);
    expect(adaView.gameLog.every((entry) => entry.phase !== undefined)).toBe(
      true,
    );
    const serializedAdaView = JSON.stringify(adaView);
    for (const hiddenCard of graceState?.hand ?? []) {
      expect(serializedAdaView).not.toContain(hiddenCard.instanceId);
    }
  });

  it('projects a public card event to every viewer without exposing either private hand', () => {
    const adaId = parsePlayerId('public-ada');
    const graceId = parsePlayerId('public-grace');
    const random = createSeededRandomSource(142);
    let state = createGame({ id: parseGameId('SHOW') });
    for (const [actorId, name] of [
      [adaId, 'Ada'],
      [graceId, 'Grace'],
    ] as const) {
      const added = executeCommand(
        state,
        { type: 'ADD_PLAYER', actorId, name },
        { random },
      );
      if (!added.success) throw new Error(added.error.message);
      state = added.state;
    }
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: adaId },
      { random },
    );
    if (!started.success || started.state.activePlayerId === null)
      throw new Error('Expected a started game.');
    const revealedCard = started.state.doorDeck[0];
    if (revealedCard === undefined) throw new Error('Expected a Door card.');
    const kicked = executeCommand(
      started.state,
      { type: 'KICK_DOOR', actorId: started.state.activePlayerId },
      { random },
    );
    if (!kicked.success) throw new Error(kicked.error.message);

    for (const viewerId of [adaId, graceId]) {
      const view = createGameView(kicked.state, viewerId);
      const publicEntry = view.gameLog.find(
        (entry) => entry.type === 'DOOR_KICKED',
      );
      expect(publicEntry?.card?.instanceId).toBe(revealedCard.instanceId);
      expect(publicEntry?.card?.effects).toBeDefined();

      const other = kicked.state.players.find(
        (player) => player.id !== viewerId,
      );
      const serialized = JSON.stringify(view);
      for (const hiddenCard of other?.hand ?? []) {
        if (hiddenCard.instanceId !== revealedCard.instanceId) {
          expect(serialized).not.toContain(hiddenCard.instanceId);
        }
      }
    }
  });

  it('offers actions only to the active player in a valid phase', () => {
    const playerId = parsePlayerId('solo');
    const random = createSeededRandomSource(7);
    let state = createGame({ id: parseGameId('SOLO') });
    const added = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId: playerId, name: 'Solo' },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    state = added.state;
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: playerId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    expect(createGameView(started.state, playerId).availableActions).toEqual([
      'KICK_DOOR',
    ]);
  });

  it('projects the exact hand Monsters available for LOOK_FOR_TROUBLE and its public event', () => {
    const playerId = parsePlayerId('trouble-solo');
    const random = createSeededRandomSource(17);
    let state = createGame({ id: parseGameId('LOOK') });
    const added = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId: playerId, name: 'Solo' },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    const started = executeCommand(
      added.state,
      { type: 'START_GAME', actorId: playerId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const monster = [
      ...started.state.players[0]!.hand,
      ...started.state.doorDeck,
    ].find((card) =>
      started.state.cardDefinitions.some(
        (definition) =>
          definition.id === card.definitionId &&
          definition.type === CardType.MONSTER,
      ),
    );
    if (monster === undefined) throw new Error('Missing development Monster.');
    state = {
      ...started.state,
      phase: 'POST_DOOR',
      combat: null,
      doorDeck: started.state.doorDeck.filter(
        (card) => card.instanceId !== monster.instanceId,
      ),
      players: started.state.players.map((player) => ({
        ...player,
        hand: [monster],
      })),
    };

    const before = createGameView(state, playerId);
    expect(before.lookForTroubleCardIds).toEqual([monster.instanceId]);
    expect(before.availableActions).toContain('LOOK_FOR_TROUBLE');
    expect(before.unavailableCardReasons).not.toContainEqual(
      expect.objectContaining({ cardId: monster.instanceId }),
    );

    const result = executeCommand(
      state,
      {
        type: 'LOOK_FOR_TROUBLE',
        actorId: playerId,
        cardId: monster.instanceId,
      },
      { random },
    );
    if (!result.success) throw new Error(result.error.message);
    const after = createGameView(result.state, playerId);
    expect(after.lookForTroubleCardIds).toEqual([]);
    expect(after.combat?.monsters[0]?.monster.instanceId).toBe(
      monster.instanceId,
    );
    expect(after.gameLog.at(-2)).toMatchObject({
      type: 'LOOKED_FOR_TROUBLE',
      visibility: 'PUBLIC',
      card: { instanceId: monster.instanceId },
    });
  });

  it('projects a pending discard choice only to the addressed player', () => {
    const adaId = parsePlayerId('pending-ada');
    const bobId = parsePlayerId('pending-bob');
    const random = createSeededRandomSource(71);
    let state = createGame({ id: parseGameId('WAIT') });
    for (const [actorId, name] of [
      [adaId, 'Ada'],
      [bobId, 'Bob'],
    ] as const) {
      const added = executeCommand(
        state,
        { type: 'ADD_PLAYER', actorId, name },
        { random },
      );
      if (!added.success) throw new Error(added.error.message);
      state = added.state;
    }
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: adaId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const sourceCard = started.state.doorDeck.find((card) =>
      started.state.cardDefinitions.some(
        (definition) =>
          definition.id === card.definitionId &&
          definition.type === CardType.CURSE,
      ),
    );
    if (sourceCard === undefined) throw new Error('Missing development Curse.');
    state = {
      ...started.state,
      phase: 'DOOR_RESOLUTION',
      doorDeck: started.state.doorDeck.filter(
        (card) => card.instanceId !== sourceCard.instanceId,
      ),
      pendingDecision: {
        type: 'DISCARD_CARDS',
        playerId: adaId,
        zone: 'HAND',
        count: 1,
        sourceCardId: sourceCard.instanceId,
        sourceDefinitionId: sourceCard.definitionId,
        remainingEffects: [],
        completion: {
          type: 'CURSE',
          card: sourceCard,
          targetPlayerId: adaId,
          phaseAfterResolution: 'POST_DOOR',
        },
      },
    };

    const adaView = createGameView(state, adaId);
    const bobView = createGameView(state, bobId);
    expect(adaView.pendingDecision?.selectableCardIds).toEqual(
      state.players[0]?.hand.map((card) => card.instanceId),
    );
    expect(bobView.pendingDecision).toMatchObject({
      playerId: adaId,
      count: 1,
      selectableCardIds: [],
    });
    expect(adaView.availableActions).toEqual([]);
    expect(bobView.availableActions).toEqual([]);
    expect(bobView.expectedAction).toEqual({
      type: 'DISCARD_CARDS',
      playerId: adaId,
    });
  });

  it('projects server-derived equipment actions and combat power', () => {
    const playerId = parsePlayerId('solo');
    const random = createSeededRandomSource(9);
    let state = createGame({ id: parseGameId('GEAR') });
    const added = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId: playerId, name: 'Solo' },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    const started = executeCommand(
      added.state,
      { type: 'START_GAME', actorId: playerId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);

    const equipmentCard = [
      ...started.state.players[0]!.hand,
      ...started.state.treasureDeck,
    ].find((card) =>
      started.state.cardDefinitions.some(
        (definition) =>
          definition.id === card.definitionId &&
          definition.type === CardType.EQUIPMENT,
      ),
    );
    if (equipmentCard === undefined)
      throw new Error('Missing development equipment.');
    state = {
      ...started.state,
      players: started.state.players.map((player) => ({
        ...player,
        hand: [equipmentCard],
        equipment: [],
      })),
    };

    const before = createGameView(state, playerId);
    expect(before.availableEquipmentActions.equipCardIds).toContain(
      equipmentCard.instanceId,
    );
    expect(before.self.combatPower).toBe(before.self.level);

    const equipped = executeCommand(
      state,
      {
        type: 'EQUIP_ITEM',
        actorId: playerId,
        cardId: equipmentCard.instanceId,
      },
      { random },
    );
    if (!equipped.success) throw new Error(equipped.error.message);
    const after = createGameView(equipped.state, playerId);
    expect(after.availableEquipmentActions.unequipCardIds).toEqual([
      equipmentCard.instanceId,
    ]);
    expect(after.self.equipmentCombatBonus).toBeGreaterThan(0);
    expect(after.self.combatPower).toBe(
      after.self.level + after.self.equipmentCombatBonus,
    );
    expect(after.self.equipment[0]?.equipment).toBeDefined();
    expect(after.self.equipment[0]?.equipment?.combatBonus).toBeGreaterThan(0);
    expect(after.self.equipment[0]?.artKey).toBeTruthy();
    expect(after.self.equipment[0]?.goldValue).toEqual(expect.any(Number));
    expect(after.self.equipment[0]?.equipment?.restrictions).toBeInstanceOf(
      Array,
    );
  });

  it('does not project item transfer actions outside the viewer turn', () => {
    const adaId = parsePlayerId('trade-ada');
    const graceId = parsePlayerId('trade-grace');
    const random = createSeededRandomSource(31);
    let state = createGame({ id: parseGameId('GIVE') });
    for (const [actorId, name] of [
      [adaId, 'Ada'],
      [graceId, 'Grace'],
    ] as const) {
      const added = executeCommand(
        state,
        { type: 'ADD_PLAYER', actorId, name },
        { random },
      );
      if (!added.success) throw new Error(added.error.message);
      state = added.state;
    }
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: adaId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const inactiveId = started.state.players.find(
      (player) => player.id !== started.state.activePlayerId,
    )?.id;
    const item = [
      ...started.state.players.flatMap((player) => player.hand),
      ...started.state.treasureDeck,
    ].find((card) =>
      started.state.cardDefinitions.some(
        (definition) =>
          definition.id === card.definitionId &&
          definition.type === CardType.EQUIPMENT,
      ),
    );
    if (inactiveId === undefined || item === undefined)
      throw new Error('Missing inactive player or development equipment.');
    state = {
      ...started.state,
      phase: 'END_TURN',
      players: started.state.players.map((player) =>
        player.id === inactiveId ? { ...player, hand: [item] } : player,
      ),
    };

    const view = createGameView(state, inactiveId);
    expect(view.expandedRuleActions.tradeableItemCardIds).toEqual([]);
    expect(view.unavailableCardReasons).toContainEqual({
      cardId: item.instanceId,
      reason: 'WAITING_FOR_TURN',
    });
  });

  it('projects combat powers and only the active player combat cards', () => {
    const playerId = parsePlayerId('solo');
    const random = createSeededRandomSource(11);
    let state = createGame({ id: parseGameId('FIGHT') });
    const added = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId: playerId, name: 'Solo' },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    const started = executeCommand(
      added.state,
      { type: 'START_GAME', actorId: playerId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const allCards = [
      ...started.state.players[0]!.hand,
      ...started.state.doorDeck,
      ...started.state.treasureDeck,
    ];
    const findCard = (type: string) =>
      allCards.find((card) =>
        started.state.cardDefinitions.some(
          (definition) =>
            definition.id === card.definitionId && definition.type === type,
        ),
      );
    const monster = findCard(CardType.MONSTER);
    const bonus = findCard(CardType.TEMPORARY_BONUS);
    if (monster === undefined || bonus === undefined)
      throw new Error('Missing development combat cards.');
    const monsterStats = started.state.cardDefinitions.find(
      (definition) => definition.id === monster.definitionId,
    )!.monster!;
    const encounterId = parseEncounterId('encounter-1');
    state = {
      ...started.state,
      phase: 'DOOR_RESOLUTION',
      combat: {
        playerId,
        revision: 1,
        monsters: [
          {
            encounterId,
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: monsterStats.level,
            baseLevelRewards: monsterStats.levelRewards,
            baseTreasureRewards: monsterStats.treasureRewards,
            badStuff: monsterStats.badStuff,
            strengthModifier: 0,
            treasureModifier: 0,
            playedCards: [],
          },
        ],
        nextEncounterSequence: 2,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        requestedHelperId: null,
        helperId: null,
        runAway: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId,
            encounterId,
            monsterDefinitionId: monster.definitionId,
          },
        ],
      },
      players: started.state.players.map((player) => ({
        ...player,
        hand: [bonus],
      })),
    };

    const view = createGameView(state, playerId);
    expect(view.availableActions).toEqual(['RUN_AWAY']);
    expect(view.playableCombatCards.playersSideCardIds).toEqual([
      bonus.instanceId,
    ]);
    expect(view.playableCombatCards.monsterSideCardIds).toEqual([]);
    expect(view.unavailableCardReasons).not.toContainEqual(
      expect.objectContaining({ cardId: bonus.instanceId }),
    );
    expect(view.combat).toMatchObject({
      playerId,
      playerPower: view.self.combatPower,
      monsterPower: view.combat?.monsters[0]?.currentStrength,
    });

    const escaped = executeCommand(
      state,
      { type: 'RUN_AWAY', actorId: playerId },
      { random: { nextInt: () => 4 } },
    );
    if (!escaped.success) throw new Error(escaped.error.message);
    expect(createGameView(escaped.state, playerId)).toMatchObject({
      combat: null,
      availableActions: ['END_TURN'],
      lastRunAwayResult: {
        playerId,
        attempts: [
          { encounterId, roll: 5, escaped: true, badStuffApplied: false },
        ],
      },
    });
  });

  it('projects help actions, all-player combat cards, modifiers, and public history', () => {
    const adaId = parsePlayerId('ada-multiplayer');
    const graceId = parsePlayerId('grace-multiplayer');
    const random = createSeededRandomSource(21);
    let state = createGame({ id: parseGameId('MULTI') });
    for (const [actorId, name] of [
      [adaId, 'Ada'],
      [graceId, 'Grace'],
    ] as const) {
      const added = executeCommand(
        state,
        { type: 'ADD_PLAYER', actorId, name },
        { random },
      );
      if (!added.success) throw new Error(added.error.message);
      state = added.state;
    }
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: adaId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const activeId = started.state.activePlayerId;
    if (activeId === null)
      throw new Error('Started game has no active player.');
    const helperId = activeId === adaId ? graceId : adaId;
    const allCards = [
      ...started.state.players.flatMap((player) => player.hand),
      ...started.state.doorDeck,
      ...started.state.treasureDeck,
    ];
    const findCard = (type: string) =>
      allCards.find((card) =>
        started.state.cardDefinitions.some(
          (definition) =>
            definition.id === card.definitionId && definition.type === type,
        ),
      );
    const monster = findCard(CardType.MONSTER);
    const bonus = findCard(CardType.TEMPORARY_BONUS);
    const modifier = findCard(CardType.MONSTER_MODIFIER);
    const combatCurse = findCard(CardType.COMBAT_CURSE);
    if (
      monster === undefined ||
      bonus === undefined ||
      modifier === undefined ||
      combatCurse === undefined
    )
      throw new Error('Missing development multiplayer combat cards.');
    const monsterStats = started.state.cardDefinitions.find(
      (definition) => definition.id === monster.definitionId,
    )!.monster!;
    const encounterId = parseEncounterId('encounter-1');
    state = {
      ...started.state,
      phase: 'DOOR_RESOLUTION',
      players: started.state.players.map((player) =>
        player.id === helperId
          ? { ...player, hand: [bonus, modifier, combatCurse] }
          : player,
      ),
      combat: {
        playerId: activeId,
        revision: 1,
        monsters: [
          {
            encounterId,
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: monsterStats.level,
            baseLevelRewards: monsterStats.levelRewards,
            baseTreasureRewards: monsterStats.treasureRewards,
            badStuff: monsterStats.badStuff,
            strengthModifier: 0,
            treasureModifier: 0,
            playedCards: [],
          },
        ],
        nextEncounterSequence: 2,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        requestedHelperId: helperId,
        helperId: null,
        runAway: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId: activeId,
            encounterId,
            monsterDefinitionId: monster.definitionId,
          },
          { type: 'HELP_REQUESTED', playerId: activeId, helperId },
        ],
      },
    };

    const helperView = createGameView(state, helperId);
    expect(helperView.availableActions).toEqual(['ACCEPT_HELP']);
    expect(helperView.playableCombatCards).toEqual({
      playersSideCardIds: [bonus.instanceId],
      monsterSideCardIds: [modifier.instanceId],
      monsterTargetActions: [
        { cardId: modifier.instanceId, encounterIds: [encounterId] },
      ],
      addMonsterActions: [],
      playerTargetActions: [],
    });
    expect(helperView.combat?.history).toHaveLength(2);

    const activeView = createGameView(state, activeId);
    expect(activeView.requestableHelperIds).toEqual([helperId]);
    expect(activeView.combat).toMatchObject({ requestedHelperId: helperId });

    const reactionState: GameState = {
      ...state,
      combat: {
        ...state.combat!,
        reactionWindow: {
          windowId: 1,
          declaredAtRevision: state.combat!.revision,
          claimantId: activeId,
          confirmedPlayerIds: [activeId],
        },
        nextReactionWindowSequence: 2,
      },
    };
    const reactionView = createGameView(reactionState, helperId);
    expect(reactionView.expectedAction).toEqual({
      type: 'COMBAT_REACTIONS',
      playerId: activeId,
      waitingPlayerIds: [helperId],
    });
    expect(reactionView.availableActions).toEqual(['PASS_COMBAT_REACTION']);
    expect(reactionView.combat?.reactionWindow).toEqual({
      windowId: 1,
      claimantId: activeId,
      confirmedPlayerIds: [activeId],
      waitingPlayerIds: [helperId],
    });
    expect(reactionView.playableCombatCards.playerTargetActions).toEqual([
      { cardId: combatCurse.instanceId, playerIds: [activeId] },
    ]);
    expect(createGameView(reactionState, activeId).availableActions).toEqual(
      [],
    );
  });

  it('projects added, modified, and cloned Monster encounters independently', () => {
    const playerId = parsePlayerId('multi-viewer');
    const random = createSeededRandomSource(91);
    let state = createGame({ id: parseGameId('MOBS') });
    const addedPlayer = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId: playerId, name: 'Viewer' },
      { random },
    );
    if (!addedPlayer.success) throw new Error(addedPlayer.error.message);
    const started = executeCommand(
      addedPlayer.state,
      { type: 'START_GAME', actorId: playerId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const allCards = [
      ...started.state.players[0]!.hand,
      ...started.state.doorDeck,
      ...started.state.treasureDeck,
    ];
    const cardsOfType = (type: CardType) =>
      allCards.filter((card) =>
        started.state.cardDefinitions.some(
          (definition) =>
            definition.id === card.definitionId && definition.type === type,
        ),
      );
    const [firstMonster, secondMonster] = cardsOfType(CardType.MONSTER);
    const addCard = cardsOfType(CardType.ADD_MONSTER)[0];
    const cloneCard = cardsOfType(CardType.CLONE_MONSTER)[0];
    const modifier = cardsOfType(CardType.MONSTER_MODIFIER)[0];
    if (
      firstMonster === undefined ||
      secondMonster === undefined ||
      addCard === undefined ||
      cloneCard === undefined ||
      modifier === undefined
    )
      throw new Error('Missing development multi-Monster cards.');
    const stats = started.state.cardDefinitions.find(
      (definition) => definition.id === firstMonster.definitionId,
    )!.monster!;
    const firstEncounterId = parseEncounterId('encounter-1');
    state = {
      ...started.state,
      phase: 'DOOR_RESOLUTION',
      players: started.state.players.map((player) => ({
        ...player,
        hand: [secondMonster, addCard, cloneCard, modifier],
      })),
      combat: {
        playerId,
        revision: 1,
        monsters: [
          {
            encounterId: firstEncounterId,
            monster: firstMonster,
            sourceCard: firstMonster,
            clonedFromEncounterId: null,
            baseStrength: stats.level,
            baseLevelRewards: stats.levelRewards,
            baseTreasureRewards: stats.treasureRewards,
            badStuff: stats.badStuff,
            strengthModifier: 0,
            treasureModifier: 0,
            playedCards: [],
          },
        ],
        nextEncounterSequence: 2,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        requestedHelperId: null,
        helperId: null,
        runAway: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId,
            encounterId: firstEncounterId,
            monsterDefinitionId: firstMonster.definitionId,
          },
        ],
      },
    };

    const added = executeCommand(
      state,
      {
        type: 'PLAY_CARD',
        actorId: playerId,
        cardId: addCard.instanceId,
        target: { type: 'HAND_MONSTER', cardId: secondMonster.instanceId },
      },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    const secondEncounterId = added.state.combat!.monsters[1]!.encounterId;
    const modified = executeCommand(
      added.state,
      {
        type: 'PLAY_CARD',
        actorId: playerId,
        cardId: modifier.instanceId,
        target: {
          type: 'COMBAT',
          side: 'MONSTER',
          encounterId: secondEncounterId,
        },
      },
      { random },
    );
    if (!modified.success) throw new Error(modified.error.message);
    const cloned = executeCommand(
      modified.state,
      {
        type: 'PLAY_CARD',
        actorId: playerId,
        cardId: cloneCard.instanceId,
        target: {
          type: 'COMBAT',
          side: 'MONSTER',
          encounterId: secondEncounterId,
        },
      },
      { random },
    );
    if (!cloned.success) throw new Error(cloned.error.message);

    const view = createGameView(cloned.state, playerId);
    expect(view.combat?.monsters).toHaveLength(3);
    expect(view.combat?.monsters[1]).toMatchObject({
      encounterId: secondEncounterId,
      playedCards: [
        { card: { instanceId: addCard.instanceId } },
        { card: { instanceId: modifier.instanceId } },
      ],
    });
    expect(view.combat?.monsters[2]).toMatchObject({
      clonedFromEncounterId: secondEncounterId,
      sourceCard: { instanceId: cloneCard.instanceId },
      strengthModifier: view.combat?.monsters[1]?.strengthModifier,
      treasureModifier: view.combat?.monsters[1]?.treasureModifier,
    });
    expect(view.combat?.history.map((entry) => entry.type)).toEqual([
      'COMBAT_STARTED',
      'MONSTER_ADDED',
      'CARD_PLAYED',
      'MONSTER_CLONED',
    ]);
    expect(view.gameLog.slice(-2).map((entry) => entry.type)).toEqual([
      'MONSTER_CLONED',
      'COMBAT_UPDATED',
    ]);
  });
});
