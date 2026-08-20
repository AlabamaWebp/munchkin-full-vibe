import {
  CardPlayTiming,
  CardPlayTarget,
  CardType,
  DeckType,
  EquipmentSlot,
  type CardDefinition,
  type CardInstance,
  type CardSet,
} from "./cards.js";
import { parseCardDefinitionId, parseCardInstanceId } from "./identifiers.js";

type DefinitionInput = Omit<CardDefinition, "id"> & { readonly id: string };
type Restrictions = NonNullable<
  NonNullable<CardDefinition["equipment"]>["restrictions"]
>;

const id = parseCardDefinitionId;
const drawnAtPlayer = {
  timings: [CardPlayTiming.WHEN_DRAWN, CardPlayTiming.TURN],
  target: CardPlayTarget.ANY_PLAYER,
} as const;
const ownTurn = {
  timings: [CardPlayTiming.TURN],
  target: CardPlayTarget.SELF,
} as const;
const combatPlayers = {
  timings: [CardPlayTiming.ACTIVE_COMBAT, CardPlayTiming.VICTORY_REACTION],
  target: CardPlayTarget.COMBAT_PLAYERS,
} as const;
const combatMonster = {
  timings: [CardPlayTiming.ACTIVE_COMBAT, CardPlayTiming.VICTORY_REACTION],
  target: CardPlayTarget.MONSTER_ENCOUNTER,
} as const;

function monster(
  cardId: string,
  name: string,
  description: string,
  level: number,
  treasureRewards: number,
  badStuff: NonNullable<CardDefinition["monster"]>["badStuff"],
  levelRewards: number = 1,
): DefinitionInput {
  return {
    id: cardId,
    artKey: `door.monster.${cardId}`,
    name,
    description,
    type: CardType.MONSTER,
    deck: DeckType.DOOR,
    effects: [],
    monster: { level, levelRewards, treasureRewards, badStuff },
  };
}

function equipment(
  cardId: string,
  name: string,
  description: string,
  slot: EquipmentSlot,
  hands: 0 | 1 | 2,
  combatBonus: number,
  goldValue: number,
  restrictions: Restrictions = [],
): DefinitionInput {
  return {
    id: cardId,
    artKey: `treasure.equipment.${cardId}`,
    name,
    description,
    type: CardType.EQUIPMENT,
    deck: DeckType.TREASURE,
    goldValue,
    play: ownTurn,
    effects: [],
    equipment: { slot, hands, combatBonus, restrictions },
  };
}

function action(
  cardId: string,
  artGroup: string,
  name: string,
  description: string,
  type: CardType,
  goldValue: number,
  play: NonNullable<CardDefinition["play"]>,
  effects: CardDefinition["effects"],
): DefinitionInput {
  return {
    id: cardId,
    artKey: `treasure.${artGroup}.${cardId}`,
    name,
    description,
    type,
    deck: DeckType.TREASURE,
    goldValue,
    play,
    effects,
  };
}

