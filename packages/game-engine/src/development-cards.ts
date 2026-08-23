import {
  CardPlayTarget,
  CardPlayTiming,
  CardSetId,
  CardType,
  DeckType,
  EquipmentSlot,
  PlayerSex,
  type CardDefinition,
  type CardInstance,
  type CardSet,
  type ConditionalModifierDefinition,
  type EquipmentDefinition,
} from "./cards.js";
import { parseCardDefinitionId, parseCardInstanceId } from "./identifiers.js";

type RawDefinition = Omit<CardDefinition, "id"> & { readonly id: string };
type Entry = { readonly definition: RawDefinition; readonly copies: number };
const id = parseCardDefinitionId;
const ownTurn = {
  timings: [CardPlayTiming.TURN],
  target: CardPlayTarget.SELF,
} as const;
const drawn = {
  timings: [CardPlayTiming.WHEN_DRAWN, CardPlayTiming.TURN],
  target: CardPlayTarget.ANY_PLAYER,
} as const;
const players = {
  timings: [CardPlayTiming.ACTIVE_COMBAT, CardPlayTiming.VICTORY_REACTION],
  target: CardPlayTarget.COMBAT_PLAYERS,
} as const;
const monsterTarget = {
  timings: [CardPlayTiming.ACTIVE_COMBAT, CardPlayTiming.VICTORY_REACTION],
  target: CardPlayTarget.MONSTER_ENCOUNTER,
} as const;
const legacyArtKeys: Readonly<Record<string, string>> = {
  "bottled-applause": "treasure.bonus.bottled-applause",
  "pocket-comet": "treasure.bonus.pocket-comet",
  "emergency-confetti": "treasure.bonus.emergency-confetti",
  "heroic-snack-break": "treasure.bonus.heroic-snack-break",
  "borrowed-thunder": "treasure.bonus.borrowed-thunder",
  "ominous-stage-light": "treasure.bonus.ominous-stage-light",
  "strategic-banana-peel": "treasure.bonus.strategic-banana-peel",
  "inflatable-shoulder-pads": "treasure.modifier.inflatable-shoulder-pads",
  "dramatic-entrance-music": "treasure.modifier.dramatic-entrance-music",
  "executive-monster-promotion":
    "treasure.modifier.executive-monster-promotion",
  "mandatory-monster-nap": "treasure.modifier.mandatory-monster-nap",
  "bureaucratic-carbon-copy": "treasure.combat.bureaucratic-carbon-copy",
  "open-mic-night-invitation": "door.combat.open-mic-night-invitation",
  "curse-tangled-bootlaces": "door.combat-curse.tangled-bootlaces",
};

function e(definition: RawDefinition, copies: number): Entry {
  return { definition, copies };
}
function condition(
  type: "COMBAT_POWER",
  amount: number,
  conditions: ConditionalModifierDefinition["conditions"],
): ConditionalModifierDefinition {
  return { type, amount, conditions };
}

function modifierText(modifier: ConditionalModifierDefinition): string {
  if (modifier.type === "RUN_AWAY_ROLL")
    return `${modifier.amount >= 0 ? "+" : ""}${modifier.amount} to Run Away rolls.`;
  if (modifier.type === "AUTOMATIC_PROTECTION")
    return "Cancels matching Early or Mid Curses while active.";
  if (modifier.type === "EQUIPMENT_TAG_BONUS")
    return `+${modifier.amountPerCard} per matching ${modifier.tags.join("/")} item, up to ${modifier.maxCards}.`;
  const subject = modifier.conditions
    .map((item) => {
      if (item.type === "MONSTER_HAS_TAG")
        return `${item.anyOf.join("/")} Monsters`;
      if (item.type === "PLAYER_SEX_IS")
        return `${item.sex.toLowerCase()} adventurers`;
      if (item.type === "PLAYER_HAS_CLASS")
        return item.anyOf
          .map((value) => String(value).replaceAll("-", " "))
          .join("/");
      if (item.type === "PLAYER_HAS_RACE")
        return item.anyOf
          .map((value) => String(value).replaceAll("-", " "))
          .join("/");
      if (item.type === "EQUIPPED_HAS_TAG")
        return `equipped ${item.anyOf.join("/")}`;
      return "the matching condition";
    })
    .join(" and ");
  return `${modifier.amount >= 0 ? "+" : ""}${modifier.amount}${subject.length > 0 ? ` against ${subject}` : ""}.`;
}

function effectText(effect: CardDefinition["effects"][number]): string {
  switch (effect.type) {
    case "COMBAT_BONUS":
      return `${effect.amount >= 0 ? "+" : ""}${effect.amount} to the adventurers`;
    case "MONSTER_COMBAT_BONUS":
      return `${effect.amount >= 0 ? "+" : ""}${effect.amount} to one Monster`;
    case "MODIFY_MONSTER":
      return `${effect.strength >= 0 ? "+" : ""}${effect.strength} Strength and ${effect.treasures >= 0 ? "+" : ""}${effect.treasures} Treasures to one Monster`;
    case "ADD_MONSTER_TO_COMBAT":
      return "add a Monster from your hand to combat";
    case "CLONE_COMBAT_MONSTER":
      return "clone one Monster in combat";
    case "GAIN_LEVEL":
      return `gain ${effect.amount} level`;
    case "LOSE_LEVEL":
      return `lose ${effect.amount} level`;
    case "DRAW_CARDS":
      return `draw ${effect.count} ${effect.deck} card`;
    case "DISCARD_RANDOM_CARDS":
      return `discard ${effect.count} random ${effect.zone.toLowerCase()} card`;
    case "DISCARD_CHOSEN_CARDS":
      return `discard ${effect.count} chosen ${effect.zone.toLowerCase()} card`;
    case "DISCARD_ROLE":
      return `discard your ${effect.role}`;
    case "DEATH":
      return "death";
  }
}

