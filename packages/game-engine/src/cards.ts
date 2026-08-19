import type { CardDefinitionId, CardInstanceId } from "./identifiers.js";

export const CardType = {
  MONSTER: "MONSTER",
  CURSE: "CURSE",
  EQUIPMENT: "EQUIPMENT",
  TEMPORARY_BONUS: "TEMPORARY_BONUS",
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

export type CardEffect =
  | {
      readonly type: "COMBAT_BONUS";
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
    };

export interface CardDefinition {
  readonly id: CardDefinitionId;
  readonly name: string;
  readonly description: string;
  readonly type: CardType;
  readonly deck: DeckType;
  readonly effects: readonly CardEffect[];
  readonly monster?: {
    readonly level: number;
    readonly treasureRewards: number;
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