const doorDefinitions: readonly DefinitionInput[] = [
  monster(
    "dust-bunny-brigade",
    "Dust Bunny Brigade",
    "A surprisingly organized threat from beneath the sofa.",
    1,
    1,
    [{ type: "LOSE_LEVEL", amount: 1 }],
  ),
  monster(
    "corridor-crab",
    "Corridor Crab",
    "It has claimed the hallway and refuses all negotiations.",
    3,
    1,
    [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
  ),
  monster(
    "whispering-vending-machine",
    "Whispering Vending Machine",
    "It accepts exact change and vague promises.",
    4,
    2,
    [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 2 }],
  ),
  monster(
    "bureaucratic-ooze",
    "Bureaucratic Ooze",
    "Every attack requires three identical forms.",
    6,
    2,
    [{ type: "LOSE_LEVEL", amount: 2 }],
  ),
  monster(
    "staircase-centipede",
    "Staircase Centipede",
    "It has a shoe for every step and an invoice for every shoe.",
    8,
    2,
    [{ type: "DISCARD_ROLE", role: "CLASS" }],
  ),
  monster(
    "clockwork-yak",
    "Clockwork Yak",
    "Loud, stubborn, and wound much too tightly.",
    10,
    3,
    [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 }],
  ),
  monster(
    "archive-dragon",
    "Archive Dragon",
    "It hoards first editions, final notices, and anyone who whispers.",
    14,
    4,
    [
      { type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 },
      { type: "LOSE_LEVEL", amount: 1 },
    ],
    2,
  ),
  monster(
    "moonlit-leviathan",
    "Moonlit Leviathan",
    "Too large for the room, yet somehow already inside it.",
    18,
    5,
    [{ type: "DEATH" }],
    2,
  ),
  {
    id: "curse-shortcut-tax",
    artKey: "door.curse.shortcut-tax",
    name: "Curse! Shortcut Tax",
    description: "Lose one level for taking the suspiciously convenient route.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    play: drawnAtPlayer,
    effects: [{ type: "LOSE_LEVEL", amount: 1 }],
  },
  {
    id: "curse-memory-moths",
    artKey: "door.curse.memory-moths",
    name: "Curse! Memory Moths",
    description: "Choose and discard one card from your hand.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    play: drawnAtPlayer,
    effects: [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
  },
  {
    id: "curse-double-backtrack",
    artKey: "door.curse.double-backtrack",
    name: "Curse! Double Backtrack",
    description: "Lose two levels, but never fall below level one.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    play: drawnAtPlayer,
    effects: [{ type: "LOSE_LEVEL", amount: 2 }],
  },
  {
    id: "curse-career-fog",
    artKey: "door.curse.career-fog",
    name: "Curse! Career Fog",
    description: "Discard your current Class card.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    play: drawnAtPlayer,
    effects: [{ type: "DISCARD_ROLE", role: "CLASS" }],
  },
  {
    id: "curse-pocket-gravity",
    artKey: "door.curse.pocket-gravity",
    name: "Curse! Pocket Gravity",
    description: "Choose one equipped item; it becomes too heavy to keep.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    play: drawnAtPlayer,
    effects: [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 }],
  },
  {
    id: "curse-unread-map",
    artKey: "door.curse.unread-map",
    name: "Curse! Unread Map",
    description:
      "Discard your current Race card after confidently going the wrong way.",
    type: CardType.CURSE,
    deck: DeckType.DOOR,
    play: drawnAtPlayer,
    effects: [{ type: "DISCARD_ROLE", role: "RACE" }],
  },
  {
    id: "curse-tangled-bootlaces",
    artKey: "door.combat-curse.tangled-bootlaces",
    name: "Combat Curse! Tangled Bootlaces",
    description:
      "During a victory reaction, one adventurer in combat loses three power.",
    type: CardType.COMBAT_CURSE,
    deck: DeckType.DOOR,
    play: {
      timings: [CardPlayTiming.VICTORY_REACTION],
      target: CardPlayTarget.COMBAT_PLAYER,
    },
    effects: [{ type: "COMBAT_BONUS", amount: -3 }],
  },
  {
    id: "guild-of-echoes",
    artKey: "door.class.guild-of-echoes",
    name: "Guild of Echoes",
    description: "A resonant Class trusted by instruments that answer back.",
    type: CardType.CLASS,
    deck: DeckType.DOOR,
    play: ownTurn,
    effects: [],
  },
  {
    id: "cartographers-circle",
    artKey: "door.class.cartographers-circle",
    name: "Cartographers' Circle",
    description:
      "A Class that treats every wrong turn as valuable field research.",
    type: CardType.CLASS,
    deck: DeckType.DOOR,
    play: ownTurn,
    effects: [],
  },
  {
    id: "lantern-folk",
    artKey: "door.race.lantern-folk",
    name: "Lantern Folk",
    description: "A bright Race with a talent for finding the way.",
    type: CardType.RACE,
    deck: DeckType.DOOR,
    play: ownTurn,
    effects: [],
  },
  {
    id: "mosskin",
    artKey: "door.race.mosskin",
    name: "Mosskin",
    description: "A patient Race that can turn a pause into a small ecosystem.",
    type: CardType.RACE,
    deck: DeckType.DOOR,
    play: ownTurn,
    effects: [],
  },
  {
    id: "open-mic-night-invitation",
    artKey: "door.combat.open-mic-night-invitation",
    name: "Open Mic Night Invitation",
    description:
      "Choose a Monster from your hand. It joins the current combat.",
    type: CardType.ADD_MONSTER,
    deck: DeckType.DOOR,
    play: {
      timings: [CardPlayTiming.ACTIVE_COMBAT, CardPlayTiming.VICTORY_REACTION],
      target: CardPlayTarget.HAND_MONSTER,
    },
    effects: [{ type: "ADD_MONSTER_TO_COMBAT" }],
  },
];

