import { describe, expect, it } from "vitest";
import { CardType, DeckType, type CardDefinition } from "./cards.js";
import type { GameCommand } from "./commands.js";
import { COMBAT_REACTION_TIMEOUT_MS } from "./engine.js";
import { executeCommand } from "./legacy-test-command.js";
import { GamePhase, GameStatus, type GameState } from "./game-state.js";
import {
  parseCardDefinitionId,
  parseCardInstanceId,
  parseEncounterId,
  parseGameId,
  parseHelpOfferId,
  parsePlayerId,
} from "./identifiers.js";
import type { RandomSource } from "./random-source.js";

const random: RandomSource = { nextInt: () => 0 };
const heroId = parsePlayerId("hero");
const firstResponderId = parsePlayerId("first-responder");
const secondResponderId = parsePlayerId("second-responder");
const encounterId = parseEncounterId("encounter-1");

const definitionIds = {
  monster: parseCardDefinitionId("reaction-monster"),
  extraMonster: parseCardDefinitionId("reaction-extra-monster"),
  curse: parseCardDefinitionId("reaction-curse"),
  combatCurse: parseCardDefinitionId("reaction-combat-curse"),
  playerBonus: parseCardDefinitionId("reaction-player-bonus"),
  monsterBonus: parseCardDefinitionId("reaction-monster-bonus"),
  addMonster: parseCardDefinitionId("reaction-add-monster"),
  cloneMonster: parseCardDefinitionId("reaction-clone-monster"),
  strengthen: parseCardDefinitionId("reaction-strengthen"),
  weaken: parseCardDefinitionId("reaction-weaken"),
} as const;

const cards = {
  monster: {
    instanceId: parseCardInstanceId("reaction-monster-1"),
    definitionId: definitionIds.monster,
  },
  extraMonster: {
    instanceId: parseCardInstanceId("reaction-extra-monster-1"),
    definitionId: definitionIds.extraMonster,
  },
  curse: {
    instanceId: parseCardInstanceId("reaction-curse-1"),
    definitionId: definitionIds.curse,
  },
  combatCurse: {
    instanceId: parseCardInstanceId("reaction-combat-curse-1"),
    definitionId: definitionIds.combatCurse,
  },
  playerBonus: {
    instanceId: parseCardInstanceId("reaction-player-bonus-1"),
    definitionId: definitionIds.playerBonus,
  },
  secondPlayerBonus: {
    instanceId: parseCardInstanceId("reaction-player-bonus-2"),
    definitionId: definitionIds.playerBonus,
  },
  monsterBonus: {
    instanceId: parseCardInstanceId("reaction-monster-bonus-1"),
    definitionId: definitionIds.monsterBonus,
  },
  addMonster: {
    instanceId: parseCardInstanceId("reaction-add-monster-1"),
    definitionId: definitionIds.addMonster,
  },
  cloneMonster: {
    instanceId: parseCardInstanceId("reaction-clone-monster-1"),
    definitionId: definitionIds.cloneMonster,
  },
  strengthen: {
    instanceId: parseCardInstanceId("reaction-strengthen-1"),
    definitionId: definitionIds.strengthen,
  },
  weaken: {
    instanceId: parseCardInstanceId("reaction-weaken-1"),
    definitionId: definitionIds.weaken,
  },
} as const;

