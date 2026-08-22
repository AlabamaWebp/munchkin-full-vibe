import {
  CardType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import { GamePhase, type GameState, type PlayerState } from "./game-state.js";
import type { CardInstanceId, PlayerId } from "./identifiers.js";
import { resolveConditionalModifier } from "./conditions.js";

export type EquipmentConflict = "SLOT_OCCUPIED" | "NOT_ENOUGH_FREE_HANDS";
export type EquipmentRestriction = "CLASS_REQUIRED" | "RACE_REQUIRED";

export function getCardDefinition(
  state: GameState,
  card: CardInstance,
): CardDefinition {
  const definition = state.cardDefinitions.find(
    (candidate) => candidate.id === card.definitionId,
  );
  if (definition === undefined) {
    throw new TypeError(
      `Card ${card.instanceId} references missing definition ${card.definitionId}.`,
    );
  }
  return definition;
}

export function equipmentCombatBonus(
  state: GameState,
  player: PlayerState,
): number {
  return player.equipment.reduce((total, card) => {
    const definition = getCardDefinition(state, card);
    return (
      total +
      (definition.equipment?.combatBonus ??
        definition.effects.reduce(
          (bonus, effect) =>
            effect.type === "COMBAT_BONUS" ? bonus + effect.amount : bonus,
          0,
        ))
    );
  }, 0);
}

export interface CombatPowerBreakdownLine {
  readonly source:
    | "LEVEL"
    | "EQUIPMENT"
    | "ROLE"
    | "COMPANION"
    | "ACTIVE_EFFECT"
    | "MAKESHIFT_TOOLS";
  readonly sourceDefinitionId?: import("./identifiers.js").CardDefinitionId;
  readonly amount: number;
}

function participantIds(state: GameState): readonly PlayerId[] {
  if (state.combat === null) return [];
  return [
    state.combat.playerId,
    ...(state.combat.helpAgreement === null
      ? []
      : [state.combat.helpAgreement.helperId]),
  ];
}

function passiveModifierLines(
  state: GameState,
  player: PlayerState,
): CombatPowerBreakdownLine[] {
  const monsterDefinitions = state.combat?.monsters.map((encounter) =>
    getCardDefinition(state, encounter.monster),
  ) ?? [undefined];
  const sources = [
    ...player.equipment,
    ...player.classCards,
    ...player.raceCards,
    ...(player.hirelingCard === null ? [] : [player.hirelingCard]),
    ...(player.mountCard === null ? [] : [player.mountCard]),
  ];
  const lines: CombatPowerBreakdownLine[] = [];
  for (const card of sources) {
    const definition = getCardDefinition(state, card);
    const fixed = definition.companion?.combatBonus ?? 0;
    const modifier =
      definition.equipment?.modifier ??
      definition.role?.modifier ??
      definition.companion?.modifier;
    const conditional =
      modifier === undefined
        ? 0
        : monsterDefinitions.reduce(
            (sum, monster) =>
              sum +
              resolveConditionalModifier(modifier, {
                state,
                player,
                monster,
                card: definition,
                combatSidePlayerIds: participantIds(state),
              }),
            0,
          );
    const amount = fixed + conditional;
    if (amount !== 0)
      lines.push({
        source:
          definition.equipment !== undefined
            ? "EQUIPMENT"
            : definition.role === undefined
              ? "COMPANION"
              : "ROLE",
        sourceDefinitionId: definition.id,
        amount,
      });
  }
  return lines;
}

export function permanentCombatPower(
  state: GameState,
  playerId: PlayerId,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined)
    throw new TypeError(`Player ${playerId} is missing from the game.`);
  const attachmentBonus = player.equipmentAttachments.reduce(
    (sum, attachment) => {
      const definition = getCardDefinition(state, attachment.card);
      return sum + (definition.attachment?.combatBonus ?? 0);
    },
    0,
  );
  return (
    player.level +
    equipmentCombatBonus(state, player) +
    attachmentBonus +
    passiveModifierLines(state, player).reduce(
      (sum, line) => sum + line.amount,
      0,
    )
  );
}

export function makeshiftToolsBonus(state: GameState): number {
  const combat = state.combat;
  if (
    combat === null ||
    combat.runAway !== null ||
    combat.helpAgreement !== null
  )
    return 0;
  const player = state.players.find(
    (candidate) => candidate.id === combat.playerId,
  );
  const encounter = combat.monsters[0];
  if (
    player === undefined ||
    player.isDead ||
    player.level !== 1 ||
    combat.monsters.length !== 1 ||
    encounter === undefined ||
    encounter.tier !== 1 ||
    encounter.baseStrength > 3 ||
    encounter.clonedFromEncounterId !== null ||
    encounter.sourceCard.instanceId !== encounter.monster.instanceId
  )
    return 0;
  return Math.min(2, Math.max(0, 3 - permanentCombatPower(state, player.id)));
}

export function combatPowerBreakdown(
  state: GameState,
  playerId: PlayerId,
): readonly CombatPowerBreakdownLine[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined)
    throw new TypeError(`Player ${playerId} is missing from the game.`);
  const lines: CombatPowerBreakdownLine[] = [
    { source: "LEVEL", amount: player.level },
  ];
  const equipment =
    equipmentCombatBonus(state, player) +
    player.equipmentAttachments.reduce(
      (sum, attachment) =>
        sum +
        (getCardDefinition(state, attachment.card).attachment?.combatBonus ??
          0),
      0,
    );
  if (equipment !== 0) lines.push({ source: "EQUIPMENT", amount: equipment });
  lines.push(...passiveModifierLines(state, player));
  for (const effect of player.activeEffects.filter(
    (entry) => entry.type === "COMBAT_POWER",
  ))
    lines.push({
      source: "ACTIVE_EFFECT",
      sourceDefinitionId: effect.sourceDefinitionId,
      amount: effect.amount,
    });
  if (state.combat?.playerId === playerId) {
    const makeshift = makeshiftToolsBonus(state);
    if (makeshift > 0)
      lines.push({ source: "MAKESHIFT_TOOLS", amount: makeshift });
  }
  return lines;
}