interface MonsterData {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  copies: number;
  strength: number;
  treasures: number;
  levels?: 1 | 2;
  tags?: CardDefinition["tags"];
  bad: NonNullable<CardDefinition["monster"]>["badStuff"];
  modifiers?: readonly ConditionalModifierDefinition[];
}
function m(x: MonsterData): Entry {
  const badText = x.bad.map(effectText).join(" and ");
  const abilityText = (x.modifiers?.map(modifierText).join(" ") ?? "").replace(
    /\.$/,
    "",
  );
  return e(
    {
      id: x.id,
      artKey: `door.monster.${x.id}`,
      setId: CardSetId.CORE,
      tier: x.tier,
      name: x.name,
      description: `Strength ${x.strength}${abilityText.length > 0 ? `; ${abilityText}` : ""}. Bad Stuff: ${badText}.`,
      type: CardType.MONSTER,
      deck: DeckType.DOOR,
      tags: x.tags ?? [],
      effects: [],
      monster: {
        strength: x.strength,
        levelRewards: x.levels ?? 1,
        treasureRewards: x.treasures,
        badStuff: x.bad,
        ...(x.modifiers === undefined ? {} : { modifiers: x.modifiers }),
      },
    },
    x.copies,
  );
}

interface EquipmentData {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  copies: number;
  slot: EquipmentSlot;
  bonus: number;
  gold: number;
  hands?: 0 | 1 | 2;
  tags?: CardDefinition["tags"];
  restrictions?: EquipmentDefinition["restrictions"];
  modifier?: ConditionalModifierDefinition;
  setId?: CardSetId;
  starter?: boolean;
  scavenge?: boolean;
}
function q(x: EquipmentData): Entry {
  const restrictions = x.restrictions ?? [];
  const starter =
    x.starter ??
    (x.tier === 1 &&
      restrictions.length === 0 &&
      x.bonus >= 1 &&
      x.bonus <= 2 &&
      x.setId !== CardSetId.ARSENAL);
  return e(
    {
      id: x.id,
      artKey: `treasure.equipment.${x.id}`,
      setId: x.setId ?? CardSetId.CORE,
      tier: x.tier,
      name: x.name,
      description: `+${x.bonus} ${x.slot.toLowerCase()} Equipment.${x.modifier === undefined ? "" : ` ${modifierText(x.modifier)}`}`,
      type: CardType.EQUIPMENT,
      deck: DeckType.TREASURE,
      tags: x.tags ?? [],
      goldValue: x.gold,
      starterEligible: starter,
      ...(x.scavenge
        ? { scavengeEligible: true, sellable: false, tradeable: false }
        : {}),
      play: ownTurn,
      effects: [],
      equipment: {
        slot: x.slot,
        hands: x.slot === EquipmentSlot.HANDS ? (x.hands ?? 1) : 0,
        combatBonus: x.bonus,
        restrictions,
        ...(x.modifier === undefined ? {} : { modifier: x.modifier }),
      },
    },
    x.copies,
  );
}

interface ActionData {
  id: string;
  name: string;
  type: CardDefinition["type"];
  tier: 1 | 2 | 3;
  copies: number;
  effects: CardDefinition["effects"];
  play: NonNullable<CardDefinition["play"]>;
  gold?: number;
  deck?: DeckType;
  setId?: CardSetId;
}
function a(x: ActionData): Entry {
  const deck = x.deck ?? DeckType.TREASURE;
  return e(
    {
      id: x.id,
      artKey:
        legacyArtKeys[x.id] ??
        `${deck === DeckType.DOOR ? "door" : "treasure"}.action.${x.id}`,
      setId: x.setId ?? CardSetId.CORE,
      tier: x.tier,
      name: x.name,
      description: `${x.effects.map(effectText).join("; ")}.`,
      type: x.type,
      deck,
      tags: [],
      ...(deck === DeckType.TREASURE ? { goldValue: x.gold ?? 0 } : {}),
      play: x.play,
      effects: x.effects,
    },
    x.copies,
  );
}

function c(
  idValue: string,
  name: string,
  tier: 1 | 2 | 3,
  severity: "EARLY" | "MID" | "LATE",
  effects: CardDefinition["effects"],
  type: typeof CardType.CURSE | typeof CardType.COMBAT_CURSE = CardType.CURSE,
): Entry {
  return e(
    {
      id: idValue,
      artKey: `door.curse.${idValue}`,
      setId: CardSetId.CORE,
      tier,
      name,
      description: `${effects.map(effectText).join("; ")}.`,
      type,
      deck: DeckType.DOOR,
      tags: [severity === "EARLY" ? "TRAP" : "HEX"],
      play:
        type === CardType.COMBAT_CURSE
          ? {
              timings: [CardPlayTiming.VICTORY_REACTION],
              target: CardPlayTarget.COMBAT_PLAYER,
            }
          : drawn,
      effects,
      curse: { severity },
    },
    2,
  );
}

