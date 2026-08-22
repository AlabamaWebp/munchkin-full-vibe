import type { GameCardView, GamePlayerView, GameView } from '@munchkin-lan/contracts';
import { presentEvents, selectStage, unavailableReason } from './game-ui.model';

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
  it('prioritizes reaction, run away, pending decision and finished states', () => {
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
    ).toBe('RUN_AWAY_SEQUENCE');
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
  it('exposes an unavailable card reason', () =>
    expect(
      unavailableReason(
        view({ unavailableCardReasons: [{ cardId: 'x', reason: 'WAITING_FOR_TURN' }] }),
        'x',
      ),
    ).toContain('ваш ход'));
});
