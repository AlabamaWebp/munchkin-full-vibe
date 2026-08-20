import {
  CardType,
  createGame,
  createSeededRandomSource,
  executeCommand,
  parseGameId,
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
    const serializedAdaView = JSON.stringify(adaView);
    for (const hiddenCard of graceState?.hand ?? []) {
      expect(serializedAdaView).not.toContain(hiddenCard.instanceId);
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
    state = {
      ...started.state,
      phase: 'DOOR_RESOLUTION',
      combat: {
        playerId,
        monster,
        monsterBonus: 0,
        requestedHelperId: null,
        helperId: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId,
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
    expect(view.combat).toMatchObject({
      playerId,
      playerPower: view.self.combatPower,
      monsterPower: view.combat?.monster.monster?.level,
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
        roll: 5,
        escaped: true,
        badStuffApplied: false,
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
    if (monster === undefined || bonus === undefined || modifier === undefined)
      throw new Error('Missing development multiplayer combat cards.');
    state = {
      ...started.state,
      phase: 'DOOR_RESOLUTION',
      players: started.state.players.map((player) =>
        player.id === helperId
          ? { ...player, hand: [bonus, modifier] }
          : player,
      ),
      combat: {
        playerId: activeId,
        monster,
        monsterBonus: 0,
        requestedHelperId: helperId,
        helperId: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId: activeId,
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
    });
    expect(helperView.combat?.history).toHaveLength(2);

    const activeView = createGameView(state, activeId);
    expect(activeView.requestableHelperIds).toEqual([helperId]);
    expect(activeView.combat).toMatchObject({ requestedHelperId: helperId });
  });
});