function r(
  idValue: string,
  name: string,
  kind: "CLASS" | "RACE",
  modifier: ConditionalModifierDefinition,
  setId: CardSetId = CardSetId.CORE,
  tier: 1 | 2 | 3 = 1,
  copies = 3,
): Entry {
  return e(
    {
      id: idValue,
      artKey: `door.${kind.toLowerCase()}.${idValue}`,
      setId,
      tier,
      name,
      description: modifierText(modifier),
      type: kind === "CLASS" ? CardType.CLASS : CardType.RACE,
      deck: DeckType.DOOR,
      tags: [],
      play: ownTurn,
      effects: [],
      role: { role: kind, modifier },
    },
    copies,
  );
}

const coreMonsters: readonly Entry[] = [
  m({
    id: "dust-bunny-brigade",
    name: "Dust Bunny Brigade",
    tier: 1,
    copies: 3,
    strength: 1,
    treasures: 1,
    tags: ["BEAST"],
    bad: [{ type: "LOSE_LEVEL", amount: 1 }],
  }),
  m({
    id: "corridor-crab",
    name: "Corridor Crab",
    tier: 1,
    copies: 3,
    strength: 1,
    treasures: 1,
    tags: ["BEAST"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
  }),
  m({
    id: "dust-parliament",
    name: "Dust Parliament",
    tier: 1,
    copies: 3,
    strength: 2,
    treasures: 1,
    tags: ["ARCANE"],
    bad: [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 1 }],
    modifiers: [
      condition("COMBAT_POWER", 2, [
        {
          type: "EQUIPPED_HAS_TAG",
          anyOf: ["ARMOR"],
          atLeast: 1,
          scope: "OWNER",
        },
      ]),
    ],
  }),
  m({
    id: "paper-mimic",
    name: "Paper Mimic",
    tier: 1,
    copies: 3,
    strength: 2,
    treasures: 1,
    tags: ["CONSTRUCT"],
    bad: [{ type: "LOSE_LEVEL", amount: 1 }],
  }),
  m({
    id: "lost-sock-swarm",
    name: "Lost Sock Swarm",
    tier: 1,
    copies: 3,
    strength: 3,
    treasures: 1,
    tags: ["BEAST"],
    bad: [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 1 }],
  }),
  m({
    id: "cupboard-specter",
    name: "Cupboard Specter",
    tier: 1,
    copies: 3,
    strength: 3,
    treasures: 1,
    tags: ["UNDEAD"],
    bad: [{ type: "LOSE_LEVEL", amount: 1 }],
    modifiers: [
      condition("COMBAT_POWER", 2, [
        { type: "PLAYER_HAS_RACE", anyOf: [id("lantern-folk")] },
      ]),
    ],
  }),
  m({
    id: "whispering-vending-machine",
    name: "Whispering Vending Machine",
    tier: 1,
    copies: 2,
    strength: 4,
    treasures: 2,
    tags: ["CONSTRUCT"],
    bad: [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 2 }],
  }),
  m({
    id: "hallway-minotaur",
    name: "Hallway Minotaur",
    tier: 1,
    copies: 2,
    strength: 5,
    treasures: 2,
    tags: ["BEAST"],
    bad: [{ type: "LOSE_LEVEL", amount: 1 }],
  }),
  m({
    id: "bureaucratic-ooze",
    name: "Bureaucratic Ooze",
    tier: 2,
    copies: 3,
    strength: 6,
    treasures: 2,
    tags: ["ARCANE"],
    bad: [{ type: "LOSE_LEVEL", amount: 2 }],
  }),
  m({
    id: "mirror-duelist-male",
    name: "Mirror Duelist: Mars",
    tier: 2,
    copies: 3,
    strength: 7,
    treasures: 2,
    tags: ["ARCANE"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
    modifiers: [
      condition("COMBAT_POWER", 3, [
        { type: "PLAYER_SEX_IS", sex: PlayerSex.MALE },
      ]),
    ],
  }),
  m({
    id: "mirror-duelist-female",
    name: "Mirror Duelist: Venus",
    tier: 2,
    copies: 3,
    strength: 8,
    treasures: 2,
    tags: ["ARCANE"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
    modifiers: [
      condition("COMBAT_POWER", 3, [
        { type: "PLAYER_SEX_IS", sex: PlayerSex.FEMALE },
      ]),
    ],
  }),
  m({
    id: "map-eater",
    name: "Map-Eater",
    tier: 2,
    copies: 2,
    strength: 9,
    treasures: 2,
    tags: ["BEAST"],
    bad: [{ type: "DISCARD_ROLE", role: "CLASS" }],
    modifiers: [
      condition("COMBAT_POWER", 3, [
        { type: "PLAYER_HAS_CLASS", anyOf: [id("cartographers-circle")] },
      ]),
    ],
  }),
  m({
    id: "staircase-centipede",
    name: "Staircase Centipede",
    tier: 2,
    copies: 2,
    strength: 10,
    treasures: 3,
    tags: ["BEAST"],
    bad: [{ type: "DISCARD_ROLE", role: "CLASS" }],
  }),
  m({
    id: "rust-choir",
    name: "Rust Choir",
    tier: 2,
    copies: 2,
    strength: 11,
    treasures: 3,
    tags: ["CONSTRUCT"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 }],
    modifiers: [
      condition("COMBAT_POWER", 2, [
        {
          type: "EQUIPPED_HAS_TAG",
          anyOf: ["MAGIC"],
          atLeast: 1,
          scope: "OWNER",
        },
      ]),
    ],
  }),
  m({
    id: "grave-lantern",
    name: "Grave Lantern",
    tier: 2,
    copies: 2,
    strength: 11,
    treasures: 3,
    levels: 2,
    tags: ["UNDEAD"],
    bad: [{ type: "DISCARD_ROLE", role: "RACE" }],
  }),
  m({
    id: "clockwork-yak",
    name: "Clockwork Yak",
    tier: 3,
    copies: 2,
    strength: 12,
    treasures: 3,
    levels: 2,
    tags: ["CONSTRUCT", "BEAST"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 }],
  }),
  m({
    id: "archive-dragon",
    name: "Archive Dragon",
    tier: 3,
    copies: 2,
    strength: 14,
    treasures: 3,
    levels: 2,
    tags: ["ARCANE", "BEAST"],
    bad: [
      { type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 },
      { type: "LOSE_LEVEL", amount: 1 },
    ],
  }),
  m({
    id: "midnight-auditor",
    name: "Midnight Auditor",
    tier: 3,
    copies: 2,
    strength: 15,
    treasures: 4,
    levels: 2,
    tags: ["UNDEAD"],
    bad: [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 3 }],
  }),
  m({
    id: "library-colossus",
    name: "Library Colossus",
    tier: 3,
    copies: 2,
    strength: 17,
    treasures: 4,
    levels: 2,
    tags: ["CONSTRUCT"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 2 }],
  }),
  m({
    id: "moonlit-leviathan",
    name: "Moonlit Leviathan",
    tier: 3,
    copies: 1,
    strength: 19,
    treasures: 5,
    levels: 2,
    tags: ["ARCANE", "BEAST"],
    bad: [{ type: "DEATH" }],
  }),
];

