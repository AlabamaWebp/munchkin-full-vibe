import {
  CardType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
} from "./cards.js";
import { GamePhase, type GameState, type PlayerState } from "./game-state.js";
import type { CardInstanceId, PlayerId } from "./identifiers.js";

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

export function calculateCombatPower(
  state: GameState,
  playerId: PlayerId,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    throw new TypeError(`Player ${playerId} is missing from the game.`);
  }
  return (
    player.level +
    equipmentCombatBonus(state, player) +
    player.temporaryCombatBonus
  );
}

export function calculateMonsterPower(state: GameState): number {
  if (state.combat === null) {
    throw new TypeError("Monster power requires an active combat.");
  }
  return state.combat.monsters.reduce(
    (total, monster) =>
      total + Math.max(1, monster.baseStrength + monster.strengthModifier),
    0,
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
    state.combat.helperId === null
      ? 0
      : calculateCombatPower(state, state.combat.helperId);
  return calculateCombatPower(state, state.combat.playerId) + helperPower;
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
    (classRestriction !== undefined &&
      player.classCard?.definitionId !== classRestriction.definitionId) ||
    (equipment.requiredClass !== undefined &&
      player.classCard?.definitionId !== equipment.requiredClass)
  )
    return "CLASS_REQUIRED";
  if (
    (raceRestriction !== undefined &&
      player.raceCard?.definitionId !== raceRestriction.definitionId) ||
    (equipment.requiredRace !== undefined &&
      player.raceCard?.definitionId !== equipment.requiredRace)
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
