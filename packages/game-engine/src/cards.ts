import type { CardDefinitionId, CardInstanceId } from "./identifiers.js";

export const CardType = {
  MONSTER: "MONSTER",
  CURSE: "CURSE",
  COMBAT_CURSE: "COMBAT_CURSE",
  EQUIPMENT: "EQUIPMENT",
  TEMPORARY_BONUS: "TEMPORARY_BONUS",
  MONSTER_MODIFIER: "MONSTER_MODIFIER",
  ADD_MONSTER: "ADD_MONSTER",
  CLONE_MONSTER: "CLONE_MONSTER",
  OTHER: "OTHER",
  CLASS: "CLASS",
  RACE: "RACE",
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

export const CardPlayTiming = {
  TURN: "TURN",
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
  MONSTER_ENCOUNTER: "MONSTER_ENCOUNTER",
  HAND_MONSTER: "HAND_MONSTER",
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
  /** @deprecated Gold value belongs to CardDefinition.goldValue. */
  readonly value?: number;
  /** @deprecated Use the typed restrictions array. */
  readonly requiredClass?: CardDefinitionId;
  /** @deprecated Use the typed restrictions array. */
  readonly requiredRace?: CardDefinitionId;
}

export interface CardPlayDefinition {
  readonly timings: readonly CardPlayTiming[];
  readonly target: CardPlayTarget;
}

export type CardEffect =
  | {
      readonly type: "COMBAT_BONUS";
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
  readonly artKey?: string;
  readonly name: string;
  readonly description: string;
  readonly type: CardType;
  readonly deck: DeckType;
  /** Required by the production catalog for every Treasure definition. */
  readonly goldValue?: number;
  /** Explicit when timing or target is not inherent in the card type. */
  readonly play?: CardPlayDefinition;
  readonly effects: readonly CardEffect[];
  readonly equipment?: EquipmentDefinition;
  readonly monster?: {
    readonly level: number;
    readonly levelRewards: number;
    readonly treasureRewards: number;
    readonly badStuff: readonly BadStuffEffect[];
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
