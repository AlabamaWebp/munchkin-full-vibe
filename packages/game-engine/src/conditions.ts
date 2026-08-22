import type {
  CardDefinition,
  ConditionDefinition,
  ConditionalModifierDefinition,
  CurseSeverity,
  EquipmentTag,
} from "./cards.js";
import type { GameState, PlayerState } from "./game-state.js";
import { getCardDefinition } from "./equipment.js";

export interface ConditionContext {
  readonly state: GameState;
  readonly player: PlayerState;
  readonly monster?: CardDefinition;
  readonly card?: CardDefinition;
  readonly curse?: CardDefinition;
  readonly combatSidePlayerIds?: readonly import("./identifiers.js").PlayerId[];
}

function hasEquipmentTags(
  state: GameState,
  player: PlayerState,
  tags: readonly EquipmentTag[],
): number {
  return player.equipment.filter((card) =>
    getCardDefinition(state, card).tags.some((tag) =>
      tags.includes(tag as EquipmentTag),
    ),
  ).length;
}

export function evaluateCondition(
  condition: ConditionDefinition,
  context: ConditionContext,
): boolean {
  switch (condition.type) {
    case "PLAYER_HAS_CLASS":
      return context.player.classCards.some((card) =>
        condition.anyOf.includes(card.definitionId),
      );
    case "PLAYER_HAS_RACE":
      return context.player.raceCards.some((card) =>
        condition.anyOf.includes(card.definitionId),
      );
    case "PLAYER_SEX_IS":
      return context.player.sex === condition.sex;
    case "MONSTER_HAS_TAG":
      return condition.anyOf.some(
        (tag) => context.monster?.tags.includes(tag) ?? false,
      );
    case "EQUIPPED_HAS_TAG": {
      const players =
        condition.scope === "OWNER"
          ? [context.player]
          : (context.combatSidePlayerIds ?? [context.player.id]).flatMap((id) =>
              context.state.players.filter((player) => player.id === id),
            );
      return (
        players.reduce(
          (total, player) =>
            total + hasEquipmentTags(context.state, player, condition.anyOf),
          0,
        ) >= condition.atLeast
      );
    }
    case "CARD_DEFINITION_IS":
      return (
        context.card !== undefined && condition.anyOf.includes(context.card.id)
      );
    case "CURSE_MATCHES": {
      const curse = context.curse;
      if (curse?.curse === undefined) return false;
      const severityMatches =
        condition.severities === undefined ||
        condition.severities.includes(curse.curse.severity as CurseSeverity);
      const tagMatches =
        condition.anyTag === undefined ||
        curse.tags.some((tag) =>
          condition.anyTag!.includes(tag as import("./cards.js").CurseTag),
        );
      return severityMatches && tagMatches;
    }
  }
}

export function evaluateConditions(
  conditions: readonly ConditionDefinition[],
  context: ConditionContext,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, context));
}

export function resolveConditionalModifier(
  modifier: ConditionalModifierDefinition,
  context: ConditionContext,
): number {
  if (!evaluateConditions(modifier.conditions, context)) return 0;
  if (modifier.type === "RUN_AWAY_ROLL") return modifier.amount;
  if (modifier.type === "COMBAT_POWER") {
    return modifier.maxAmount === undefined
      ? modifier.amount
      : Math.min(modifier.amount, modifier.maxAmount);
  }
  if (modifier.type === "EQUIPMENT_TAG_BONUS") {
    const matched = hasEquipmentTags(
      context.state,
      context.player,
      modifier.tags,
    );
    return Math.min(matched, modifier.maxCards) * modifier.amountPerCard;
  }
  return 0;
}
