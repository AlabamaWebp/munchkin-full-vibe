import type { GameCardView, GamePlayerView, GameView } from '@munchkin-lan/contracts';
import {
  latestStageCardEvent,
  presentEvents,
  selectStage,
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
  it('keeps the latest card event of the current phase and clears it on a phase change', () => {
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
    expect(latestStageCardEvent({ ...game, phase: 'TURN_START' })).toBeNull();
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
      summary: 'Ada получил закрытую карту',
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
  });
  it('exposes an unavailable card reason', () =>
    expect(
      unavailableReason(
        view({ unavailableCardReasons: [{ cardId: 'x', reason: 'WAITING_FOR_TURN' }] }),
        'x',
      ),
    ).toContain('ваш ход'));
});
