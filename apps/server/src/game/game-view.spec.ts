import {
  CardSetId,
  CardType,
  createGame,
  createSeededRandomSource,
  executeCommand,
  GameMode,
  GamePhase,
  parseGameId,
  parseHelpOfferId,
  parseEncounterId,
  parseCardDefinitionId,
  parseCardInstanceId,
  parseCurseResponseId,
  parseCombatId,
  parsePlayerId,
  type GameState,
} from '@munchkin-lan/game-engine';
import { EVENT_IMPORTANCE, createGameView } from './game-view';

describe('authoritative event importance', () => {
  it.each(Object.entries(EVENT_IMPORTANCE))(
    '%s is assigned %s',
    (_type, importance) => {
      expect(['IMPORTANT', 'ROUTINE']).toContain(importance);
    },
  );

  it('keeps both important and routine domain events', () => {
    expect(Object.values(EVENT_IMPORTANCE)).toContain('IMPORTANT');
    expect(Object.values(EVENT_IMPORTANCE)).toContain('ROUTINE');
  });
});

describe('createGameView', () => {
  it('projects Curse Response choices only to the target without leaking defense identities', () => {
    const sourceId = parsePlayerId('curse-source');
    const targetId = parsePlayerId('curse-target');
    const observerId = parsePlayerId('curse-observer');
    const random = createSeededRandomSource(818);
    let state = createGame({ id: parseGameId('CRES') });
    for (const [actorId, name] of [
      [sourceId, 'Source'],
      [targetId, 'Target'],
      [observerId, 'Observer'],
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
      { type: 'START_GAME', actorId: sourceId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const curseDefinition = {
      id: parseCardDefinitionId('private-curse'),
      artKey: 'test.private-curse',
      setId: CardSetId.CORE,
      tier: 1 as const,
      name: 'Private Curse',
      description: 'Lose a level.',
      type: CardType.CURSE,
      deck: 'DOOR' as const,
      tags: [],
      effects: [{ type: 'LOSE_LEVEL' as const, amount: 1 }],
    };
    const defenseDefinition = {
      id: parseCardDefinitionId('private-defense'),
      artKey: 'test.private-defense',
      setId: CardSetId.CORE,
      tier: 1 as const,
      name: 'Private Defense',
      description: 'Cancel a Curse.',
      type: CardType.UTILITY,
      deck: 'TREASURE' as const,
      tags: [],
      effects: [],
      curseProtection: { mode: 'CANCEL' as const },
    };
    const curseCard = {
      instanceId: parseCardInstanceId('private-curse-card'),
      definitionId: curseDefinition.id,
    };
    const defenseCard = {
      instanceId: parseCardInstanceId('private-defense-card'),
      definitionId: defenseDefinition.id,
    };
    const responseId = parseCurseResponseId('curse-response-1');
    state = {
      ...started.state,
      cardDefinitions: [
        ...started.state.cardDefinitions,
        curseDefinition,
        defenseDefinition,
      ],
      players: started.state.players.map((entry) =>
        entry.id === targetId ? { ...entry, hand: [defenseCard] } : entry,
      ),
      curseResponse: {
        responseId,
        targetPlayerId: targetId,
        sourcePlayerId: sourceId,
        curseCard,
        remainingEffects: curseDefinition.effects,
        phaseAfterResolution: null,
        cancelCardIds: [defenseCard.instanceId],
        itemGuardCardIds: [],
        protectableItemIds: [],
        createdAtEpochMs: 1_000,
        expiresAtEpochMs: 21_000,
      },
    };

    const targetView = createGameView(state, targetId);
    const observerView = createGameView(state, observerId);
    expect(targetView.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'RESPOND_TO_CURSE',
        responseId,
        responses: expect.arrayContaining([
          { type: 'CANCEL', cardId: defenseCard.instanceId },
        ]),
      }),
    );
    expect(observerView.availableIntents).toEqual([]);
    expect(observerView.curseResponse).toMatchObject({
      playerId: targetId,
      cancelCardIds: [],
      itemGuardCardIds: [],
      protectableItemIds: [],
    });
    expect(JSON.stringify(observerView)).not.toContain(defenseCard.instanceId);
  });

  it('projects public attachments without exposing raw balance tiers', () => {
    const actorId = parsePlayerId('attachment-viewer');
    const random = createSeededRandomSource(913);
    let state = createGame({
      id: parseGameId('ATTV'),
      config: {
        mode: 'BALANCED',
        enabledSetIds: [CardSetId.CORE, CardSetId.ARSENAL],
      },
    });
    const added = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId, name: 'Ada', sex: 'FEMALE' },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    const started = executeCommand(
      added.state,
      { type: 'START_GAME', actorId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    state = started.state;
    const allTreasure = [
      ...state.treasureDeck,
      ...state.treasureDiscard,
      ...state.players.flatMap((player) => player.hand),
    ];
    const host = allTreasure.find(
      (card) => card.definitionId === 'spatula-of-resolve',
    );
    const attachment = allTreasure.find(
      (card) => card.definitionId === 'sharpening-chorus',
    );
    if (host === undefined || attachment === undefined)
      throw new Error('Attachment fixture cards are missing.');
    const fixtureIds = new Set([host.instanceId, attachment.instanceId]);
    state = {
      ...state,
      activePlayerId: actorId,
      phase: GamePhase.TURN_START,
      treasureDeck: state.treasureDeck.filter(
        (card) => !fixtureIds.has(card.instanceId),
      ),
      treasureDiscard: state.treasureDiscard.filter(
        (card) => !fixtureIds.has(card.instanceId),
      ),
      players: state.players.map((player) => ({
        ...player,
        hand: [
          ...player.hand.filter((card) => !fixtureIds.has(card.instanceId)),
          attachment,
        ],
        equipment: [host],
      })),
    };
    const played = executeCommand(
      state,
      {
        type: 'PLAY_CARD',
        actorId,
        cardId: attachment.instanceId,
        target: { type: 'EQUIPMENT', cardId: host.instanceId },
      },
      { random },
    );
    if (!played.success) throw new Error(played.error.message);

    const view = createGameView(played.state, actorId);
    expect(view.players[0]?.equipmentAttachments).toEqual([
      {
        card: expect.objectContaining({ instanceId: attachment.instanceId }),
        attachedToCardId: host.instanceId,
      },
    ]);
    expect(view.players[0]?.equipment[0]).toMatchObject({
      instanceId: host.instanceId,
      equipped: {
        resolvedCombatBonus: expect.any(Number),
        attachments: [
          {
            card: expect.objectContaining({
              instanceId: attachment.instanceId,
            }),
            combatBonus: 1,
          },
        ],
      },
    });
    expect(
      view.gameLog.find(
        (entry) =>
          entry.type === 'CARD_PLAYED' &&
          entry.card?.instanceId === attachment.instanceId,
      ),
    ).toBeDefined();
    expect(JSON.stringify(view)).not.toContain('"tier":');
  });

  it('keeps charity card identities private to the sender and recipient after projection', () => {
    const adaId = parsePlayerId('charity-ada');
    const graceId = parsePlayerId('charity-grace');
    const linusId = parsePlayerId('charity-linus');
    const random = createSeededRandomSource(704);
    let state = createGame({ id: parseGameId('GIVE') });
    for (const [actorId, name] of [
      [adaId, 'Ada'],
      [graceId, 'Grace'],
      [linusId, 'Linus'],
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
    state = {
      ...started.state,
      activePlayerId: adaId,
      phase: GamePhase.END_TURN,
      players: started.state.players.map((player) => ({
        ...player,
        level: player.id === adaId ? 3 : player.id === graceId ? 1 : 2,
      })),
    };
    const sender = state.players.find((player) => player.id === adaId)!;
    const selected = sender.hand.slice(0, sender.hand.length - 5);
    const result = executeCommand(
      state,
      {
        type: 'GIVE_CHARITY',
        actorId: adaId,
        cardIds: selected.map((card) => card.instanceId),
        recipientId: graceId,
      },
      { random },
    );
    if (!result.success) throw new Error(result.error.message);

    const adaView = createGameView(result.state, adaId);
    const graceView = createGameView(result.state, graceId);
    const linusView = createGameView(result.state, linusId);
    for (const view of [adaView, graceView]) {
      expect(
        view.gameLog.find((entry) => entry.type === 'CHARITY_CARDS_REVEALED'),
      ).toMatchObject({
        visibility: 'PRIVATE',
        playerId: adaId,
        targetPlayerId: graceId,
        cards: selected.map((card) => ({ instanceId: card.instanceId })),
      });
    }
    expect(
      linusView.gameLog.find(
        (entry) => entry.type === 'CHARITY_CARDS_REVEALED',
      ),
    ).toBeUndefined();
    expect(
      linusView.gameLog.find((entry) => entry.type === 'CHARITY_RESOLVED'),
    ).toMatchObject({
      visibility: 'PUBLIC',
      playerId: adaId,
      targetPlayerId: graceId,
      count: selected.length,
    });
    for (const card of selected) {
      expect(JSON.stringify(linusView)).not.toContain(card.instanceId);
    }
  });

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
    let state = createGame({
      id: parseGameId('SHOW'),
      config: { mode: 'CLASSIC_CHAOS', enabledSetIds: ['CORE'] },
    });
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

  it('projects automatic unequip publicly without exposing the rest of the returned hand', () => {
    const adaId = parsePlayerId('unequip-ada');
    const graceId = parsePlayerId('unequip-grace');
    const random = createSeededRandomSource(143);
    let state = createGame({ id: parseGameId('ROLE') });
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
    const returned = started.state.players[0]!.hand[0]!;
    const stillHidden = started.state.players[0]!.hand[1]!;
    state = {
      ...started.state,
      eventLog: [
        ...started.state.eventLog,
        {
          sequence: started.state.eventLog.length + 1,
          turnNumber: started.state.turnNumber,
          phase: GamePhase.TURN_START,
          event: {
            type: 'ITEM_UNEQUIPPED',
            visibility: 'PUBLIC',
            playerId: adaId,
            cardId: returned.instanceId,
            definitionId: returned.definitionId,
          },
        },
      ],
    };

    const graceView = createGameView(state, graceId);
    expect(
      graceView.gameLog.find(
        (entry) =>
          entry.type === 'ITEM_UNEQUIPPED' &&
          entry.card?.instanceId === returned.instanceId,
      ),
    ).toBeDefined();
    expect(JSON.stringify(graceView)).not.toContain(stillHidden.instanceId);
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
    expect(
      createGameView(started.state, playerId).availableIntents,
    ).toContainEqual(expect.objectContaining({ kind: 'KICK_DOOR' }));
  });

  it('projects sale and charity intents, but none for dead or finished viewers', () => {
    const playerId = parsePlayerId('intent-states');
    const random = createSeededRandomSource(77);
    let state = createGame({ id: parseGameId('INTS') });
    const added = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId: playerId, name: 'Intent Tester' },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    const started = executeCommand(
      added.state,
      { type: 'START_GAME', actorId: playerId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const owned = started.state.players[0]!.hand;
    const allCards = [
      ...owned,
      ...started.state.treasureDeck,
      ...started.state.doorDeck,
    ];
    const sellable = allCards.find((card) => {
      const entry = started.state.cardDefinitions.find(
        (definition) => definition.id === card.definitionId,
      );
      return (
        entry !== undefined &&
        (entry.sellable ??
          (entry.deck === 'TREASURE' && (entry.goldValue ?? 0) > 0))
      );
    });
    if (sellable === undefined)
      throw new Error('Missing sellable fixture card.');
    const hand = [
      sellable,
      ...allCards
        .filter((card) => card.instanceId !== sellable.instanceId)
        .slice(0, 5),
    ];
    state = {
      ...started.state,
      phase: GamePhase.POST_DOOR,
      players: started.state.players.map((entry) => ({ ...entry, hand })),
    };
    state = { ...state, phase: GamePhase.END_TURN };
    const intents = createGameView(state, playerId).availableIntents;
    expect(intents).toContainEqual(
      expect.objectContaining({ kind: 'SELL_CARDS' }),
    );
    expect(intents).toContainEqual(
      expect.objectContaining({ kind: 'GIVE_CHARITY', count: 1 }),
    );
    const dead: GameState = {
      ...state,
      players: state.players.map((entry) => ({ ...entry, isDead: true })),
    };
    expect(createGameView(dead, playerId).availableIntents).toEqual([]);
    const finished = createGameView(
      { ...state, status: 'FINISHED', phase: 'FINISHED', winnerId: playerId },
      playerId,
    );
    expect(finished).toMatchObject({
      status: 'FINISHED',
      phase: 'FINISHED',
      winnerId: playerId,
      players: [
        {
          playerId,
          level: state.players[0]!.level,
          combatPower: expect.any(Number),
        },
      ],
    });
    expect(finished.availableIntents).toEqual([]);
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
    expect(before.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'LOOK_FOR_TROUBLE',
        cardId: monster.instanceId,
      }),
    );
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
    expect(after.availableIntents).not.toContainEqual(
      expect.objectContaining({ kind: 'LOOK_FOR_TROUBLE' }),
    );
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
    expect(adaView.pendingDecision?.selectableCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instanceId: state.players[0]?.hand[0]?.instanceId,
          artKey: expect.any(String),
          name: expect.any(String),
        }),
      ]),
    );
    expect(bobView.pendingDecision).toMatchObject({
      playerId: adaId,
      count: 1,
      selectableCardIds: [],
    });
    expect(bobView.pendingDecision?.selectableCards).toBeUndefined();
    expect(JSON.stringify(bobView)).not.toContain(
      state.players[0]?.hand[0]?.name ?? '__missing_private_card__',
    );
    expect(adaView.availableIntents).toContainEqual(
      expect.objectContaining({ kind: 'RESOLVE_CARD_DISCARD' }),
    );
    expect(bobView.availableIntents).toEqual([]);
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
    expect(before.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'EQUIP_ITEM',
        cardId: equipmentCard.instanceId,
      }),
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
    expect(after.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'UNEQUIP_ITEM',
        cardId: equipmentCard.instanceId,
      }),
    );
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

  it('projects companion and mount combat bonuses for the character sheet', () => {
    const playerId = parsePlayerId('companion-solo');
    const random = createSeededRandomSource(24);
    let state = createGame({
      id: parseGameId('COMP'),
      config: {
        mode: GameMode.BALANCED,
        enabledSetIds: [CardSetId.CORE, CardSetId.COMPANIONS],
      },
    });
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

    const cards = [
      ...started.state.treasureDeck,
      ...started.state.players[0]!.hand,
    ];
    const hireling = cards.find((card) =>
      started.state.cardDefinitions.some(
        (definition) =>
          definition.id === card.definitionId &&
          definition.type === CardType.HIRELING,
      ),
    );
    const mount = cards.find((card) =>
      started.state.cardDefinitions.some(
        (definition) =>
          definition.id === card.definitionId &&
          definition.type === CardType.MOUNT,
      ),
    );
    if (hireling === undefined || mount === undefined)
      throw new Error('Missing development companions.');

    state = {
      ...started.state,
      players: started.state.players.map((player) => ({
        ...player,
        hirelingCard: hireling,
        mountCard: mount,
      })),
    };

    const view = createGameView(state, playerId);
    expect(view.self.hirelingCard?.companion?.combatBonus).toBeGreaterThan(0);
    expect(view.self.mountCard?.companion?.combatBonus).toBeGreaterThan(0);
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
    expect(view.availableIntents).not.toContainEqual(
      expect.objectContaining({ kind: 'TRADE_CARD' }),
    );
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
    const monster = allCards.find((card) =>
      started.state.cardDefinitions.some(
        (definition) =>
          definition.id === card.definitionId &&
          definition.type === CardType.MONSTER &&
          definition.monster?.strength === 3,
      ),
    );
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
        combatId: parseCombatId('combat-view-1'),
        playerId,
        revision: 1,
        monsters: [
          {
            encounterId,
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: monsterStats.strength,
            baseLevelRewards: monsterStats.levelRewards,
            baseTreasureRewards: monsterStats.treasureRewards,
            tier: 1,
            tags: [],
            badStuff: monsterStats.badStuff,
            strengthModifier: 0,
            treasureModifier: 0,
            playedCards: [],
          },
        ],
        nextEncounterSequence: 2,
        nextHelpOfferSequence: 1,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        helpOffer: null,
        helpAgreement: null,
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
    expect(view.availableIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'RUN_AWAY' }),
        expect.objectContaining({
          kind: 'PLAY_CARD',
          cardId: bonus.instanceId,
        }),
      ]),
    );
    expect(view.availableIntents).not.toContainEqual(
      expect.objectContaining({ kind: 'PROPOSE_HELP' }),
    );
    expect(view.unavailableCardReasons).not.toContainEqual(
      expect.objectContaining({ cardId: bonus.instanceId }),
    );
    expect(view.combat).toMatchObject({
      playerId,
      playerPower: view.self.combatPower,
      monsterPower: view.combat?.monsters[0]?.currentStrength,
    });
    expect(view.self.combatPowerBreakdown).toContainEqual({
      source: 'MAKESHIFT_TOOLS',
      amount: 2,
    });

    const escaped = executeCommand(
      state,
      {
        type: 'RUN_AWAY',
        actorId: playerId,
        combatId: parseCombatId('combat-view-1'),
        combatRevision: 1,
      },
      { random: { nextInt: () => 4 } },
    );
    if (!escaped.success) throw new Error(escaped.error.message);
    expect(createGameView(escaped.state, playerId)).toMatchObject({
      combat: null,
      lastRunAwayResult: {
        playerId,
        attempts: [
          {
            combatantId: playerId,
            encounterId,
            roll: 5,
            escaped: true,
            badStuffApplied: false,
          },
        ],
      },
    });
    expect(
      createGameView(escaped.state, playerId).availableIntents,
    ).toContainEqual(expect.objectContaining({ kind: 'END_TURN' }));
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
    const curse = findCard(CardType.CURSE);
    const combatCurse = findCard(CardType.COMBAT_CURSE);
    if (
      monster === undefined ||
      bonus === undefined ||
      modifier === undefined ||
      curse === undefined ||
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
          ? { ...player, hand: [bonus, modifier, curse, combatCurse] }
          : player,
      ),
      combat: {
        combatId: parseCombatId('combat-help-1'),
        playerId: activeId,
        revision: 1,
        monsters: [
          {
            encounterId,
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: monsterStats.strength,
            baseLevelRewards: monsterStats.levelRewards,
            baseTreasureRewards: monsterStats.treasureRewards,
            tier: 1,
            tags: [],
            badStuff: monsterStats.badStuff,
            strengthModifier: 0,
            treasureModifier: 0,
            playedCards: [],
          },
        ],
        nextEncounterSequence: 2,
        nextHelpOfferSequence: 2,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        helpOffer: {
          offerId: parseHelpOfferId('offer-1'),
          helperId,
          proposedBy: 'ACTIVE',
          treasureCount: 0,
          expiresAtEpochMs: 20_000,
        },
        helpAgreement: null,
        runAway: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId: activeId,
            encounterId,
            monsterDefinitionId: monster.definitionId,
          },
          {
            type: 'HELP_OFFERED',
            playerId: activeId,
            helperId,
            offerId: parseHelpOfferId('offer-1'),
            treasureCount: 0,
            totalTreasureCount: 1,
          },
        ],
      },
    };

    const helperView = createGameView(state, helperId);
    expect(helperView.availableIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ACCEPT_HELP_OFFER' }),
        expect.objectContaining({ kind: 'REJECT_HELP_OFFER' }),
      ]),
    );
    expect(helperView.combat?.history).toHaveLength(2);

    const activeView = createGameView(state, activeId);
    expect(activeView.availableIntents).not.toContainEqual(
      expect.objectContaining({ kind: 'PROPOSE_HELP' }),
    );
    expect(activeView.availableIntents).toContainEqual(
      expect.objectContaining({ kind: 'CANCEL_HELP_OFFER' }),
    );
    expect(activeView.combat).toMatchObject({ requestedHelperId: helperId });
    expect(activeView.combat?.helpOffer).toEqual(helperView.combat?.helpOffer);

    const reactionState: GameState = {
      ...state,
      combat: {
        ...state.combat!,
        reactionWindow: {
          windowId: 1,
          declaredAtRevision: state.combat!.revision,
          claimantId: activeId,
          confirmedPlayerIds: [activeId],
          eligiblePlayerIds: [activeId, helperId],
          expiresAtEpochMs: 20_000,
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
    expect(reactionView.availableIntents).toContainEqual(
      expect.objectContaining({ kind: 'PASS_COMBAT_REACTION' }),
    );
    expect(reactionView.combat?.reactionWindow).toEqual({
      windowId: 1,
      claimantId: activeId,
      confirmedPlayerIds: [activeId],
      waitingPlayerIds: [helperId],
      expiresAtEpochMs: 20_000,
    });
    expect(reactionView.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'PLAY_CARD',
        cardId: combatCurse.instanceId,
        target: { type: 'PLAYER', playerId: activeId },
      }),
    );
    expect(reactionView.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'PLAY_CARD',
        cardId: curse.instanceId,
        target: { type: 'PLAYER', playerId: activeId },
      }),
    );
    expect(createGameView(reactionState, activeId).availableIntents).toEqual(
      [],
    );
  });

  it('projects combat reward identities only to their recipient', () => {
    const ids = [
      parsePlayerId('reward-active'),
      parsePlayerId('reward-helper'),
      parsePlayerId('reward-spectator'),
    ] as const;
    const random = createSeededRandomSource(91);
    let state = createGame({ id: parseGameId('PRIV') });
    for (const [index, actorId] of ids.entries()) {
      const added = executeCommand(
        state,
        {
          type: 'ADD_PLAYER',
          actorId,
          name: `P${index}`,
          sex: index % 2 === 0 ? 'MALE' : 'FEMALE',
        },
        { random },
      );
      if (!added.success) throw new Error(added.error.message);
      state = added.state;
    }
    const started = executeCommand(
      state,
      { type: 'START_GAME', actorId: ids[0] },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    const activeCard = started.state.players[0]!.hand[0]!;
    const helperCard = started.state.players[1]!.hand[0]!;
    state = {
      ...started.state,
      eventLog: [
        ...started.state.eventLog,
        {
          sequence: started.state.eventLog.length + 1,
          turnNumber: started.state.turnNumber,
          phase: started.state.phase,
          event: {
            type: 'COMBAT_REWARD_CARDS',
            visibility: 'PRIVATE',
            recipientPlayerId: ids[0],
            playerId: ids[0],
            cardIds: [activeCard.instanceId],
          },
        },
        {
          sequence: started.state.eventLog.length + 2,
          turnNumber: started.state.turnNumber,
          phase: started.state.phase,
          event: {
            type: 'COMBAT_REWARD_CARDS',
            visibility: 'PRIVATE',
            recipientPlayerId: ids[1],
            playerId: ids[1],
            cardIds: [helperCard.instanceId],
          },
        },
      ],
    };
    const activeView = createGameView(state, ids[0]);
    const helperView = createGameView(state, ids[1]);
    const spectatorView = createGameView(state, ids[2]);
    expect(
      activeView.gameLog
        .find((entry) => entry.type === 'COMBAT_REWARD_CARDS')
        ?.cards?.map((card) => card.instanceId),
    ).toEqual([activeCard.instanceId]);
    expect(
      helperView.gameLog
        .find(
          (entry) =>
            entry.type === 'COMBAT_REWARD_CARDS' && entry.playerId === ids[1],
        )
        ?.cards?.map((card) => card.instanceId),
    ).toEqual([helperCard.instanceId]);
    expect(
      spectatorView.gameLog.filter(
        (entry) => entry.type === 'COMBAT_REWARD_CARDS',
      ),
    ).toEqual([
      expect.objectContaining({
        playerId: ids[0],
        hiddenCard: { deck: 'TREASURE', count: 1 },
      }),
      expect.objectContaining({
        playerId: ids[1],
        hiddenCard: { deck: 'TREASURE', count: 1 },
      }),
    ]);
    expect(JSON.stringify(spectatorView)).not.toContain(activeCard.instanceId);
    expect(JSON.stringify(spectatorView)).not.toContain(helperCard.instanceId);
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
        combatId: parseCombatId('combat-encounters-1'),
        playerId,
        revision: 1,
        monsters: [
          {
            encounterId: firstEncounterId,
            monster: firstMonster,
            sourceCard: firstMonster,
            clonedFromEncounterId: null,
            baseStrength: stats.strength,
            baseLevelRewards: stats.levelRewards,
            baseTreasureRewards: stats.treasureRewards,
            tier: 1,
            tags: [],
            badStuff: stats.badStuff,
            strengthModifier: 0,
            treasureModifier: 0,
            playedCards: [],
          },
        ],
        nextEncounterSequence: 2,
        nextHelpOfferSequence: 1,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        helpOffer: null,
        helpAgreement: null,
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
        combatId: parseCombatId('combat-encounters-1'),
        combatRevision: 1,
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
        combatId: parseCombatId('combat-encounters-1'),
        combatRevision: added.state.combat!.revision,
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
        combatId: parseCombatId('combat-encounters-1'),
        combatRevision: modified.state.combat!.revision,
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

describe('V2 card-rule intent projection', () => {
  it('projects both exact combat sides, role costs, and complete Details metadata', () => {
    const playerId = parsePlayerId('rule-viewer');
    const random = createSeededRandomSource(2026);
    let state = createGame({ id: parseGameId('rule-view') });
    const added = executeCommand(
      state,
      { type: 'ADD_PLAYER', actorId: playerId, name: 'Rule Viewer' },
      { random },
    );
    if (!added.success) throw new Error(added.error.message);
    const started = executeCommand(
      added.state,
      { type: 'START_GAME', actorId: playerId },
      { random },
    );
    if (!started.success) throw new Error(started.error.message);
    state = started.state;
    const instance = (definitionId: string, suffix: string) => ({
      instanceId: parseCardInstanceId(`${definitionId}-${suffix}`),
      definitionId: parseCardDefinitionId(definitionId),
    });
    const neutral = instance('bottled-applause', 'view');
    const playersOnly = instance('emergency-confetti', 'view');
    const cost = instance('door-cache', 'cost');
    const role = instance('scrap-knights', 'role');
    const monster = instance('map-eater', 'combat');
    const encounterId = parseEncounterId('rule-view-encounter');
    state = {
      ...state,
      phase: GamePhase.DOOR_RESOLUTION,
      players: state.players.map((player) => ({
        ...player,
        hand: [neutral, playersOnly, cost],
        classCards: [role],
        abilityUsages: [],
      })),
      combat: {
        combatId: parseCombatId('rule-view-combat'),
        playerId,
        revision: 4,
        monsters: [
          {
            encounterId,
            monster,
            sourceCard: monster,
            clonedFromEncounterId: null,
            baseStrength: 8,
            baseLevelRewards: 1,
            baseTreasureRewards: 2,
            tier: 2,
            tags: ['BEAST'],
            badStuff: [],
            strengthModifier: 0,
            treasureModifier: 0,
            playedCards: [],
          },
        ],
        nextEncounterSequence: 2,
        nextHelpOfferSequence: 1,
        nextReactionWindowSequence: 1,
        reactionWindow: null,
        helpOffer: null,
        helpAgreement: null,
        history: [
          {
            type: 'COMBAT_STARTED',
            playerId,
            encounterId,
            monsterDefinitionId: monster.definitionId,
          },
        ],
        runAway: null,
      },
    };

    const view = createGameView(state, playerId);
    expect(
      view.availableIntents
        .filter(
          (intent) =>
            intent.kind === 'PLAY_CARD' && intent.cardId === neutral.instanceId,
        )
        .map((intent) => ('target' in intent ? intent.target : null)),
    ).toEqual([{ type: 'PLAYERS' }, { type: 'MONSTER', encounterId }]);
    expect(
      view.availableIntents.filter(
        (intent) =>
          intent.kind === 'PLAY_CARD' &&
          intent.cardId === playersOnly.instanceId,
      ),
    ).toEqual([expect.objectContaining({ target: { type: 'PLAYERS' } })]);
    expect(view.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'USE_ROLE_ABILITY',
        roleCardId: role.instanceId,
        abilityType: 'COMBAT_BONUS',
        cost: {
          count: 1,
          eligibleCardIds: [
            neutral.instanceId,
            playersOnly.instanceId,
            cost.instanceId,
          ],
        },
        target: { type: 'PLAYERS' },
        combatId: 'rule-view-combat',
        combatRevision: 4,
      }),
    );
    expect(
      view.self.hand.find((card) => card.instanceId === neutral.instanceId),
    ).toMatchObject({
      duration: 'END_OF_COMBAT',
      play: { target: 'COMBAT_SIDE' },
      effects: [{ type: 'COMBAT_SIDE_BONUS', amount: 3 }],
    });
    expect(view.self.classCards?.[0]).toMatchObject({
      duration: 'WHILE_ROLE_ACTIVE',
      role: {
        role: 'CLASS',
        modifier: { type: 'COMBAT_POWER' },
        activeAbility: {
          type: 'COMBAT_BONUS',
          cost: { type: 'DISCARD_HAND', count: 1 },
          usage: 'ONCE_PER_COMBAT',
        },
      },
    });

    const drawRole = instance('guild-of-echoes', 'role');
    const exhausted: GameState = {
      ...state,
      phase: GamePhase.TURN_START,
      combat: null,
      treasureDeck: [],
      treasureDiscard: [],
      players: state.players.map((player) => ({
        ...player,
        hand: [neutral, cost],
        classCards: [drawRole],
      })),
    };
    expect(
      createGameView(exhausted, playerId).availableIntents.some(
        (intent) => intent.kind === 'USE_ROLE_ABILITY',
      ),
    ).toBe(false);
  });
});