const definitions: readonly CardDefinition[] = [
  {
    id: definitionIds.monster,
    name: "Reaction Monster",
    description: "The original combat Monster.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: {
      strength: 5,
      levelRewards: 1,
      treasureRewards: 0,
      badStuff: [],
    },
  },
  {
    id: definitionIds.extraMonster,
    name: "Extra Reaction Monster",
    description: "A second Monster for reaction tests.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: {
      strength: 2,
      levelRewards: 1,
      treasureRewards: 0,
      badStuff: [],
    },
  },
  {
    id: definitionIds.curse,
    name: "Anytime Curse",
    description: "Lowers the target's level.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    effects: [{ type: "LOSE_LEVEL", amount: 1 }],
  },
  {
    id: definitionIds.combatCurse,
    name: "Combat Curse",
    description: "Reduces one combat participant's power.",
    type: CardType.COMBAT_CURSE,
    deck: DeckType.DOOR,
    effects: [{ type: "COMBAT_BONUS", amount: -2 }],
  },
  {
    id: definitionIds.playerBonus,
    name: "Player Side Bonus",
    description: "Strengthens the player side.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 4 }],
  },
  {
    id: definitionIds.monsterBonus,
    name: "Monster Side Bonus",
    description: "Strengthens one Monster temporarily.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "MONSTER_COMBAT_BONUS", amount: 2 }],
  },
  {
    id: definitionIds.addMonster,
    name: "Add Monster",
    description: "Adds a selected hand Monster.",
    type: CardType.ADD_MONSTER,
    deck: DeckType.DOOR,
    effects: [{ type: "ADD_MONSTER_TO_COMBAT" }],
  },
  {
    id: definitionIds.cloneMonster,
    name: "Clone Monster",
    description: "Clones a selected combat Monster.",
    type: CardType.CLONE_MONSTER,
    deck: DeckType.TREASURE,
    effects: [{ type: "CLONE_COMBAT_MONSTER" }],
  },
  {
    id: definitionIds.strengthen,
    name: "Strengthen Monster",
    description: "Strengthens a selected combat Monster.",
    type: CardType.MONSTER_MODIFIER,
    deck: DeckType.TREASURE,
    effects: [{ type: "MODIFY_MONSTER", strength: 3, treasures: 1 }],
  },
  {
    id: definitionIds.weaken,
    name: "Weaken Monster",
    description: "Weakens a selected combat Monster.",
    type: CardType.MONSTER_MODIFIER,
    deck: DeckType.TREASURE,
    effects: [{ type: "MODIFY_MONSTER", strength: -3, treasures: -1 }],
  },
];

function player(
  id: typeof heroId,
  level: number,
  hand: GameState["players"][number]["hand"],
): GameState["players"][number] {
  return {
    id,
    name: id,
    sex: "MALE",
    level,
    hand,
    equipment: [],
    equipmentAttachments: [],
    classCards: [],
    raceCards: [],
    rolePermissionCards: [],
    hirelingCard: null,
    mountCard: null,
    isDead: false,
    activeEffects: [],
  };
}