const coreCurses: readonly Entry[] = [
  c("curse-shortcut-tax", "Curse! Shortcut Tax", 1, "EARLY", [
    { type: "LOSE_LEVEL", amount: 1 },
  ]),
  c("curse-memory-moths", "Curse! Memory Moths", 1, "EARLY", [
    { type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 },
  ]),
  c(
    "curse-tangled-bootlaces",
    "Combat Curse! Tangled Bootlaces",
    1,
    "EARLY",
    [{ type: "COMBAT_BONUS", amount: -3 }],
    CardType.COMBAT_CURSE,
  ),
  c("curse-hollow-pockets", "Curse! Hollow Pockets", 1, "EARLY", [
    { type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 1 },
  ]),
  c("curse-wrong-turn", "Curse! Wrong Turn", 1, "EARLY", [
    { type: "LOSE_LEVEL", amount: 1 },
  ]),
  c("curse-double-backtrack", "Curse! Double Backtrack", 2, "MID", [
    { type: "LOSE_LEVEL", amount: 2 },
  ]),
  c("curse-career-fog", "Curse! Career Fog", 2, "MID", [
    { type: "DISCARD_ROLE", role: "CLASS" },
  ]),
  c("curse-pocket-gravity", "Curse! Pocket Gravity", 2, "MID", [
    { type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 },
  ]),
  c("curse-unread-map", "Curse! Unread Map", 2, "MID", [
    { type: "DISCARD_ROLE", role: "RACE" },
  ]),
  c("curse-echoing-doubt", "Curse! Echoing Doubt", 2, "MID", [
    { type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 2 },
  ]),
  c("curse-total-recall", "Curse! Total Recall", 3, "LATE", [
    { type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 3 },
  ]),
  c("curse-collapsing-wardrobe", "Curse! Collapsing Wardrobe", 3, "LATE", [
    { type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 2 },
  ]),
];

const coreRoles: readonly Entry[] = [
  r(
    "guild-of-echoes",
    "Guild of Echoes",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
  ),
  r("cartographers-circle", "Cartographers' Circle", "CLASS", {
    type: "RUN_AWAY_ROLL",
    amount: 1,
    conditions: [],
  }),
  r(
    "scrap-knights",
    "Scrap Knights",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
  ),
  r(
    "lantern-wardens",
    "Lantern Wardens",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
  ),
  r("lantern-folk", "Lantern Folk", "RACE", {
    type: "RUN_AWAY_ROLL",
    amount: 1,
    conditions: [],
  }),
  r(
    "mosskin",
    "Mosskin",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] },
    ]),
  ),
  r(
    "brassborn",
    "Brassborn",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
  ),
  r(
    "nightglimmers",
    "Nightglimmers",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
  ),
];

