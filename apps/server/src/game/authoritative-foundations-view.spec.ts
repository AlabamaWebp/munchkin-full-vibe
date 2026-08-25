import {
  CardPlayTarget,
  CardPlayTiming,
  CardSetId,
  CardType,
  DeckType,
  EquipmentSlot,
  GameMode,
  GamePhase,
  GameStatus,
  executeCommand,
  parseCardDefinitionId,
  parseCardInstanceId,
  parseGameId,
  parsePlayerId,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type PlayerState,
} from '@munchkin-lan/game-engine';
import { createGameView } from './game-view';

const actorId = parsePlayerId('view-actor');
const victimId = parsePlayerId('view-victim');
const observerId = parsePlayerId('view-observer');

function definition(
  value: string,
  overrides: Partial<CardDefinition>,
): CardDefinition {
  return {
    id: parseCardDefinitionId(value),
    artKey: `test.${value}`,
    setId: CardSetId.CORE,
    tier: 1,
    name: value,
    description: `${value} description`,
    type: CardType.UTILITY,
    deck: DeckType.TREASURE,
    tags: [],
    play: { timings: [CardPlayTiming.TURN], target: CardPlayTarget.SELF },
    effects: [],
    ...overrides,
  };
}

function card(value: string, entry: CardDefinition): CardInstance {
  return {
    instanceId: parseCardInstanceId(value),
    definitionId: entry.id,
  };
}

function player(
  id: typeof actorId,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    id,
    name: id,
    sex: 'MALE',
    level: 2,
    hand: [],
    equipment: [],
    equipmentAttachments: [],
    classCards: [],
    raceCards: [],
    rolePermissionCards: [],
    hirelingCard: null,
    mountCard: null,
    hirelingCards: [],
    mountCards: [],
    isDead: false,
    activeEffects: [],
    abilityUsages: [],
    ...overrides,
  };
}

function state(
  definitions: readonly CardDefinition[],
  players: readonly PlayerState[],
): GameState {
  return {
    schemaVersion: 5,
    config: {
      mode: GameMode.CLASSIC_CHAOS,
      enabledSetIds: [CardSetId.CORE],
      maxHandSize: 5,
      doubleMonsterAmbushEnabled: false,
    },
    id: parseGameId('view-foundations'),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.END_TURN,
    players,
    activePlayerId: actorId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: [],
    doorDiscard: [],
    treasureDiscard: [],
    combat: null,
    nextCombatSequence: 1,
    lastRunAwayResult: null,
    pendingDecision: null,
    curseResponse: null,
    nextCurseResponseSequence: 1,
    nextPendingDecisionSequence: 1,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
  };
}