export function calculateCombatPower(
  state: GameState,
  playerId: PlayerId,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    throw new TypeError(`Player ${playerId} is missing from the game.`);
  }
  return combatPowerBreakdown(state, playerId)
    .filter((line) => line.source !== "MAKESHIFT_TOOLS")
    .reduce((total, line) => total + line.amount, 0);
}

export function calculateMonsterPower(state: GameState): number {
  if (state.combat === null) {
    throw new TypeError("Monster power requires an active combat.");
  }
  return state.combat.monsters.reduce(
    (total, monster) => total + calculateMonsterCurrentStrength(state, monster),
    0,
  );
}

export function calculateMonsterCurrentStrength(
  state: GameState,
  monster: import("./game-state.js").CombatMonsterState,
): number {
  const active = state.players.find(
    (player) => player.id === state.combat?.playerId,
  );
  const definition = getCardDefinition(state, monster.monster);
  const conditional =
    active === undefined
      ? 0
      : (definition.monster?.modifiers ?? []).reduce(
          (sum, modifier) =>
            sum +
            resolveConditionalModifier(modifier, {
              state,
              player: active,
              monster: definition,
              card: definition,
              combatSidePlayerIds: participantIds(state),
            }),
          0,
        );
  return Math.max(
    1,
    monster.baseStrength + monster.strengthModifier + conditional,
  );
}

export function calculateMonsterStrength(
  monster: import("./game-state.js").CombatMonsterState,
): number {
  return Math.max(1, monster.baseStrength + monster.strengthModifier);
}

export function calculateMonsterTreasures(
  monster: import("./game-state.js").CombatMonsterState,
): number {
  return Math.max(0, monster.baseTreasureRewards + monster.treasureModifier);
}

export function calculateCombatSidePower(state: GameState): number {
  if (state.combat === null) {
    throw new TypeError("Combat side power requires an active combat.");
  }
  const helperPower =
    state.combat.helpAgreement == null
      ? 0
      : calculateCombatPower(state, state.combat.helpAgreement.helperId);
  return (
    calculateCombatPower(state, state.combat.playerId) +
    helperPower +
    makeshiftToolsBonus(state)
  );
}

export function equipmentConflict(
  state: GameState,
  player: PlayerState,
  candidate: CardDefinition,
): EquipmentConflict | null {
  const equipment = candidate.equipment;
  if (candidate.type !== CardType.EQUIPMENT || equipment === undefined)
    return null;

  if (equipment.slot !== EquipmentSlot.HANDS) {
    const occupied = player.equipment.some(
      (card) =>
        getCardDefinition(state, card).equipment?.slot === equipment.slot,
    );
    return occupied ? "SLOT_OCCUPIED" : null;
  }

  const usedHands = player.equipment.reduce((total, card) => {
    const equipped = getCardDefinition(state, card).equipment;
    return equipped?.slot === EquipmentSlot.HANDS
      ? total + (equipped.hands ?? 1)
      : total;
  }, 0);
  return usedHands + (equipment.hands ?? 1) > 2
    ? "NOT_ENOUGH_FREE_HANDS"
    : null;
}

export function equipmentRestriction(
  player: PlayerState,
  candidate: CardDefinition,
): EquipmentRestriction | null {
  const equipment = candidate.equipment;
  if (equipment === undefined) return null;
  const classRestriction = equipment.restrictions?.find(
    (restriction) => restriction.type === "CLASS",
  );
  const raceRestriction = equipment.restrictions?.find(
    (restriction) => restriction.type === "RACE",
  );
  if (
    classRestriction !== undefined &&
    !player.classCards.some(
      (card) => card.definitionId === classRestriction.definitionId,
    )
  )
    return "CLASS_REQUIRED";
  if (
    raceRestriction !== undefined &&
    !player.raceCards.some(
      (card) => card.definitionId === raceRestriction.definitionId,
    )
  )
    return "RACE_REQUIRED";
  return null;
}

export function canChangeEquipment(
  state: GameState,
  playerId: PlayerId,
): boolean {
  return (
    state.activePlayerId === playerId &&
    state.pendingDecision === null &&
    state.combat === null &&
    (state.phase === GamePhase.TURN_START ||
      state.phase === GamePhase.POST_DOOR ||
      state.phase === GamePhase.END_TURN)
  );
}

export function canEquipItem(
  state: GameState,
  playerId: PlayerId,
  cardId: CardInstanceId,
): boolean {
  if (!canChangeEquipment(state, playerId)) return false;
  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.hand.find(
    (candidate) => candidate.instanceId === cardId,
  );
  if (player === undefined || card === undefined) return false;
  const definition = getCardDefinition(state, card);
  return (
    definition.type === CardType.EQUIPMENT &&
    definition.equipment !== undefined &&
    equipmentRestriction(player, definition) === null &&
    equipmentConflict(state, player, definition) === null
  );
}

export function canUnequipItem(
  state: GameState,
  playerId: PlayerId,
  cardId: CardInstanceId,
): boolean {
  if (!canChangeEquipment(state, playerId)) return false;
  return (
    state.players
      .find((candidate) => candidate.id === playerId)
      ?.equipment.some((card) => card.instanceId === cardId) ?? false
  );
}