function combatState(options?: {
  readonly heroLevel?: number;
  readonly players?: readonly GameState["players"][number][];
  readonly helperId?: typeof firstResponderId | null;
}): GameState {
  const players = options?.players ?? [
    player(heroId, options?.heroLevel ?? 8, []),
    player(firstResponderId, 1, [cards.secondPlayerBonus]),
    player(secondResponderId, 1, [
      cards.curse,
      cards.combatCurse,
      cards.playerBonus,
      cards.monsterBonus,
      cards.extraMonster,
      cards.addMonster,
      cards.cloneMonster,
      cards.strengthen,
      cards.weaken,
    ]),
  ];
  return {
    schemaVersion: 5,
    config: { mode: "CLASSIC_CHAOS", enabledSetIds: ["CORE"] },
    id: parseGameId("combat-reaction"),
    status: GameStatus.IN_PROGRESS,
    phase: GamePhase.DOOR_RESOLUTION,
    players,
    activePlayerId: heroId,
    cardDefinitions: definitions,
    doorDeck: [],
    treasureDeck: [],
    doorDiscard: [],
    treasureDiscard: [],
    combat: {
      playerId: heroId,
      revision: 1,
      monsters: [
        {
          encounterId,
          monster: cards.monster,
          sourceCard: cards.monster,
          clonedFromEncounterId: null,
          baseStrength: 5,
          baseLevelRewards: 1,
          baseTreasureRewards: 0,
          tier: 1,
          tags: [],
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
      helpAgreement:
        options?.helperId == null
          ? null
          : {
              helperId: options.helperId,
              promisedTreasures: 0,
              acceptedOfferId: parseHelpOfferId("accepted-offer"),
              agreedAtCombatRevision: 1,
            },
      history: [],
      runAway: null,
    },
    lastRunAwayResult: null,
    pendingDecision: null,
    nextPendingDecisionSequence: 1,
    eventLog: [],
    turnNumber: 1,
    winnerId: null,
  };
}

function declare(state: GameState) {
  return executeCommand(
    state,
    {
      type: "DECLARE_COMBAT_VICTORY",
      actorId: heroId,
      combatRevision: state.combat!.revision,
    },
    { random },
  );
}

describe("combat victory reaction window", () => {
  it("gives declared and recreated windows a fresh two-minute authoritative deadline", () => {
    let now = 1_000;
    const context = { random, clock: { now: () => now } };
    const declared = executeCommand(
      combatState(),
      {
        type: "DECLARE_COMBAT_VICTORY",
        actorId: heroId,
        combatRevision: 1,
      },
      context,
    );
    expect(declared.success).toBe(true);
    if (!declared.success) throw new Error(declared.error.message);
    expect(declared.state.combat?.reactionWindow?.expiresAtEpochMs).toBe(
      now + COMBAT_REACTION_TIMEOUT_MS,
    );

    now = 9_000;
    const intervened = executeCommand(
      declared.state,
      {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.monsterBonus.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        reactionWindowId: 1,
      },
      context,
    );
    expect(intervened.success).toBe(true);
    if (!intervened.success) throw new Error(intervened.error.message);
    expect(intervened.state.combat?.reactionWindow).toMatchObject({
      windowId: 2,
      declaredAtRevision: 2,
      expiresAtEpochMs: now + COMBAT_REACTION_TIMEOUT_MS,
    });
  });

  it("persists the claimant confirmation and waits for every other player", () => {
    const declared = declare(combatState());
    expect(declared).toMatchObject({
      success: true,
      state: {
        combat: {
          reactionWindow: {
            windowId: 1,
            claimantId: heroId,
            confirmedPlayerIds: [heroId],
          },
        },
      },
      events: [{ type: "COMBAT_VICTORY_DECLARED" }],
    });
    if (!declared.success) throw new Error(declared.error.message);
    expect(declare(declared.state)).toMatchObject({
      success: false,
      state: declared.state,
      error: { code: "REACTION_WINDOW_ACTIVE" },
    });
    expect(JSON.parse(JSON.stringify(declared.state))).toMatchObject({
      combat: { reactionWindow: { confirmedPlayerIds: [heroId] } },
    });

    const firstPass = executeCommand(
      declared.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: firstResponderId,
        reactionWindowId: 1,
      },
      { random },
    );
    expect(firstPass).toMatchObject({
      success: true,
      state: {
        combat: {
          reactionWindow: {
            confirmedPlayerIds: [heroId, firstResponderId],
          },
        },
      },
    });
    if (!firstPass.success) throw new Error(firstPass.error.message);
    expect(
      executeCommand(
        firstPass.state,
        {
          type: "PASS_COMBAT_REACTION",
          actorId: firstResponderId,
          reactionWindowId: 1,
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      state: firstPass.state,
      error: { code: "REACTION_ALREADY_CONFIRMED" },
    });
  });

  it("rechecks and resolves atomically on the final confirmation", () => {
    const declared = declare(combatState());
    if (!declared.success) throw new Error(declared.error.message);
    const firstPass = executeCommand(
      declared.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: firstResponderId,
        reactionWindowId: 1,
      },
      { random },
    );
    if (!firstPass.success) throw new Error(firstPass.error.message);
    const finalPass = executeCommand(
      firstPass.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: secondResponderId,
        reactionWindowId: 1,
      },
      { random },
    );
    expect(finalPass).toMatchObject({
      success: true,
      state: {
        phase: GamePhase.END_TURN,
        combat: null,
      },
    });
    if (!finalPass.success) throw new Error(finalPass.error.message);
    expect(finalPass.state.players[0]).toMatchObject({ id: heroId, level: 9 });
    expect(finalPass.events.map((event) => event.type)).toEqual([
      "COMBAT_REACTION_PASSED",
      "COMBAT_WON",
      "LEVEL_GAINED",
      "TREASURE_GAINED",
      "COMBAT_REWARD_CARDS",
    ]);
    expect(
      executeCommand(
        finalPass.state,
        {
          type: "PASS_COMBAT_REACTION",
          actorId: secondResponderId,
          reactionWindowId: 1,
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      error: { code: "STALE_COMBAT_STATE" },
    });
  });

  it("resolves a winning solo combat in the declaration command", () => {
    const state = combatState({ players: [player(heroId, 8, [])] });
    const result = declare(state);
    expect(result).toMatchObject({
      success: true,
      state: { phase: GamePhase.END_TURN, combat: null },
    });
    if (result.success) {
      expect(result.events.map((event) => event.type)).toEqual([
        "COMBAT_VICTORY_DECLARED",
        "COMBAT_WON",
        "LEVEL_GAINED",
        "TREASURE_GAINED",
        "COMBAT_REWARD_CARDS",
      ]);
    }
  });

  it("blocks unrelated commands and prevents a confirmed player from intervening", () => {
    const declared = declare(combatState());
    if (!declared.success) throw new Error(declared.error.message);
    expect(
      executeCommand(
        declared.state,
        { type: "END_TURN", actorId: heroId },
        { random },
      ),
    ).toMatchObject({
      success: false,
      error: { code: "REACTION_WINDOW_ACTIVE" },
    });
    const passed = executeCommand(
      declared.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: firstResponderId,
        reactionWindowId: 1,
      },
      { random },
    );
    if (!passed.success) throw new Error(passed.error.message);
    expect(
      executeCommand(
        passed.state,
        {
          type: "PLAY_CARD",
          actorId: firstResponderId,
          cardId: cards.secondPlayerBonus.instanceId,
          target: { type: "COMBAT", side: "PLAYERS" },
          reactionWindowId: 1,
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      state: passed.state,
      error: { code: "REACTION_ALREADY_CONFIRMED" },
    });
  });

  it("resets confirmations with a new id after an intervention that preserves the lead", () => {
    const declared = declare(combatState());
    if (!declared.success) throw new Error(declared.error.message);
    const passed = executeCommand(
      declared.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: firstResponderId,
        reactionWindowId: 1,
      },
      { random },
    );
    if (!passed.success) throw new Error(passed.error.message);
    const intervened = executeCommand(
      passed.state,
      {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.monsterBonus.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        reactionWindowId: 1,
      },
      { random },
    );
    expect(intervened).toMatchObject({
      success: true,
      state: {
        combat: {
          revision: 2,
          reactionWindow: {
            windowId: 2,
            claimantId: heroId,
            confirmedPlayerIds: [heroId],
          },
        },
      },
    });
    if (!intervened.success) throw new Error(intervened.error.message);
    expect(intervened.events.at(-1)).toMatchObject({
      type: "COMBAT_REACTIONS_RESET",
      reactionWindowId: 2,
    });
    expect(
      executeCommand(
        intervened.state,
        {
          type: "PASS_COMBAT_REACTION",
          actorId: firstResponderId,
          reactionWindowId: 1,
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      error: { code: "STALE_COMBAT_REACTION" },
    });
    expect(
      executeCommand(
        intervened.state,
        {
          type: "PLAY_CARD",
          actorId: secondResponderId,
          cardId: cards.monsterBonus.instanceId,
          target: { type: "COMBAT", side: "MONSTER", encounterId },
          reactionWindowId: 1,
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      state: intervened.state,
      error: { code: "STALE_COMBAT_REACTION" },
    });
  });

  it("cancels the declaration when an intervention removes the lead", () => {
    const declared = declare(combatState());
    if (!declared.success) throw new Error(declared.error.message);
    const intervened = executeCommand(
      declared.state,
      {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.strengthen.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        reactionWindowId: 1,
      },
      { random },
    );
    expect(intervened).toMatchObject({
      success: true,
      state: { combat: { reactionWindow: null, revision: 2 } },
    });
    if (!intervened.success) throw new Error(intervened.error.message);
    expect(intervened.events.at(-1)).toMatchObject({
      type: "COMBAT_VICTORY_CANCELLED",
    });
    expect(declare(intervened.state)).toMatchObject({
      success: false,
      error: { code: "COMBAT_NOT_WON" },
    });

    const restored = executeCommand(
      intervened.state,
      {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.playerBonus.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
      },
      { random },
    );
    if (!restored.success) throw new Error(restored.error.message);
    expect(
      executeCommand(
        restored.state,
        {
          type: "DECLARE_COMBAT_VICTORY",
          actorId: heroId,
          combatRevision: 2,
        },
        { random },
      ),
    ).toMatchObject({
      success: false,
      error: { code: "STALE_COMBAT_STATE" },
    });
    expect(declare(restored.state)).toMatchObject({ success: true });
  });

  it.each([
    {
      name: "ordinary Curse",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.curse.instanceId,
        target: { type: "PLAYER", playerId: heroId },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
    {
      name: "combat Curse",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.combatCurse.instanceId,
        target: { type: "PLAYER", playerId: heroId },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
    {
      name: "added Monster",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.addMonster.instanceId,
        target: { type: "HAND_MONSTER", cardId: cards.extraMonster.instanceId },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
    {
      name: "cloned Monster",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.cloneMonster.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
    {
      name: "Monster strengthening",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.strengthen.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
    {
      name: "Monster weakening",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.weaken.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
    {
      name: "player-side temporary bonus",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.playerBonus.instanceId,
        target: { type: "COMBAT", side: "PLAYERS" },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
    {
      name: "Monster-side temporary bonus",
      command: {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.monsterBonus.instanceId,
        target: { type: "COMBAT", side: "MONSTER", encounterId },
        reactionWindowId: 1,
      } satisfies GameCommand,
    },
  ])("allows a $name reaction", ({ command }) => {
    const initial = combatState({ heroLevel: 20 });
    const declared = declare(initial);
    if (!declared.success) throw new Error(declared.error.message);
    const result = executeCommand(declared.state, command, { random });
    expect(result).toMatchObject({
      success: true,
      state: {
        combat: {
          revision: 2,
          reactionWindow: { windowId: 2, confirmedPlayerIds: [heroId] },
        },
      },
    });
  });

  it("allows an ordinary Curse during combat before victory is declared", () => {
    const result = executeCommand(
      combatState(),
      {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.curse.instanceId,
        target: { type: "PLAYER", playerId: heroId },
      },
      { random },
    );
    expect(result).toMatchObject({
      success: true,
      state: { combat: { revision: 2 } },
    });
    if (!result.success) throw new Error(result.error.message);
    expect(result.state.players).toContainEqual(
      expect.objectContaining({ id: heroId, level: 7 }),
    );
  });

  it("limits combat Curses to the active player or accepted helper", () => {
    const initial = combatState({ helperId: firstResponderId });
    const declared = declare(initial);
    if (!declared.success) throw new Error(declared.error.message);
    const invalid = executeCommand(
      declared.state,
      {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.combatCurse.instanceId,
        target: { type: "PLAYER", playerId: secondResponderId },
        reactionWindowId: 1,
      },
      { random },
    );
    expect(invalid).toMatchObject({
      success: false,
      state: declared.state,
      error: { code: "CARD_NOT_PLAYABLE" },
    });
  });

  it("applies a combat Curse to an accepted helper and clears it with combat", () => {
    const declared = declare(combatState({ helperId: firstResponderId }));
    if (!declared.success) throw new Error(declared.error.message);
    const cursed = executeCommand(
      declared.state,
      {
        type: "PLAY_CARD",
        actorId: secondResponderId,
        cardId: cards.combatCurse.instanceId,
        target: { type: "PLAYER", playerId: firstResponderId },
        reactionWindowId: 1,
      },
      { random },
    );
    expect(cursed).toMatchObject({
      success: true,
      state: {
        combat: { reactionWindow: { windowId: 2 } },
      },
    });
    if (!cursed.success) throw new Error(cursed.error.message);
    expect(
      cursed.state.players.find((player) => player.id === firstResponderId)
        ?.activeEffects,
    ).toEqual([expect.objectContaining({ type: "COMBAT_POWER", amount: -2 })]);
    const firstPass = executeCommand(
      cursed.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: firstResponderId,
        reactionWindowId: 2,
      },
      { random },
    );
    if (!firstPass.success) throw new Error(firstPass.error.message);
    const resolved = executeCommand(
      firstPass.state,
      {
        type: "PASS_COMBAT_REACTION",
        actorId: secondResponderId,
        reactionWindowId: 2,
      },
      { random },
    );
    expect(resolved).toMatchObject({ success: true, state: { combat: null } });
    if (resolved.success) {
      expect(
        resolved.state.players
          .find((candidate) => candidate.id === firstResponderId)
          ?.activeEffects.reduce(
            (sum, effect) =>
              effect.type === "COMBAT_POWER" ? sum + effect.amount : sum,
            0,
          ),
      ).toBe(0);
    }
  });
});