const coreEquipment: readonly Entry[] = [
  q({
    id: "spatula-of-resolve",
    name: "Spatula of Resolve",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 2,
    gold: 400,
    tags: ["WEAPON", "BLUNT"],
  }),
  q({
    id: "helmet-of-mild-foresight",
    name: "Helmet of Mild Foresight",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.HEAD,
    bonus: 1,
    gold: 300,
    tags: ["ARMOR"],
    scavenge: true,
  }),
  q({
    id: "boots-of-purposeful-squeaking",
    name: "Boots of Purposeful Squeaking",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.FEET,
    bonus: 2,
    gold: 400,
    scavenge: true,
  }),
  q({
    id: "coat-of-many-pockets",
    name: "Coat of Many Pockets",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.BODY,
    bonus: 2,
    gold: 500,
    tags: ["ARMOR"],
  }),
  q({
    id: "tin-kettle-helm",
    name: "Tin Kettle Helm",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.HEAD,
    bonus: 1,
    gold: 200,
    tags: ["ARMOR"],
  }),
  q({
    id: "mapmakers-sandals",
    name: "Mapmaker's Sandals",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.FEET,
    bonus: 1,
    gold: 200,
  }),
  q({
    id: "cardboard-plate-mail",
    name: "Cardboard Plate Mail",
    tier: 1,
    copies: 2,
    slot: EquipmentSlot.BODY,
    bonus: 3,
    gold: 600,
    tags: ["ARMOR"],
    starter: false,
  }),
  q({
    id: "pocket-cudgel",
    name: "Pocket Cudgel",
    tier: 1,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 2,
    gold: 350,
    tags: ["WEAPON", "BLUNT"],
  }),
  q({
    id: "folding-buckler",
    name: "Folding Buckler",
    tier: 1,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 2,
    gold: 450,
    tags: ["ARMOR"],
  }),
  q({
    id: "two-handed-bookmark",
    name: "Two-Handed Bookmark",
    tier: 2,
    copies: 3,
    slot: EquipmentSlot.HANDS,
    hands: 2,
    bonus: 4,
    gold: 750,
    tags: ["WEAPON", "BLADE", "MAGIC"],
    restrictions: [{ type: "CLASS", definitionId: id("guild-of-echoes") }],
  }),
  q({
    id: "compass-crown",
    name: "Compass Crown",
    tier: 2,
    copies: 3,
    slot: EquipmentSlot.HEAD,
    bonus: 3,
    gold: 650,
    tags: ["MAGIC"],
    restrictions: [{ type: "RACE", definitionId: id("lantern-folk") }],
  }),
  q({
    id: "deadline-skates",
    name: "Deadline Skates",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.FEET,
    bonus: 4,
    gold: 700,
    restrictions: [{ type: "CLASS", definitionId: id("cartographers-circle") }],
  }),
  q({
    id: "tuning-fork-rapier",
    name: "Tuning-Fork Rapier",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 3,
    gold: 650,
    tags: ["WEAPON", "BLADE", "MAGIC"],
  }),
  q({
    id: "echo-mail",
    name: "Echo Mail",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.BODY,
    bonus: 4,
    gold: 750,
    tags: ["ARMOR", "MAGIC"],
    restrictions: [{ type: "CLASS", definitionId: id("guild-of-echoes") }],
  }),
  q({
    id: "mossy-maul",
    name: "Mossy Maul",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 2,
    bonus: 5,
    gold: 800,
    tags: ["WEAPON", "BLUNT"],
    restrictions: [{ type: "RACE", definitionId: id("mosskin") }],
  }),
  q({
    id: "portable-drawbridge",
    name: "Portable Drawbridge",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 2,
    bonus: 5,
    gold: 850,
    tags: ["WEAPON", "BLUNT"],
  }),
  q({
    id: "cometglass-sabre",
    name: "Cometglass Sabre",
    tier: 3,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 6,
    gold: 1000,
    tags: ["WEAPON", "BLADE", "MAGIC"],
    restrictions: [{ type: "CLASS", definitionId: id("guild-of-echoes") }],
  }),
  q({
    id: "leviathan-hide-coat",
    name: "Leviathan-Hide Coat",
    tier: 3,
    copies: 1,
    slot: EquipmentSlot.BODY,
    bonus: 7,
    gold: 1200,
    tags: ["ARMOR"],
    restrictions: [{ type: "RACE", definitionId: id("mosskin") }],
  }),
  q({
    id: "oracular-stilts",
    name: "Oracular Stilts",
    tier: 3,
    copies: 1,
    slot: EquipmentSlot.FEET,
    bonus: 5,
    gold: 900,
    tags: ["MAGIC"],
  }),
  q({
    id: "crown-of-last-words",
    name: "Crown of Last Words",
    tier: 3,
    copies: 1,
    slot: EquipmentSlot.HEAD,
    bonus: 6,
    gold: 1100,
    tags: ["MAGIC"],
    restrictions: [{ type: "RACE", definitionId: id("lantern-folk") }],
  }),
];