const equipmentDefinitions: readonly DefinitionInput[] = [
  equipment(
    "spatula-of-resolve",
    "Spatula of Resolve",
    "Kitchen-tested confidence on a reinforced handle.",
    EquipmentSlot.HANDS,
    1,
    2,
    400,
  ),
  equipment(
    "helmet-of-mild-foresight",
    "Helmet of Mild Foresight",
    "You see danger approximately one second early.",
    EquipmentSlot.HEAD,
    0,
    1,
    300,
  ),
  equipment(
    "boots-of-purposeful-squeaking",
    "Boots of Purposeful Squeaking",
    "Subtlety is overrated; confidence is worth two power.",
    EquipmentSlot.FEET,
    0,
    2,
    400,
  ),
  equipment(
    "cardboard-plate-mail",
    "Cardboard Plate Mail",
    "Weather-sensitive protection with remarkably bold fluting.",
    EquipmentSlot.BODY,
    0,
    3,
    600,
  ),
  equipment(
    "two-handed-bookmark",
    "Two-Handed Bookmark",
    "Marks both your page and your enemies for defeat.",
    EquipmentSlot.HANDS,
    2,
    4,
    800,
    [{ type: "CLASS", definitionId: id("guild-of-echoes") }],
  ),
  equipment(
    "compass-crown",
    "Compass Crown",
    "Every direction is forward when announced with enough ceremony.",
    EquipmentSlot.HEAD,
    0,
    2,
    500,
    [{ type: "RACE", definitionId: id("lantern-folk") }],
  ),
  equipment(
    "coat-of-many-pockets",
    "Coat of Many Pockets",
    "Most pockets are decoys, but the useful ones are excellent.",
    EquipmentSlot.BODY,
    0,
    2,
    500,
  ),
  equipment(
    "deadline-skates",
    "Deadline Skates",
    "They only roll faster when the route is still being drawn.",
    EquipmentSlot.FEET,
    0,
    3,
    700,
    [{ type: "CLASS", definitionId: id("cartographers-circle") }],
  ),
  equipment(
    "tuning-fork-rapier",
    "Tuning-Fork Rapier",
    "A precise note with a surprisingly sharp conclusion.",
    EquipmentSlot.HANDS,
    1,
    3,
    600,
    [{ type: "CLASS", definitionId: id("guild-of-echoes") }],
  ),
  equipment(
    "portable-drawbridge",
    "Portable Drawbridge",
    "Heavy, impractical, and excellent at ending an argument.",
    EquipmentSlot.HANDS,
    2,
    5,
    900,
    [{ type: "RACE", definitionId: id("mosskin") }],
  ),
];

