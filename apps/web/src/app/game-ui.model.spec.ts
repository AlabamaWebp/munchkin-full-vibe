import type { GameCardView, GamePlayerView, GameView } from '@munchkin-lan/contracts';
import {
  compactCardFacts,
  latestStageCardEvent,
  presentEvents,
  selectStage,
  stageExplainedEventSequences,
  stageShowsCard,
  unavailableReason,
} from './game-ui.model';

const player = (overrides: Partial<GamePlayerView> = {}): GamePlayerView => ({
  playerId: 'p1',
  name: 'Ada',
  level: 1,
  handCount: 0,
  equipment: [],
  temporaryCombatBonus: 0,
  equipmentCombatBonus: 0,
  combatPower: 1,
  classCard: null,
  raceCard: null,
  isDead: false,
  ...overrides,
});
const monster: GameCardView = {
  instanceId: 'm1',
  definitionId: 'monster',
  artKey: 'test.monster',
  name: 'Clockwork Yak',
  description: 'A monster.',
  duration: 'ENCOUNTER_PASSIVE',
  type: 'MONSTER',
  deck: 'DOOR',
  effects: [],
  monster: { strength: 3, levelRewards: 1, treasureRewards: 2, badStuff: [] },
};
const card = (overrides: Partial<GameCardView> = {}): GameCardView => ({
  instanceId: 'c1',
  definitionId: 'card',
  artKey: 'test.card',
  name: 'Useful Card',
  description: 'A useful effect.',
  duration: 'WHILE_EQUIPPED',
  type: 'EQUIPMENT',
  deck: 'TREASURE',
  effects: [],
  ...overrides,
});
const view = (overrides: Partial<GameView> = {}): GameView => {
  const self = player();
  return {
    gameId: 'G',
    viewerPlayerId: 'p1',
    status: 'IN_PROGRESS',
    phase: 'TURN_START',
    activePlayerId: 'p1',
    turnNumber: 1,
    winnerId: null,
    players: [self],
    self: { ...self, hand: [] },
    combat: null,
    lastRunAwayResult: null,
    pendingDecision: null,
    curseResponse: null,
    gameLog: [],
    presentation: { blocking: null, important: [], routine: [] },
    expectedAction: { type: 'TAKE_TURN_ACTION', playerId: 'p1' },
    deckCounts: { door: 10, treasure: 10 },
    availableIntents: [{ id: 'kick:1', kind: 'KICK_DOOR', reasonCode: 'PRIMARY_TURN_ACTION' }],
    unavailableCardReasons: [],
    ...overrides,
  };
};
const combat = {
  combatId: 'combat-1',
  playerId: 'p1',
  revision: 1,
  monsters: [
    {
      encounterId: 'e1',
      monster,
      sourceCard: monster,
      clonedFromEncounterId: null,
      baseStrength: 3,
      strengthModifier: 0,
      currentStrength: 3,
      baseLevelRewards: 1,
      baseTreasureRewards: 2,
      treasureModifier: 0,
      currentTreasures: 2,
      playedCards: [],
    },
  ],
  playerPower: 4,
  monsterPower: 3,
  requestedHelperId: null,
  helperId: null,
  helperContribution: 0,
  reactionWindow: null,
  history: [],
} as NonNullable<GameView['combat']>;