const coreCombat: readonly Entry[] = [
  a({
    id: "emergency-confetti",
    name: "Emergency Confetti",
    type: CardType.TEMPORARY_BONUS,
    tier: 1,
    copies: 3,
    gold: 100,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  }),
  a({
    id: "bottled-applause",
    name: "Bottled Applause",
    type: CardType.TEMPORARY_BONUS,
    tier: 1,
    copies: 3,
    gold: 200,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 3 }],
  }),
  a({
    id: "strategic-banana-peel",
    name: "Strategic Banana Peel",
    type: CardType.TEMPORARY_BONUS,
    tier: 1,
    copies: 3,
    gold: 200,
    play: monsterTarget,
    effects: [{ type: "MONSTER_COMBAT_BONUS", amount: -3 }],
  }),
  a({
    id: "heroic-snack-break",
    name: "Heroic Snack Break",
    type: CardType.TEMPORARY_BONUS,
    tier: 2,
    copies: 3,
    gold: 300,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 4 }],
  }),
  a({
    id: "pocket-comet",
    name: "Pocket Comet",
    type: CardType.TEMPORARY_BONUS,
    tier: 2,
    copies: 3,
    gold: 400,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 5 }],
  }),
  a({
    id: "ominous-stage-light",
    name: "Ominous Stage Light",
    type: CardType.TEMPORARY_BONUS,
    tier: 2,
    copies: 3,
    gold: 300,
    play: monsterTarget,
    effects: [{ type: "MONSTER_COMBAT_BONUS", amount: 4 }],
  }),
  a({
    id: "borrowed-thunder",
    name: "Borrowed Thunder",
    type: CardType.TEMPORARY_BONUS,
    tier: 3,
    copies: 2,
    gold: 500,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 6 }],
  }),
  a({
    id: "emergency-drawbridge",
    name: "Emergency Drawbridge",
    type: CardType.TEMPORARY_BONUS,
    tier: 3,
    copies: 2,
    gold: 700,
    play: monsterTarget,
    effects: [{ type: "MONSTER_COMBAT_BONUS", amount: -8 }],
  }),
];

const coreModifiers: readonly Entry[] = [
  a({
    id: "dramatic-entrance-music",
    name: "Dramatic Entrance Music",
    type: CardType.MONSTER_MODIFIER,
    tier: 1,
    copies: 3,
    gold: 200,
    play: monsterTarget,
    effects: [{ type: "MODIFY_MONSTER", strength: 2, treasures: 0 }],
  }),
  a({
    id: "inflatable-shoulder-pads",
    name: "Inflatable Shoulder Pads",
    type: CardType.MONSTER_MODIFIER,
    tier: 1,
    copies: 3,
    gold: 300,
    play: monsterTarget,
    effects: [{ type: "MODIFY_MONSTER", strength: 4, treasures: 0 }],
  }),
  a({
    id: "mandatory-monster-nap",
    name: "Mandatory Monster Nap",
    type: CardType.MONSTER_MODIFIER,
    tier: 2,
    copies: 2,
    gold: 400,
    play: monsterTarget,
    effects: [{ type: "MODIFY_MONSTER", strength: -5, treasures: -1 }],
  }),
  a({
    id: "executive-monster-promotion",
    name: "Executive Monster Promotion",
    type: CardType.MONSTER_MODIFIER,
    tier: 3,
    copies: 2,
    gold: 500,
    play: monsterTarget,
    effects: [{ type: "MODIFY_MONSTER", strength: 5, treasures: 2 }],
  }),
  a({
    id: "open-mic-night-invitation",
    name: "Open Mic Night Invitation",
    type: CardType.ADD_MONSTER,
    tier: 2,
    copies: 2,
    deck: DeckType.DOOR,
    play: {
      timings: [CardPlayTiming.ACTIVE_COMBAT, CardPlayTiming.VICTORY_REACTION],
      target: CardPlayTarget.HAND_MONSTER,
    },
    effects: [{ type: "ADD_MONSTER_TO_COMBAT" }],
  }),
  a({
    id: "bureaucratic-carbon-copy",
    name: "Bureaucratic Carbon Copy",
    type: CardType.CLONE_MONSTER,
    tier: 3,
    copies: 2,
    deck: DeckType.DOOR,
    play: monsterTarget,
    effects: [{ type: "CLONE_COMBAT_MONSTER" }],
  }),
];
const coreUtility: readonly Entry[] = [
  a({
    id: "door-cache",
    name: "Door Cache",
    type: CardType.UTILITY,
    tier: 1,
    copies: 3,
    deck: DeckType.DOOR,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.DOOR, count: 1 }],
  }),
  a({
    id: "treasure-rumor",
    name: "Treasure Rumor",
    type: CardType.UTILITY,
    tier: 1,
    copies: 3,
    deck: DeckType.DOOR,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.TREASURE, count: 1 }],
  }),
  a({
    id: "quiet-respite",
    name: "Quiet Respite",
    type: CardType.UTILITY,
    tier: 2,
    copies: 3,
    deck: DeckType.DOOR,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.DOOR, count: 2 }],
  }),
  a({
    id: "spare-change-map",
    name: "Spare-Change Map",
    type: CardType.UTILITY,
    tier: 1,
    copies: 2,
    gold: 200,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.TREASURE, count: 1 }],
  }),
  a({
    id: "two-pocket-plan",
    name: "Two-Pocket Plan",
    type: CardType.UTILITY,
    tier: 2,
    copies: 2,
    gold: 400,
    play: ownTurn,
    effects: [
      { type: "DRAW_CARDS", deck: DeckType.DOOR, count: 1 },
      { type: "DRAW_CARDS", deck: DeckType.TREASURE, count: 1 },
    ],
  }),
  a({
    id: "grand-expedition-map",
    name: "Grand Expedition Map",
    type: CardType.UTILITY,
    tier: 3,
    copies: 2,
    gold: 800,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.TREASURE, count: 2 }],
  }),
];

