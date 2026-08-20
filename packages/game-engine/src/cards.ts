import type { CardDefinitionId, CardInstanceId } from "./identifiers.js";

export const CardType = {
  MONSTER: "MONSTER",
  CURSE: "CURSE",
  EQUIPMENT: "EQUIPMENT",
  TEMPORARY_BONUS: "TEMPORARY_BONUS",
  MONSTER_MODIFIER: "MONSTER_MODIFIER",
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

export interface EquipmentDefinition {
  readonly slot: EquipmentSlot;
  readonly hands?: 1 | 2;
  readonly value?: number;
  readonly requiredClass?: CardDefinitionId;
  readonly requiredRace?: CardDefinitionId;
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
      "LOSE_LEVEL" | "DISCARD_RANDOM_CARDS" | "DISCARD_ROLE" | "DEATH";
  }
>;

export interface CardDefinition {
  readonly id: CardDefinitionId;
  readonly name: string;
  readonly description: string;
  readonly type: CardType;
  readonly deck: DeckType;
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
