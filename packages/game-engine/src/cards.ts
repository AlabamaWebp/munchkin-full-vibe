import type { CardDefinitionId, CardInstanceId } from "./identifiers.js";

export const GameMode = {
  BALANCED: "BALANCED",
  CLASSIC_CHAOS: "CLASSIC_CHAOS",
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

export const PlayerSex = { MALE: "MALE", FEMALE: "FEMALE" } as const;
export type PlayerSex = (typeof PlayerSex)[keyof typeof PlayerSex];

export const CardSetId = {
  CORE: "CORE",
  COMPANIONS: "COMPANIONS",
  ARSENAL: "ARSENAL",
  DUAL_IDENTITY: "DUAL_IDENTITY",
  CLASSIC_FANTASY: "CLASSIC_FANTASY",
  CLERICAL_ERRORS: "CLERICAL_ERRORS",
  STEED_HIRELINGS: "STEED_HIRELINGS",
} as const;
export type CardSetId = (typeof CardSetId)[keyof typeof CardSetId];
export type CardTier = 1 | 2 | 3;

export type MonsterTag = "BEAST" | "CONSTRUCT" | "ARCANE" | "UNDEAD";
export type EquipmentTag = "WEAPON" | "ARMOR" | "BLADE" | "BLUNT" | "MAGIC";
export type CurseTag = "HEX" | "TRAP";
export type CardTag = MonsterTag | EquipmentTag | CurseTag;
export type CurseSeverity = "EARLY" | "MID" | "LATE";

export const CardType = {
  MONSTER: "MONSTER",
  CURSE: "CURSE",
  COMBAT_CURSE: "COMBAT_CURSE",
  EQUIPMENT: "EQUIPMENT",
  TEMPORARY_BONUS: "TEMPORARY_BONUS",
  MONSTER_MODIFIER: "MONSTER_MODIFIER",
  ADD_MONSTER: "ADD_MONSTER",
  CLONE_MONSTER: "CLONE_MONSTER",
  UTILITY: "UTILITY",
  CLASS: "CLASS",
  RACE: "RACE",
  HIRELING: "HIRELING",
  MOUNT: "MOUNT",
  ROLE_PERMISSION: "ROLE_PERMISSION",
  ATTACHMENT: "ATTACHMENT",
} as const;

export type CardType = (typeof CardType)[keyof typeof CardType];

export const DeckType = {
  DOOR: "DOOR",
  TREASURE: "TREASURE",
} as const;

export type DeckType = (typeof DeckType)[keyof typeof DeckType];

export const EquipmentSlot = {
  HEAD: "HEAD",
  BODY: "BODY",
  FEET: "FEET",
  HANDS: "HANDS",
} as const;

export type EquipmentSlot = (typeof EquipmentSlot)[keyof typeof EquipmentSlot];

export type CapacityType = "HEAD" | "HANDS" | "HIRELING" | "MOUNT";

export interface CapacityModifierDefinition {
  readonly capacity: CapacityType;
  readonly amount: number;
}

export const CardPlayTiming = {
  TURN: "TURN",
  POST_DOOR: "POST_DOOR",
  ACTIVE_COMBAT: "ACTIVE_COMBAT",
  VICTORY_REACTION: "VICTORY_REACTION",
  WHEN_DRAWN: "WHEN_DRAWN",
} as const;

export type CardPlayTiming =
  (typeof CardPlayTiming)[keyof typeof CardPlayTiming];

export const CardPlayTarget = {
  SELF: "SELF",
  ANY_PLAYER: "ANY_PLAYER",
  COMBAT_PLAYERS: "COMBAT_PLAYERS",
  COMBAT_PLAYER: "COMBAT_PLAYER",
  COMBAT_SIDE: "COMBAT_SIDE",
  MONSTER_ENCOUNTER: "MONSTER_ENCOUNTER",
  HAND_MONSTER: "HAND_MONSTER",
  EQUIPMENT: "EQUIPMENT",
} as const;

export type CardPlayTarget =
  (typeof CardPlayTarget)[keyof typeof CardPlayTarget];

export type EquipmentRestrictionDefinition =
  | {
      readonly type: "CLASS";
      readonly definitionId: CardDefinitionId;
    }
  | {
      readonly type: "RACE";
      readonly definitionId: CardDefinitionId;
    };

export interface EquipmentDefinition {
  readonly slot: EquipmentSlot;
  /** Zero for worn items, one or two for weapons held in the Hands slot. */
  readonly hands?: 0 | 1 | 2;
  readonly combatBonus?: number;
  readonly restrictions?: readonly EquipmentRestrictionDefinition[];
  readonly modifier?: ConditionalModifierDefinition;
}

export type ConditionDefinition =
  | {
      readonly type: "PLAYER_HAS_CLASS";
      readonly anyOf: readonly CardDefinitionId[];
    }
  | {
      readonly type: "PLAYER_HAS_RACE";
      readonly anyOf: readonly CardDefinitionId[];
    }
  | { readonly type: "PLAYER_SEX_IS"; readonly sex: PlayerSex }
  | { readonly type: "MONSTER_HAS_TAG"; readonly anyOf: readonly MonsterTag[] }
  | {
      readonly type: "EQUIPPED_HAS_TAG";
      readonly anyOf: readonly EquipmentTag[];
      readonly atLeast: number;
      readonly scope: "OWNER" | "COMBAT_SIDE";
    }
  | {
      readonly type: "CARD_DEFINITION_IS";
      readonly anyOf: readonly CardDefinitionId[];
    }
  | {
      readonly type: "CURSE_MATCHES";
      readonly severities?: readonly CurseSeverity[];
      readonly anyTag?: readonly CurseTag[];
    };

export type ConditionalModifierDefinition =
  | {
      readonly type: "COMBAT_POWER";
      readonly amount: number;
      readonly maxAmount?: number;
      readonly conditions: readonly ConditionDefinition[];
    }
  | {
      readonly type: "EQUIPMENT_TAG_BONUS";
      readonly amountPerCard: number;
      readonly maxCards: number;
      readonly tags: readonly EquipmentTag[];
      readonly conditions: readonly ConditionDefinition[];
    }
  | {
      readonly type: "RUN_AWAY_ROLL";
      readonly amount: number;
      readonly conditions: readonly ConditionDefinition[];
    }
  | {
      readonly type: "AUTOMATIC_PROTECTION";
      readonly protection: "CANCEL" | "PROTECT_ONE_ITEM" | "IGNORE_BAD_STUFF";
      readonly conditions: readonly ConditionDefinition[];
    };

export interface CardPlayDefinition {
  readonly timings: readonly CardPlayTiming[];
  readonly target: CardPlayTarget;
}

export interface RoleAbilityCostDefinition {
  readonly type: "DISCARD_HAND";
  readonly count: number;
}

export type RoleActiveAbilityDefinition =
  | {
      readonly type: "COMBAT_BONUS";
      readonly amount: number;
      readonly target: "PLAYERS";
      readonly cost: RoleAbilityCostDefinition;
      readonly usage: "ONCE_PER_COMBAT";
    }
  | {
      readonly type: "RUN_AWAY_BONUS";
      readonly amount: number;
      readonly target: "SELF";
      readonly cost: RoleAbilityCostDefinition;
      readonly usage: "ONCE_PER_COMBAT";
    }
  | {
      readonly type: "DRAW_CARDS";
      readonly deck: DeckType;
      readonly count: number;
      readonly target: "SELF";
      readonly cost: RoleAbilityCostDefinition;
      readonly usage: "ONCE_PER_TURN";
    }
  | {
      readonly type: "STEAL_EQUIPPED_ITEM";
      readonly target: "EQUIPMENT";
      readonly successChance: {
        readonly numerator: number;
        readonly denominator: number;
      };
      readonly cost: RoleAbilityCostDefinition;
      readonly usage: "ONCE_PER_TURN";
    };

export type CardEffect =
  | {
      readonly type: "COMBAT_BONUS";
      readonly amount: number;
    }
  | {
      /** A temporary modifier authored as legal for either exact combat side. */
      readonly type: "COMBAT_SIDE_BONUS";
      readonly amount: number;
    }
  | {
      readonly type: "MONSTER_COMBAT_BONUS";
      readonly amount: number;
    }
  | {
      readonly type: "MODIFY_MONSTER";
      readonly strength: number;
      readonly treasures: number;
    }
  | {
      readonly type: "ADD_MONSTER_TO_COMBAT";
    }
  | {
      readonly type: "CLONE_COMBAT_MONSTER";
    }
  | {
      readonly type: "GAIN_LEVEL";
      readonly amount: number;
      readonly victoryEligible?: boolean;
    }
  | {
      readonly type: "LOSE_LEVEL";
      readonly amount: number;
    }
  | {
      readonly type: "DRAW_CARDS";
      readonly deck: DeckType;
      readonly count: number;
    }
  | {
      readonly type: "STEAL_RANDOM_HAND_CARD";
    }
  | {
      readonly type: "AMBUSH_MONSTERS";
      readonly count: 2;
    }
  | {
      readonly type: "DISCARD_RANDOM_CARDS";
      readonly count: number;
      readonly zone: "HAND" | "EQUIPMENT";
    }
  | {
      readonly type: "DISCARD_CHOSEN_CARDS";
      readonly count: number;
      readonly zone: "HAND" | "EQUIPMENT";
    }
  | {
      readonly type: "DISCARD_ROLE";
      readonly role: "CLASS" | "RACE";
    }
  | {
      readonly type: "DEATH";
    };

export type BadStuffEffect = Extract<
  CardEffect,
  {
    readonly type:
      | "LOSE_LEVEL"
      | "DISCARD_RANDOM_CARDS"
      | "DISCARD_CHOSEN_CARDS"
      | "DISCARD_ROLE"
      | "DEATH";
  }
>;

export interface CardDefinition {
  readonly id: CardDefinitionId;
  /** Stable key for future illustration assets; unique within a card set. */
  readonly artKey: string;
  readonly setId: CardSetId;
  readonly tier: CardTier;
  readonly name: string;
  readonly description: string;
  readonly type: CardType;
  readonly deck: DeckType;
  readonly tags: readonly CardTag[];
  readonly goldValue?: number;
  readonly sellable?: boolean;
  readonly tradeable?: boolean;
  readonly starterEligible?: boolean;
  readonly scavengeEligible?: boolean;
  /** Removes option-specific physical copies before the match starts. */
  readonly requiredGameOption?: "DOUBLE_MONSTER_AMBUSH";
  /** Explicit when timing or target is not inherent in the card type. */
  readonly play?: CardPlayDefinition;
  readonly effects: readonly CardEffect[];
  /** Capacity granted while this card is in one of the owner's public zones. */
  readonly capacityModifiers?: readonly CapacityModifierDefinition[];
  readonly equipment?: EquipmentDefinition;
  readonly monster?: {
    readonly strength: number;
    readonly levelRewards: 1 | 2;
    readonly treasureRewards: number;
    readonly badStuffTarget?: "FAILED_COMBATANT" | "ALL_COMBATANTS";
    readonly badStuff: readonly BadStuffEffect[];
    readonly modifiers?: readonly ConditionalModifierDefinition[];
  };
  readonly curse?: { readonly severity: CurseSeverity };
  /** A target-only response played from hand while a Curse is pending. */
  readonly curseProtection?: {
    readonly mode: "CANCEL" | "PROTECT_ONE_ITEM";
    readonly conditions?: readonly ConditionDefinition[];
  };
  readonly role?: {
    readonly role: "CLASS" | "RACE";
    readonly modifier?: ConditionalModifierDefinition;
    readonly activeAbility?: RoleActiveAbilityDefinition;
  };
  readonly companion?: {
    readonly kind: "HIRELING" | "MOUNT";
    readonly combatBonus: number;
    readonly modifier?: ConditionalModifierDefinition;
  };
  readonly rolePermission?: {
    readonly role: "CLASS" | "RACE";
    readonly additionalSlots: 1;
  };
  readonly attachment?: {
    readonly allowedTags: readonly EquipmentTag[];
    readonly allowedDefinitionIds?: readonly CardDefinitionId[];
    readonly combatBonus: number;
  };
}

export interface CardInstance {
  readonly instanceId: CardInstanceId;
  readonly definitionId: CardDefinitionId;
}

export interface CardSet {
  readonly definitions: readonly CardDefinition[];
  readonly doorDeck: readonly CardInstance[];
  readonly treasureDeck: readonly CardInstance[];
}

export interface CardCatalogEntry {
  readonly definition: CardDefinition;
  readonly copies: number;
}