function companion(
  idValue: string,
  name: string,
  kind: "HIRELING" | "MOUNT",
  tier: 1 | 2 | 3,
  bonus: number,
  modifier?: ConditionalModifierDefinition,
): Entry {
  return e(
    {
      id: idValue,
      artKey: `treasure.companion.${idValue}`,
      setId: CardSetId.COMPANIONS,
      tier,
      name,
      description: `+${bonus} companion.${modifier === undefined ? "" : ` ${modifierText(modifier)}`}`,
      type: kind === "HIRELING" ? CardType.HIRELING : CardType.MOUNT,
      deck: DeckType.TREASURE,
      tags: [],
      goldValue: 0,
      sellable: false,
      tradeable: false,
      play: ownTurn,
      effects: [],
      companion: {
        kind,
        combatBonus: bonus,
        ...(modifier === undefined ? {} : { modifier }),
      },
    },
    2,
  );
}
const companions: readonly Entry[] = [
  companion("eager-intern", "Eager Intern", "HIRELING", 1, 1),
  companion("lantern-scout", "Lantern Scout", "HIRELING", 1, 1, {
    type: "RUN_AWAY_ROLL",
    amount: 1,
    conditions: [],
  }),
  companion(
    "scrap-squire",
    "Scrap Squire",
    "HIRELING",
    1,
    1,
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
  ),
  companion("stubborn-pony", "Stubborn Pony", "MOUNT", 1, 2),
  companion(
    "archive-apprentice",
    "Archive Apprentice",
    "HIRELING",
    2,
    2,
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
  ),
  companion(
    "graveyard-guide",
    "Graveyard Guide",
    "HIRELING",
    2,
    2,
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
  ),
  companion("clockwork-goat", "Clockwork Goat", "MOUNT", 2, 3),
  companion(
    "mossback-elk",
    "Mossback Elk",
    "MOUNT",
    2,
    2,
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] },
    ]),
  ),
  companion("deadline-ostrich", "Deadline Ostrich", "MOUNT", 2, 2, {
    type: "RUN_AWAY_ROLL",
    amount: 1,
    conditions: [],
  }),
  companion("veteran-retainer", "Veteran Retainer", "HIRELING", 3, 4),
  companion("comet-stag", "Comet Stag", "MOUNT", 3, 4, {
    type: "RUN_AWAY_ROLL",
    amount: 1,
    conditions: [],
  }),
  companion(
    "leviathan-skipper",
    "Leviathan Skipper",
    "HIRELING",
    3,
    3,
    condition("COMBAT_POWER", 3, [
      { type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] },
    ]),
  ),
];

