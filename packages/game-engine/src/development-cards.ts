import {
  CardType,
  DeckType,
  type CardDefinition,
  type CardInstance,
  type CardSet,
} from "./cards.js";
import { parseCardDefinitionId, parseCardInstanceId } from "./identifiers.js";

type DefinitionInput = Omit<CardDefinition, "id"> & { readonly id: string };

const definitionInputs: readonly DefinitionInput[] = [
  {
    id: "dust-bunny-brigade",
    name: "Dust Bunny Brigade",
    description: "A surprisingly organized threat from beneath the sofa.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level: 1, treasureRewards: 1 },
  },
  {
    id: "corridor-crab",
    name: "Corridor Crab",
    description: "It has claimed the hallway and refuses all negotiations.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level: 3, treasureRewards: 1 },
  },
  {
    id: "bureaucratic-ooze",
    name: "Bureaucratic Ooze",
    description: "Every attack requires three identical forms.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level: 6, treasureRewards: 2 },
  },
  {
    id: "clockwork-yak",
    name: "Clockwork Yak",
    description: "Loud, stubborn, and wound much too tightly.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level: 10, treasureRewards: 3 },
  },
  {
    id: "moonlit-leviathan",
    name: "Moonlit Leviathan",
    description: "Too large for the room, yet somehow already inside it.",
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level: 18, treasureRewards: 5 },
  },
  {
    id: "curse-shortcut-tax",
    name: "Curse! Shortcut Tax",
    description: "Lose one level for taking the suspiciously convenient route.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    effects: [{ type: "LOSE_LEVEL", amount: 1 }],
  },
  {
    id: "curse-memory-moths",
    name: "Curse! Memory Moths",
    description: "Discard one random card from your hand.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    effects: [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 1 }],
  },
  {
    id: "curse-double-backtrack",
    name: "Curse! Double Backtrack",
    description: "Lose two levels, but never fall below level one.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    effects: [{ type: "LOSE_LEVEL", amount: 2 }],
  },
  {
    id: "guild-of-echoes",
    name: "Guild of Echoes",
    description: "A future class card with no milestone-two effect.",
    type: CardType.CLASS,
    deck: DeckType.DOOR,
    effects: [],
  },
  {
    id: "lantern-folk",
    name: "Lantern Folk",
    description: "A future ancestry card with no milestone-two effect.",
    type: CardType.RACE,
    deck: DeckType.DOOR,
    effects: [],
  },
  {
    id: "mysterious-membership-card",
    name: "Mysterious Membership Card",
    description: "Nobody remembers joining, but the card looks official.",
    type: CardType.OTHER,
    deck: DeckType.DOOR,
    effects: [],
  },
  {
    id: "spatula-of-resolve",
    name: "Spatula of Resolve",
    description: "Kitchen-tested equipment worth two combat power.",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  },
  {
    id: "helmet-of-mild-foresight",
    name: "Helmet of Mild Foresight",
    description: "You see danger approximately one second early.",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 1 }],
  },
  {
    id: "boots-of-purposeful-squeaking",
    name: "Boots of Purposeful Squeaking",
    description: "Subtlety is overrated; confidence is worth two power.",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  },
  {
    id: "cardboard-plate-mail",
    name: "Cardboard Plate Mail",
    description: "Weather-sensitive protection worth three power.",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 3 }],
  },
  {
    id: "two-handed-bookmark",
    name: "Two-Handed Bookmark",
    description: "Marks both your page and your enemies for defeat.",
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 4 }],
  },
  {
    id: "bottled-applause",
    name: "Bottled Applause",
    description: "Open for a brief three-power confidence boost.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 3 }],
  },
  {
    id: "pocket-comet",
    name: "Pocket Comet",
    description: "Tiny, radiant, and worth five temporary power.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 5 }],
  },
  {
    id: "emergency-confetti",
    name: "Emergency Confetti",
    description: "A colorful distraction worth two temporary power.",
    type: CardType.TEMPORARY_BONUS,
    deck: DeckType.TREASURE,
    effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  },
  {
    id: "coupon-of-destiny",
    name: "Coupon of Destiny",
    description: "Not valid anywhere, but surely valuable eventually.",
    type: CardType.OTHER,
    deck: DeckType.TREASURE,
    effects: [],
  },
  {
    id: "polished-pebble-collection",
    name: "Polished Pebble Collection",
    description: "Several excellent pebbles in a respectable pouch.",
    type: CardType.OTHER,
    deck: DeckType.TREASURE,
    effects: [],
  },
];

const copiesByDefinition: Readonly<Record<string, number>> = {
  "dust-bunny-brigade": 3,
  "corridor-crab": 3,
  "bureaucratic-ooze": 3,
  "clockwork-yak": 3,
  "moonlit-leviathan": 3,
  "curse-shortcut-tax": 3,
  "curse-memory-moths": 3,
  "curse-double-backtrack": 3,
  "guild-of-echoes": 2,
  "lantern-folk": 2,
  "mysterious-membership-card": 2,
  "spatula-of-resolve": 3,
  "helmet-of-mild-foresight": 3,
  "boots-of-purposeful-squeaking": 3,
  "cardboard-plate-mail": 3,
  "two-handed-bookmark": 3,
  "bottled-applause": 3,
  "pocket-comet": 3,
  "emergency-confetti": 3,
  "coupon-of-destiny": 3,
  "polished-pebble-collection": 3,
};

function createInstances(definition: CardDefinition): readonly CardInstance[] {
  const count = copiesByDefinition[definition.id] ?? 1;

  return Array.from({ length: count }, (_, index) => ({
    instanceId: parseCardInstanceId(`${definition.id}-${index + 1}`),
    definitionId: definition.id,
  }));
}

export function createDevelopmentCardSet(): CardSet {
  const definitions = definitionInputs.map<CardDefinition>((definition) => ({
    ...definition,
    id: parseCardDefinitionId(definition.id),
  }));
  const instances = definitions.flatMap(createInstances);

  return {
    definitions,
    doorDeck: instances.filter((card) => {
      const definition = definitions.find(
        (candidate) => candidate.id === card.definitionId,
      );
      return definition?.deck === DeckType.DOOR;
    }),
    treasureDeck: instances.filter((card) => {
      const definition = definitions.find(
        (candidate) => candidate.id === card.definitionId,
      );
      return definition?.deck === DeckType.TREASURE;
    }),
  };
}