const treasureActionDefinitions: readonly DefinitionInput[] = [
  action(
    "bottled-applause",
    "bonus",
    "Bottled Applause",
    "Open for a brief three-power confidence boost.",
    CardType.TEMPORARY_BONUS,
    200,
    combatPlayers,
    [{ type: "COMBAT_BONUS", amount: 3 }],
  ),
  action(
    "pocket-comet",
    "bonus",
    "Pocket Comet",
    "Tiny, radiant, and worth five temporary power.",
    CardType.TEMPORARY_BONUS,
    400,
    combatPlayers,
    [{ type: "COMBAT_BONUS", amount: 5 }],
  ),
  action(
    "emergency-confetti",
    "bonus",
    "Emergency Confetti",
    "A colorful distraction worth two temporary power.",
    CardType.TEMPORARY_BONUS,
    100,
    combatPlayers,
    [{ type: "COMBAT_BONUS", amount: 2 }],
  ),
  action(
    "heroic-snack-break",
    "bonus",
    "Heroic Snack Break",
    "A precisely timed biscuit gives the adventurers four power.",
    CardType.TEMPORARY_BONUS,
    300,
    combatPlayers,
    [{ type: "COMBAT_BONUS", amount: 4 }],
  ),
  action(
    "borrowed-thunder",
    "bonus",
    "Borrowed Thunder",
    "Return before sunset; until then, it lends six power.",
    CardType.TEMPORARY_BONUS,
    500,
    combatPlayers,
    [{ type: "COMBAT_BONUS", amount: 6 }],
  ),
  action(
    "ominous-stage-light",
    "bonus",
    "Ominous Stage Light",
    "Dramatic lighting gives one Monster four temporary power.",
    CardType.TEMPORARY_BONUS,
    300,
    combatMonster,
    [{ type: "MONSTER_COMBAT_BONUS", amount: 4 }],
  ),
  action(
    "strategic-banana-peel",
    "bonus",
    "Strategic Banana Peel",
    "One Monster loses three power while reconsidering its footing.",
    CardType.TEMPORARY_BONUS,
    200,
    combatMonster,
    [{ type: "MONSTER_COMBAT_BONUS", amount: -3 }],
  ),
  action(
    "inflatable-shoulder-pads",
    "modifier",
    "Inflatable Shoulder Pads",
    "One Monster gains four strength and a broader silhouette.",
    CardType.MONSTER_MODIFIER,
    300,
    combatMonster,
    [{ type: "MODIFY_MONSTER", strength: 4, treasures: 0 }],
  ),
  action(
    "dramatic-entrance-music",
    "modifier",
    "Dramatic Entrance Music",
    "An unnecessary fanfare gives one Monster two extra strength.",
    CardType.MONSTER_MODIFIER,
    200,
    combatMonster,
    [{ type: "MODIFY_MONSTER", strength: 2, treasures: 0 }],
  ),
  action(
    "executive-monster-promotion",
    "modifier",
    "Executive Monster Promotion",
    "One Monster gains five strength and two Treasures.",
    CardType.MONSTER_MODIFIER,
    500,
    combatMonster,
    [{ type: "MODIFY_MONSTER", strength: 5, treasures: 2 }],
  ),
  action(
    "mandatory-monster-nap",
    "modifier",
    "Mandatory Monster Nap",
    "One Monster loses five strength and one Treasure, within the normal limits.",
    CardType.MONSTER_MODIFIER,
    400,
    combatMonster,
    [{ type: "MODIFY_MONSTER", strength: -5, treasures: -1 }],
  ),
  action(
    "bureaucratic-carbon-copy",
    "combat",
    "Bureaucratic Carbon Copy",
    "Create an independent snapshot of one Monster in combat.",
    CardType.CLONE_MONSTER,
    600,
    combatMonster,
    [{ type: "CLONE_COMBAT_MONSTER" }],
  ),
];

const definitionInputs: readonly DefinitionInput[] = [
  ...doorDefinitions,
  ...equipmentDefinitions,
  ...treasureActionDefinitions,
];

const copiesByDefinition: Readonly<Record<string, number>> = Object.fromEntries(
  definitionInputs.map((definition) => [
    definition.id,
    definition.type === CardType.CLASS || definition.type === CardType.RACE
      ? 2
      : 3,
  ]),
);

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
  const deckFor = (deck: DeckType) =>
    instances.filter((card) =>
      definitions.some(
        (definition) =>
          definition.id === card.definitionId && definition.deck === deck,
      ),
    );

  return {
    definitions,
    doorDeck: deckFor(DeckType.DOOR),
    treasureDeck: deckFor(DeckType.TREASURE),
  };
}