const cancelCurse: ConditionalModifierDefinition = {
  type: "AUTOMATIC_PROTECTION",
  protection: "CANCEL",
  conditions: [
    {
      type: "CURSE_MATCHES",
      severities: ["EARLY", "MID"],
      anyTag: ["HEX", "TRAP"],
    },
  ],
};
function attachment(
  idValue: string,
  name: string,
  tier: 1 | 2 | 3,
  copies: number,
  bonus: number,
  tags: readonly ("WEAPON" | "BLADE" | "BLUNT" | "MAGIC")[] = ["WEAPON"],
): Entry {
  return e(
    {
      id: idValue,
      artKey: `treasure.attachment.${idValue}`,
      setId: CardSetId.ARSENAL,
      tier,
      name,
      description: `Attach to matching weapon for +${bonus}.`,
      type: CardType.ATTACHMENT,
      deck: DeckType.TREASURE,
      tags: [],
      goldValue: tier * 200,
      play: {
        timings: [CardPlayTiming.TURN],
        target: CardPlayTarget.EQUIPMENT,
      },
      effects: [],
      attachment: { allowedTags: tags, combatBonus: bonus },
    },
    copies,
  );
}
const arsenal: readonly Entry[] = [
  attachment("sharpening-chorus", "Sharpening Chorus", 1, 3, 1),
  attachment("balanced-pommel", "Balanced Pommel", 1, 3, 2, ["BLADE"]),
  q({
    id: "hexproof-cap",
    name: "Hexproof Cap",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.HEAD,
    bonus: 1,
    gold: 350,
    tags: ["ARMOR"],
    modifier: cancelCurse,
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
  q({
    id: "beast-hunters-vest",
    name: "Beast Hunter's Vest",
    tier: 1,
    copies: 3,
    slot: EquipmentSlot.BODY,
    bonus: 1,
    gold: 400,
    tags: ["ARMOR"],
    modifier: condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] },
    ]),
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
  q({
    id: "construct-cracker",
    name: "Construct Cracker",
    tier: 1,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 2,
    gold: 450,
    tags: ["WEAPON", "BLUNT"],
    modifier: condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
  a({
    id: "smoke-pellet",
    name: "Smoke Pellet",
    type: CardType.TEMPORARY_BONUS,
    tier: 1,
    copies: 2,
    gold: 150,
    setId: CardSetId.ARSENAL,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 2 }],
  }),
  attachment("moonsteel-edge", "Moonsteel Edge", 2, 2, 3, ["BLADE"]),
  attachment("thunder-weight", "Thunder Weight", 2, 2, 3, ["BLUNT"]),
  q({
    id: "undead-surveyors-goggles",
    name: "Undead Surveyor's Goggles",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.HEAD,
    bonus: 2,
    gold: 650,
    modifier: condition("COMBAT_POWER", 3, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
  q({
    id: "arcane-grounding-boots",
    name: "Arcane Grounding Boots",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.FEET,
    bonus: 2,
    gold: 650,
    tags: ["MAGIC"],
    modifier: condition("COMBAT_POWER", 3, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
  a({
    id: "defensive-umbrella",
    name: "Defensive Umbrella",
    type: CardType.TEMPORARY_BONUS,
    tier: 2,
    copies: 2,
    gold: 350,
    setId: CardSetId.ARSENAL,
    play: monsterTarget,
    effects: [{ type: "MONSTER_COMBAT_BONUS", amount: -4 }],
  }),
  q({
    id: "escape-route-boots",
    name: "Escape Route Boots",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.FEET,
    bonus: 2,
    gold: 600,
    modifier: { type: "RUN_AWAY_ROLL", amount: 1, conditions: [] },
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
  attachment("comet-core", "Comet Core", 3, 2, 4, ["MAGIC"]),
  q({
    id: "wardens-aegis",
    name: "Warden's Aegis",
    tier: 3,
    copies: 2,
    slot: EquipmentSlot.BODY,
    bonus: 5,
    gold: 1000,
    tags: ["ARMOR", "MAGIC"],
    modifier: cancelCurse,
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
  a({
    id: "last-second-ramp",
    name: "Last-Second Ramp",
    type: CardType.TEMPORARY_BONUS,
    tier: 3,
    copies: 2,
    gold: 600,
    setId: CardSetId.ARSENAL,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 7 }],
  }),
  q({
    id: "monster-compass",
    name: "Monster Compass",
    tier: 3,
    copies: 2,
    slot: EquipmentSlot.HEAD,
    bonus: 3,
    gold: 900,
    tags: ["MAGIC"],
    modifier: condition("COMBAT_POWER", 3, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE", "UNDEAD"] },
    ]),
    setId: CardSetId.ARSENAL,
    starter: false,
  }),
];

function permission(
  idValue: string,
  name: string,
  kind: "CLASS" | "RACE",
  tier: 1 | 2 | 3,
): Entry {
  return e(
    {
      id: idValue,
      artKey: `treasure.permission.${idValue}`,
      setId: CardSetId.DUAL_IDENTITY,
      tier,
      name,
      description: `You may have a second ${kind}.`,
      type: CardType.ROLE_PERMISSION,
      deck: DeckType.TREASURE,
      tags: [],
      goldValue: 0,
      sellable: false,
      tradeable: false,
      play: ownTurn,
      effects: [],
      rolePermission: { role: kind, additionalSlots: 1 },
    },
    2,
  );
}
const dualIdentity: readonly Entry[] = [
  permission("double-major", "Double Major", "CLASS", 1),
  permission("mixed-heritage", "Mixed Heritage", "RACE", 1),
  r(
    "mirror-sages",
    "Mirror Sages",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "PLAYER_SEX_IS", sex: PlayerSex.FEMALE },
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
    CardSetId.DUAL_IDENTITY,
    1,
    2,
  ),
  r(
    "iron-chorus",
    "Iron Chorus",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "PLAYER_SEX_IS", sex: PlayerSex.MALE },
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
    CardSetId.DUAL_IDENTITY,
    1,
    2,
  ),
  permission("night-school", "Night School", "CLASS", 2),
  permission("adopted-tradition", "Adopted Tradition", "RACE", 2),
  r(
    "beast-barristers",
    "Beast Barristers",
    "CLASS",
    condition("COMBAT_POWER", 3, [
      { type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] },
    ]),
    CardSetId.DUAL_IDENTITY,
    2,
    2,
  ),
  r(
    "graveborn",
    "Graveborn",
    "RACE",
    condition("COMBAT_POWER", 3, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
    CardSetId.DUAL_IDENTITY,
    2,
    2,
  ),
  r(
    "bladesingers",
    "Bladesingers",
    "CLASS",
    {
      type: "EQUIPMENT_TAG_BONUS",
      amountPerCard: 1,
      maxCards: 2,
      tags: ["BLADE"],
      conditions: [],
    },
    CardSetId.DUAL_IDENTITY,
    2,
    2,
  ),
  permission("polymath-license", "Polymath License", "CLASS", 3),
  permission("many-roots", "Many Roots", "RACE", 3),
  r(
    "two-world-walkers",
    "Two-World Walkers",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
    CardSetId.DUAL_IDENTITY,
    3,
    2,
  ),
];

const catalog: readonly Entry[] = [
  ...coreMonsters,
  ...coreCurses,
  ...coreRoles,
  ...coreEquipment,
  ...coreCombat,
  ...coreModifiers,
  ...coreUtility,
  ...companions,
  ...arsenal,
  ...dualIdentity,
];

export function createDevelopmentCardSet(): CardSet {
  const definitions = catalog.map<CardDefinition>((item) => ({
    ...item.definition,
    id: parseCardDefinitionId(item.definition.id),
  }));
  const instances = catalog.flatMap((item, index) =>
    Array.from(
      { length: item.copies },
      (_, copy) =>
        ({
          instanceId: parseCardInstanceId(`${item.definition.id}-${copy + 1}`),
          definitionId: definitions[index]!.id,
        }) satisfies CardInstance,
    ),
  );
  const byDeck = (deck: DeckType) => {
    const ids = new Set(
      definitions
        .filter((definition) => definition.deck === deck)
        .map((definition) => definition.id),
    );
    return instances.filter((card) => ids.has(card.definitionId));
  };
  return {
    definitions,
    doorDeck: byDeck(DeckType.DOOR),
    treasureDeck: byDeck(DeckType.TREASURE),
  };
}