describe('authoritative theft privacy and Equipment upgrade projection', () => {
  it('reconstructs victim-only stolen identity while observers retain only the public summary', () => {
    const theft = definition('view-hand-theft', {
      effects: [{ type: 'STEAL_RANDOM_HAND_CARD' }],
      play: {
        timings: [CardPlayTiming.TURN],
        target: CardPlayTarget.ANY_PLAYER,
      },
    });
    const hidden = definition('view-hidden', {});
    const theftCard = card('view-theft-card', theft);
    const first = card('view-hidden-1', hidden);
    const stolen = card('view-hidden-2', hidden);
    const resolved = executeCommand(
      state(
        [theft, hidden],
        [
          player(actorId, { hand: [theftCard] }),
          player(victimId, { hand: [first, stolen] }),
          player(observerId),
        ],
      ),
      {
        type: 'PLAY_CARD',
        actorId,
        cardId: theftCard.instanceId,
        target: { type: 'PLAYER', playerId: victimId },
      },
      { random: { nextInt: () => 1 } },
    );
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;

    const reconnected = JSON.parse(JSON.stringify(resolved.state)) as GameState;
    const thiefView = createGameView(reconnected, actorId);
    const victimView = createGameView(reconnected, victimId);
    const observerView = createGameView(reconnected, observerId);
    expect(thiefView.self.hand.map((entry) => entry.instanceId)).toContain(
      stolen.instanceId,
    );
    expect(victimView.gameLog).toContainEqual(
      expect.objectContaining({
        type: 'STOLEN_HAND_CARD_REVEALED',
        card: expect.objectContaining({ instanceId: stolen.instanceId }),
      }),
    );
    expect(observerView.gameLog).toContainEqual(
      expect.objectContaining({
        type: 'RANDOM_HAND_THEFT',
        targetPlayerId: victimId,
      }),
    );
    expect(
      observerView.gameLog.some(
        (entry) => entry.type === 'STOLEN_HAND_CARD_REVEALED',
      ),
    ).toBe(false);
    expect(JSON.stringify(observerView)).not.toContain(stolen.instanceId);
  });

  it('marks only hand Equipment with a legal replacement outcome that raises permanent power', () => {
    const current = definition('view-current-head', {
      type: CardType.EQUIPMENT,
      equipment: { slot: EquipmentSlot.HEAD, hands: 0, combatBonus: 2 },
    });
    const attachmentDefinition = definition('view-attachment', {
      type: CardType.ATTACHMENT,
      attachment: { allowedTags: [], combatBonus: 2 },
    });
    const weakReplacement = definition('view-weak-head', {
      type: CardType.EQUIPMENT,
      equipment: { slot: EquipmentSlot.HEAD, hands: 0, combatBonus: 3 },
    });
    const upgrade = definition('view-upgrade-head', {
      type: CardType.EQUIPMENT,
      equipment: { slot: EquipmentSlot.HEAD, hands: 0, combatBonus: 5 },
    });
    const restricted = definition('view-restricted-head', {
      type: CardType.EQUIPMENT,
      equipment: {
        slot: EquipmentSlot.HEAD,
        hands: 0,
        combatBonus: 9,
        restrictions: [
          {
            type: 'CLASS',
            definitionId: parseCardDefinitionId('missing-class'),
          },
        ],
      },
    });
    const currentCard = card('view-current-card', current);
    const attachment = card('view-attachment-card', attachmentDefinition);
    const weakCard = card('view-weak-card', weakReplacement);
    const upgradeCard = card('view-upgrade-card', upgrade);
    const restrictedCard = card('view-restricted-card', restricted);
    const view = createGameView(
      state(
        [current, attachmentDefinition, weakReplacement, upgrade, restricted],
        [
          player(actorId, {
            hand: [weakCard, upgradeCard, restrictedCard],
            equipment: [currentCard],
            equipmentAttachments: [
              { card: attachment, attachedToCardId: currentCard.instanceId },
            ],
          }),
        ],
      ),
      actorId,
    );
    expect(
      Object.fromEntries(
        view.self.hand.map((entry) => [
          entry.instanceId,
          entry.permanentCombatUpgrade,
        ]),
      ),
    ).toEqual({
      [weakCard.instanceId]: false,
      [upgradeCard.instanceId]: true,
      [restrictedCard.instanceId]: false,
    });
    expect(view.availableIntents).toContainEqual(
      expect.objectContaining({
        kind: 'EQUIP_ITEM',
        cardId: upgradeCard.instanceId,
        replaceCardIds: [currentCard.instanceId],
        permanentCombatPowerIncrease: 1,
      }),
    );
  });

  it('projects mandatory post-Door progression and never offers a draw-only ambush as a hand play', () => {
    const sale = definition('view-sale', { goldValue: 1000, sellable: true });
    const ambush = definition('view-ambush', {
      deck: DeckType.DOOR,
      effects: [{ type: 'AMBUSH_MONSTERS', count: 2 }],
      play: {
        timings: [CardPlayTiming.WHEN_DRAWN],
        target: CardPlayTarget.SELF,
      },
    });
    const saleCard = card('view-sale-card', sale);
    const ambushCard = card('view-ambush-card', ambush);
    const postDoor = state(
      [sale, ambush],
      [player(actorId, { hand: [saleCard, ambushCard] })],
    );
    const view = createGameView(
      { ...postDoor, phase: GamePhase.POST_DOOR },
      actorId,
    );
    expect(
      view.availableIntents.some((intent) => intent.kind === 'END_TURN'),
    ).toBe(false);
    expect(
      view.availableIntents.some((intent) => intent.kind === 'SELL_ITEMS'),
    ).toBe(false);
    expect(
      view.availableIntents.some(
        (intent) =>
          intent.kind === 'PLAY_CARD' &&
          intent.cardId === ambushCard.instanceId,
      ),
    ).toBe(false);
  });
});