describe('game UI state mapper', () => {
  it('builds the shared compact card facts from projected card data', () => {
    expect(
      compactCardFacts(
        card({
          equipment: { slot: 'HANDS', hands: 1, combatBonus: 3, restrictions: [], value: 400 },
        }),
      ),
    ).toEqual(['Снар.', '+3', '400']);
    expect(compactCardFacts(monster)).toEqual(['Монстр', 'Сила 3', '—']);
  });
  it.each([
    ['TURN_START', 'TURN_READY'],
    ['KICK_DOOR', 'TURN_READY'],
    ['DOOR_RESOLUTION', 'DOOR_REVEAL'],
    ['POST_DOOR', 'POST_DOOR_CHOICE'],
    ['END_TURN', 'TURN_CLEANUP'],
  ] as const)('maps %s to %s', (phase, expected) =>
    expect(selectStage(view({ phase }))).toBe(expected),
  );
  it('maps combat winning, losing and multi-monster to one focused combat state', () => {
    expect(selectStage(view({ combat }))).toBe('COMBAT_OPEN');
    expect(
      selectStage(
        view({
          combat: { ...combat, playerPower: 1, monsters: [...combat.monsters, ...combat.monsters] },
        }),
      ),
    ).toBe('COMBAT_OPEN');
  });
  it('keeps active combat visible during reactions, escape resolution, and blocking decisions', () => {
    expect(
      selectStage(
        view({
          combat: {
            ...combat,
            reactionWindow: {
              windowId: 1,
              claimantId: 'p1',
              confirmedPlayerIds: [],
              waitingPlayerIds: ['p1'],
              expiresAtEpochMs: 10_000,
            },
          },
        }),
      ),
    ).toBe('COMBAT_REACTION');
    expect(
      selectStage(
        view({
          combat: {
            ...combat,
            runAway: { currentCombatantId: 'p1', currentEncounterId: 'e1', attempts: [] },
          },
        }),
      ),
    ).toBe('COMBAT_OPEN');
    expect(
      selectStage(
        view({
          combat,
          pendingDecision: {
            decisionId: 'decision-1',
            type: 'DISCARD_CARDS',
            playerId: 'p1',
            zone: 'HAND',
            count: 1,
            sourceCard: monster,
            selectableCardIds: [],
            expiresAtEpochMs: 10_000,
          },
        }),
      ),
    ).toBe('COMBAT_OPEN');
    expect(
      selectStage(
        view({
          pendingDecision: {
            decisionId: 'decision-1',
            type: 'DISCARD_CARDS',
            playerId: 'p1',
            zone: 'HAND',
            count: 1,
            sourceCard: monster,
            selectableCardIds: [],
            expiresAtEpochMs: 10_000,
          },
        }),
      ),
    ).toBe('BLOCKING_DECISION');
    expect(selectStage(view({ status: 'FINISHED', phase: 'FINISHED' }))).toBe('FINISHED');
  });
  it('presents authoritative important events and does not re-block resolved history', () => {
    const game = view({
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'DOOR_RESOLUTION',
          type: 'DOOR_KICKED',
          visibility: 'PUBLIC',
          playerId: 'p1',
          card: monster,
        },
      ],
      presentation: {
        blocking: null,
        important: [
          {
            sequence: 1,
            turnNumber: 1,
            phase: 'DOOR_RESOLUTION',
            type: 'DOOR_KICKED',
            visibility: 'PUBLIC',
            playerId: 'p1',
            card: monster,
            priority: 'IMPORTANT',
            summaryCode: 'DOOR_KICKED',
            requiresViewerAction: false,
          },
        ],
        routine: [],
      },
    });
    const events = presentEvents(game);
    expect(events[0]?.summary).toContain('Clockwork Yak');
    expect(events[0]?.priority).toBe('IMPORTANT');
  });
  it('uses the supplied localized card name for immediate event presentation', () => {
    const events = presentEvents(
      view({
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'DOOR_RESOLUTION',
              type: 'DOOR_KICKED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              card: monster,
              priority: 'IMPORTANT',
              summaryCode: 'DOOR_KICKED',
              requiresViewerAction: false,
            },
          ],
          routine: [],
        },
      }),
      () => 'Заводской як',
    );

    expect(events[0]?.summary).toBe('Ada открыл Заводской як');
  });
  it('presents authoritative theft outcomes without inventing hidden-hand candidates', () => {
    const stolen = card({ instanceId: 'stolen', name: 'Секретная карта' });
    const events = presentEvents(
      view({
        players: [player(), player({ playerId: 'p2', name: 'Boris' })],
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'POST_DOOR',
              type: 'EQUIPPED_ITEM_THEFT_ATTEMPTED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              targetPlayerId: 'p2',
              card: card({ name: 'Шлем' }),
              outcome: 'FAILED',
              priority: 'IMPORTANT',
              summaryCode: 'EQUIPPED_ITEM_THEFT_ATTEMPTED',
              requiresViewerAction: false,
            },
            {
              sequence: 2,
              turnNumber: 1,
              phase: 'POST_DOOR',
              type: 'RANDOM_HAND_THEFT',
              visibility: 'PUBLIC',
              playerId: 'p1',
              targetPlayerId: 'p2',
              priority: 'IMPORTANT',
              summaryCode: 'RANDOM_HAND_THEFT',
              requiresViewerAction: false,
            },
            {
              sequence: 3,
              turnNumber: 1,
              phase: 'POST_DOOR',
              type: 'STOLEN_HAND_CARD_REVEALED',
              visibility: 'PRIVATE',
              playerId: 'p1',
              targetPlayerId: 'p2',
              card: stolen,
              priority: 'IMPORTANT',
              summaryCode: 'STOLEN_HAND_CARD_REVEALED',
              requiresViewerAction: false,
            },
          ],
          routine: [],
        },
      }),
    );

    expect(events.map((event) => event.summary)).toEqual([
      'Ada попытался забрать Шлем у Boris: неудача',
      'Ada украл случайную карту у Boris',
      'Boris потерял Секретная карта при краже',
    ]);
  });
  it('keeps a combat Treasure reward as one typed presentation outcome', () => {
    const rewards = presentEvents(
      view({
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'END_TURN',
              type: 'TREASURE_GAINED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              count: 5,
              priority: 'IMPORTANT',
              summaryCode: 'TREASURE_GAINED',
              requiresViewerAction: false,
            },
            {
              sequence: 2,
              turnNumber: 1,
              phase: 'END_TURN',
              type: 'COMBAT_REWARD_CARDS',
              visibility: 'PRIVATE',
              playerId: 'p1',
              cards: [card({ instanceId: 'reward' })],
              count: 5,
              priority: 'IMPORTANT',
              summaryCode: 'COMBAT_REWARD_CARDS',
              requiresViewerAction: false,
            },
          ],
          routine: [],
        },
      }),
    );

    expect(rewards.map((event) => event.entry.type)).toEqual(['COMBAT_REWARD_CARDS']);
  });
  it('marks the current stage card receipt so a nearby event strip can skip it', () => {
    const stageCard = card({ instanceId: 'stage-card', name: 'Visible item' });
    const game = view({
      phase: 'POST_DOOR',
      gameLog: [
        {
          sequence: 7,
          turnNumber: 1,
          phase: 'POST_DOOR',
          type: 'CARD_PLAYED',
          visibility: 'PUBLIC',
          playerId: 'p1',
          card: stageCard,
        },
      ],
    });

    expect(stageExplainedEventSequences(game)).toEqual([7]);
  });
  it('shows who a targeted curse was played on', () => {
    const events = presentEvents(
      view({
        players: [player(), player({ playerId: 'p2', name: 'Boris' })],
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'TURN_START',
              type: 'CARD_PLAYED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              targetPlayerId: 'p2',
              card: card({ name: 'Проклятие', type: 'CURSE', deck: 'DOOR' }),
              priority: 'IMPORTANT',
              summaryCode: 'CARD_PLAYED',
              requiresViewerAction: false,
            },
          ],
          routine: [],
        },
      }),
    );

    expect(events[0]?.summary).toBe('Ada сыграл Проклятие на игрока Boris');
  });
  it('presents class and race changes in the game history', () => {
    const events = presentEvents(
      view({
        presentation: {
          blocking: null,
          important: [
            {
              sequence: 1,
              turnNumber: 1,
              phase: 'TURN_START',
              type: 'ROLE_PLAYED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              card: monster,
              role: 'CLASS',
              priority: 'IMPORTANT',
              summaryCode: 'ROLE_PLAYED',
              requiresViewerAction: false,
            },
            {
              sequence: 2,
              turnNumber: 1,
              phase: 'TURN_START',
              type: 'ROLE_DISCARDED',
              visibility: 'PUBLIC',
              playerId: 'p1',
              card: monster,
              role: 'RACE',
              priority: 'IMPORTANT',
              summaryCode: 'ROLE_DISCARDED',
              requiresViewerAction: false,
            },
          ],
          routine: [],
        },
      }),
    );

    expect(events.map((event) => event.summary)).toEqual([
      'Ada выбрал класс: Clockwork Yak',
      'Ada сбросил расу: Clockwork Yak',
    ]);
  });
  it('keeps the latest card event through later phases of the same turn', () => {
    const soldCard = card({ instanceId: 'sold-1', name: 'Brass Greaves' });
    const otherSoldCard = card({ instanceId: 'sold-2', name: 'Silver Cloak' });
    const game = view({
      phase: 'POST_DOOR',
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'POST_DOOR',
          type: 'DOOR_KICKED',
          visibility: 'PUBLIC',
          playerId: 'p1',
          card: monster,
        },
        {
          sequence: 2,
          turnNumber: 1,
          phase: 'POST_DOOR',
          type: 'CARDS_SOLD',
          visibility: 'PUBLIC',
          playerId: 'p1',
          cards: [soldCard, otherSoldCard],
          value: 1000,
          amount: 1,
        },
      ],
    });

    expect(latestStageCardEvent(game)).toMatchObject({
      summary: 'Ada продал карты',
      cards: [soldCard, otherSoldCard],
    });
    expect(latestStageCardEvent({ ...game, phase: 'END_TURN' })).toMatchObject({
      cards: [soldCard, otherSoldCard],
    });
  });
  it('clears a previous turn card when the next turn returns to the same phase', () => {
    const equippedCard = card({ instanceId: 'old-role', name: 'Riverfolk' });
    const game = view({
      phase: 'TURN_START',
      turnNumber: 2,
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'TURN_START',
          type: 'ROLE_PLAYED',
          visibility: 'PUBLIC',
          playerId: 'p1',
          card: equippedCard,
          role: 'RACE',
        },
      ],
    });

    expect(latestStageCardEvent(game)).toBeNull();
  });
  it('does not show the private starting deal on the game stage', () => {
    const game = view({
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'TURN_START',
          type: 'CARDS_DEALT',
          visibility: 'PRIVATE',
          playerId: 'p1',
          cards: [card({ instanceId: 'starter' })],
          count: 8,
        },
      ],
    });

    expect(latestStageCardEvent(game)).toBeNull();
  });
  it('keeps an identity-free private card receipt visible to other players', () => {
    const game = view({
      phase: 'END_TURN',
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'END_TURN',
          type: 'CARD_DRAWN',
          visibility: 'PUBLIC',
          playerId: 'p1',
          hiddenCard: { deck: 'TREASURE', count: 1 },
        },
      ],
    });

    expect(latestStageCardEvent(game)).toMatchObject({
      cards: [],
      hiddenCard: { deck: 'TREASURE', count: 1 },
      summary: 'Ada получил 1 карту сокровища в закрытую',
    });
  });
  it('keeps a stolen equipped item focused through turn cleanup', () => {
    const stolenItem = card({ instanceId: 'stolen-item', name: 'Brass Crown' });
    const game = view({
      phase: 'END_TURN',
      players: [player(), player({ playerId: 'p2', name: 'Boris' })],
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'POST_DOOR',
          type: 'EQUIPPED_ITEM_THEFT_ATTEMPTED',
          visibility: 'PUBLIC',
          playerId: 'p1',
          targetPlayerId: 'p2',
          card: stolenItem,
          outcome: 'SUCCEEDED',
        },
      ],
    });

    expect(stageShowsCard(selectStage(game))).toBe(true);
    expect(latestStageCardEvent(game)).toMatchObject({
      cards: [stolenItem],
      summary: 'Ada попытался забрать Brass Crown у Boris: успех',
    });
  });
  it('combines multiple same-deck draws into one visible card selection', () => {
    const first = card({ instanceId: 'draw-1', name: 'Door Map', deck: 'DOOR' });
    const second = card({ instanceId: 'draw-2', name: 'Old Key', deck: 'DOOR' });
    const game = view({
      phase: 'POST_DOOR',
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'POST_DOOR',
          type: 'CARD_DRAWN',
          visibility: 'PRIVATE',
          playerId: 'p1',
          card: first,
          deck: 'DOOR',
        },
        {
          sequence: 2,
          turnNumber: 1,
          phase: 'POST_DOOR',
          type: 'CARD_DRAWN',
          visibility: 'PRIVATE',
          playerId: 'p1',
          card: second,
          deck: 'DOOR',
        },
      ],
    });

    expect(latestStageCardEvent(game)).toMatchObject({
      cards: [first, second],
      summary: 'Ada получил 2 карты дверей в закрытую',
    });
  });
  it('groups simultaneous combat rewards into recipient tabs without revealing another player card', () => {
    const ownTreasure = card({ instanceId: 'own-treasure', name: 'Copper Compass' });
    const game = view({
      phase: 'END_TURN',
      gameLog: [
        {
          sequence: 1,
          turnNumber: 1,
          phase: 'END_TURN',
          type: 'COMBAT_REWARD_CARDS',
          visibility: 'PRIVATE',
          playerId: 'p1',
          cards: [ownTreasure],
        },
        {
          sequence: 2,
          turnNumber: 1,
          phase: 'END_TURN',
          type: 'COMBAT_REWARD_CARDS',
          visibility: 'PUBLIC',
          playerId: 'p2',
          hiddenCard: { deck: 'TREASURE', count: 1 },
        },
      ],
    });

    expect(latestStageCardEvent(game)?.receipts).toMatchObject([
      { entry: { playerId: 'p1' }, cards: [ownTreasure] },
      { entry: { playerId: 'p2' }, hiddenCard: { deck: 'TREASURE', count: 1 } },
    ]);
    expect(latestStageCardEvent(game)?.receipts[0]?.summary).toBe(
      'Ada получил 1 карту сокровищ в закрытую',
    );
  });
  it('exposes an unavailable card reason', () =>
    expect(
      unavailableReason(
        view({ unavailableCardReasons: [{ cardId: 'x', reason: 'WAITING_FOR_TURN' }] }),
        'x',
      ),
    ).toContain('ваш ход'));
});
