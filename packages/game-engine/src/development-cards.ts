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
  type RoleActiveAbilityDefinition,
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
const combatSide = {
  timings: [CardPlayTiming.ACTIVE_COMBAT, CardPlayTiming.VICTORY_REACTION],
  target: CardPlayTarget.COMBAT_SIDE,
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
    case "COMBAT_SIDE_BONUS":
      return `${effect.amount >= 0 ? "+" : ""}${effect.amount} to the chosen combat side`;
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
    case "STEAL_RANDOM_HAND_CARD":
      return "steal one engine-random card from another player's hand";
    case "AMBUSH_MONSTERS":
      return "start combat with two engine-selected Monsters";
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
  setId?: CardSetId;
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
      setId: x.setId ?? CardSetId.CORE,
      tier: x.tier,
      name: x.name,
      description: `Strength ${x.strength}${abilityText.length > 0 ? `; ${abilityText}` : ""}. Bad Stuff: ${badText}.`,
      type: CardType.MONSTER,
      deck: DeckType.DOOR,
      tags: x.tags ?? [],
      play: {
        timings: [CardPlayTiming.WHEN_DRAWN, CardPlayTiming.POST_DOOR],
        target: CardPlayTarget.SELF,
      },
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
  setId: CardSetId = CardSetId.CORE,
  copies = 2,
): Entry {
  return e(
    {
      id: idValue,
      artKey: `door.curse.${idValue}`,
      setId,
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
    copies,
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
  activeAbility?: RoleActiveAbilityDefinition,
): Entry {
  const activeText =
    activeAbility === undefined
      ? ""
      : activeAbility.type === "DRAW_CARDS"
        ? ` Discard ${activeAbility.cost.count} hand card(s) to draw ${activeAbility.count} ${activeAbility.deck} card(s), once per turn.`
        : activeAbility.type === "RUN_AWAY_BONUS"
          ? ` Discard ${activeAbility.cost.count} hand card(s) for ${activeAbility.amount >= 0 ? "+" : ""}${activeAbility.amount} to your Run Away roll, once per combat.`
          : activeAbility.type === "STEAL_EQUIPPED_ITEM"
            ? ` Discard ${activeAbility.cost.count} hand card(s) to attempt taking one exact equipped item (${activeAbility.successChance.numerator}/${activeAbility.successChance.denominator}), once per turn.`
            : ` Discard ${activeAbility.cost.count} hand card(s) for ${activeAbility.amount >= 0 ? "+" : ""}${activeAbility.amount} to the player side, once per combat.`;
  return e(
    {
      id: idValue,
      artKey: `door.${kind.toLowerCase()}.${idValue}`,
      setId,
      tier,
      name,
      description: `${modifierText(modifier)}${activeText}`,
      type: kind === "CLASS" ? CardType.CLASS : CardType.RACE,
      deck: DeckType.DOOR,
      tags: [],
      play: ownTurn,
      effects: [],
      role: {
        role: kind,
        modifier,
        ...(activeAbility === undefined ? {} : { activeAbility }),
      },
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
    strength: 9,
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
    strength: 12,
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
    strength: 13,
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
    strength: 15,
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
    strength: 16,
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
    strength: 17,
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
    strength: 19,
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
    CardSetId.CORE,
    1,
    3,
    {
      type: "DRAW_CARDS",
      deck: DeckType.TREASURE,
      count: 2,
      target: "SELF",
      cost: { type: "DISCARD_HAND", count: 2 },
      usage: "ONCE_PER_TURN",
    },
  ),
  r(
    "cartographers-circle",
    "Cartographers' Circle",
    "CLASS",
    { type: "RUN_AWAY_ROLL", amount: 1, conditions: [] },
    CardSetId.CORE,
    1,
    3,
    {
      type: "RUN_AWAY_BONUS",
      amount: 2,
      target: "SELF",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  r(
    "scrap-knights",
    "Scrap Knights",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
    CardSetId.CORE,
    1,
    3,
    {
      type: "COMBAT_BONUS",
      amount: 3,
      target: "PLAYERS",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  r(
    "lantern-wardens",
    "Lantern Wardens",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
    CardSetId.CORE,
    1,
    3,
    {
      type: "COMBAT_BONUS",
      amount: 5,
      target: "PLAYERS",
      cost: { type: "DISCARD_HAND", count: 2 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  r(
    "lantern-folk",
    "Lantern Folk",
    "RACE",
    { type: "RUN_AWAY_ROLL", amount: 1, conditions: [] },
    CardSetId.CORE,
    1,
    3,
    {
      type: "DRAW_CARDS",
      deck: DeckType.DOOR,
      count: 1,
      target: "SELF",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_TURN",
    },
  ),
  r(
    "mosskin",
    "Mosskin",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] },
    ]),
    CardSetId.CORE,
    1,
    3,
    {
      type: "COMBAT_BONUS",
      amount: 2,
      target: "PLAYERS",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  r("brassborn", "Brassborn", "RACE", {
    type: "EQUIPMENT_TAG_BONUS",
    amountPerCard: 1,
    maxCards: 2,
    tags: ["ARMOR"],
    conditions: [],
  }),
  r(
    "nightglimmers",
    "Nightglimmers",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
    CardSetId.CORE,
    1,
    3,
    {
      type: "COMBAT_BONUS",
      amount: -2,
      target: "PLAYERS",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
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
    play: combatSide,
    effects: [{ type: "COMBAT_SIDE_BONUS", amount: 3 }],
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
    play: combatSide,
    effects: [{ type: "COMBAT_SIDE_BONUS", amount: 6 }],
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
  a({
    id: "field-commendation",
    name: "Field Commendation",
    type: CardType.UTILITY,
    tier: 2,
    copies: 2,
    gold: 400,
    play: ownTurn,
    effects: [{ type: "GAIN_LEVEL", amount: 1 }],
  }),
  a({
    id: "unwelcome-ovation",
    name: "Unwelcome Ovation",
    type: CardType.TEMPORARY_BONUS,
    tier: 2,
    copies: 2,
    gold: 300,
    play: combatSide,
    effects: [{ type: "COMBAT_SIDE_BONUS", amount: -4 }],
  }),
];

function companion(
  idValue: string,
  name: string,
  kind: "HIRELING" | "MOUNT",
  tier: 1 | 2 | 3,
  bonus: number,
  modifier?: ConditionalModifierDefinition,
  setId: CardSetId = CardSetId.COMPANIONS,
  copies = 2,
): Entry {
  return e(
    {
      id: idValue,
      artKey: `treasure.companion.${idValue}`,
      setId,
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
    copies,
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
  setId: CardSetId = CardSetId.ARSENAL,
): Entry {
  return e(
    {
      id: idValue,
      artKey: `treasure.attachment.${idValue}`,
      setId,
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

/** Original fantasy-role pack; its mechanics deliberately use the shared role and combat primitives. */
const classicFantasy: readonly Entry[] = [
  m({
    id: "barrow-tax-collector",
    name: "Barrow Tax Collector",
    tier: 1,
    copies: 2,
    strength: 4,
    treasures: 1,
    tags: ["UNDEAD"],
    bad: [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 1 }],
    setId: CardSetId.CLASSIC_FANTASY,
  }),
  m({
    id: "granite-troll",
    name: "Granite Troll",
    tier: 2,
    copies: 2,
    strength: 9,
    treasures: 2,
    tags: ["BEAST"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 }],
    modifiers: [
      condition("COMBAT_POWER", 2, [
        {
          type: "EQUIPPED_HAS_TAG",
          anyOf: ["BLUNT"],
          atLeast: 1,
          scope: "OWNER",
        },
      ]),
    ],
    setId: CardSetId.CLASSIC_FANTASY,
  }),
  m({
    id: "sunken-court-wyrm",
    name: "Sunken Court Wyrm",
    tier: 3,
    copies: 1,
    strength: 16,
    treasures: 4,
    levels: 2,
    tags: ["ARCANE", "BEAST"],
    bad: [{ type: "LOSE_LEVEL", amount: 2 }],
    setId: CardSetId.CLASSIC_FANTASY,
  }),
  c(
    "curse-oath-tangle",
    "Curse! Oath Tangle",
    1,
    "EARLY",
    [{ type: "DISCARD_ROLE", role: "CLASS" }],
    CardType.CURSE,
    CardSetId.CLASSIC_FANTASY,
  ),
  c(
    "curse-mudbound-boots",
    "Combat Curse! Mudbound Boots",
    2,
    "MID",
    [{ type: "COMBAT_BONUS", amount: -4 }],
    CardType.COMBAT_CURSE,
    CardSetId.CLASSIC_FANTASY,
  ),
  r(
    "oathbound-vanguard",
    "Oathbound Vanguard",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
    CardSetId.CLASSIC_FANTASY,
    1,
    2,
    {
      type: "COMBAT_BONUS",
      amount: 3,
      target: "PLAYERS",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  r(
    "hedge-conclave",
    "Hedge Conclave",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
    CardSetId.CLASSIC_FANTASY,
    1,
    2,
    {
      type: "DRAW_CARDS",
      deck: DeckType.DOOR,
      count: 1,
      target: "SELF",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_TURN",
    },
  ),
  r(
    "riverkin",
    "Riverkin",
    "RACE",
    { type: "RUN_AWAY_ROLL", amount: 1, conditions: [] },
    CardSetId.CLASSIC_FANTASY,
    1,
    2,
    {
      type: "RUN_AWAY_BONUS",
      amount: 2,
      target: "SELF",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  r(
    "stonefolk",
    "Stonefolk",
    "RACE",
    {
      type: "EQUIPMENT_TAG_BONUS",
      amountPerCard: 1,
      maxCards: 2,
      tags: ["ARMOR"],
      conditions: [],
    },
    CardSetId.CLASSIC_FANTASY,
    1,
    2,
  ),
  q({
    id: "amberwood-bow",
    name: "Amberwood Bow",
    tier: 1,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 2,
    gold: 450,
    tags: ["WEAPON", "MAGIC"],
    setId: CardSetId.CLASSIC_FANTASY,
    starter: false,
  }),
  q({
    id: "lantern-scale-coat",
    name: "Lantern-Scale Coat",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.BODY,
    bonus: 3,
    gold: 650,
    tags: ["ARMOR"],
    modifier: condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
    setId: CardSetId.CLASSIC_FANTASY,
    starter: false,
  }),
  q({
    id: "cairn-cleaver",
    name: "Cairn Cleaver",
    tier: 3,
    copies: 1,
    slot: EquipmentSlot.HANDS,
    hands: 2,
    bonus: 5,
    gold: 950,
    tags: ["WEAPON", "BLADE"],
    setId: CardSetId.CLASSIC_FANTASY,
    starter: false,
  }),
  a({
    id: "banner-of-daring",
    name: "Banner of Daring",
    type: CardType.TEMPORARY_BONUS,
    tier: 1,
    copies: 2,
    gold: 200,
    setId: CardSetId.CLASSIC_FANTASY,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 3 }],
  }),
  a({
    id: "sorcerers-gale",
    name: "Sorcerer's Gale",
    type: CardType.TEMPORARY_BONUS,
    tier: 2,
    copies: 3,
    gold: 350,
    setId: CardSetId.CLASSIC_FANTASY,
    play: combatSide,
    effects: [{ type: "COMBAT_SIDE_BONUS", amount: 4 }],
  }),
  a({
    id: "rally-the-giant",
    name: "Rally the Giant",
    type: CardType.MONSTER_MODIFIER,
    tier: 2,
    copies: 3,
    gold: 300,
    setId: CardSetId.CLASSIC_FANTASY,
    play: monsterTarget,
    effects: [{ type: "MODIFY_MONSTER", strength: 3, treasures: 1 }],
  }),
  a({
    id: "old-road-cache",
    name: "Old Road Cache",
    type: CardType.UTILITY,
    tier: 1,
    copies: 2,
    deck: DeckType.DOOR,
    setId: CardSetId.CLASSIC_FANTASY,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.TREASURE, count: 1 }],
  }),
];

/** Original music-and-workshop pack, centered on role variety and item enhancers. */
const clericalErrors: readonly Entry[] = [
  m({
    id: "choir-looting-gargoyle",
    name: "Choir-Looting Gargoyle",
    tier: 1,
    copies: 2,
    strength: 5,
    treasures: 2,
    tags: ["CONSTRUCT"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "HAND", count: 1 }],
    setId: CardSetId.CLERICAL_ERRORS,
  }),
  m({
    id: "bell-tower-wraith",
    name: "Bell Tower Wraith",
    tier: 2,
    copies: 2,
    strength: 10,
    treasures: 3,
    tags: ["UNDEAD"],
    bad: [{ type: "DISCARD_ROLE", role: "RACE" }],
    setId: CardSetId.CLERICAL_ERRORS,
  }),
  m({
    id: "organ-grinder-hydra",
    name: "Organ-Grinder Hydra",
    tier: 3,
    copies: 1,
    strength: 15,
    treasures: 4,
    levels: 2,
    tags: ["BEAST", "ARCANE"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 2 }],
    setId: CardSetId.CLERICAL_ERRORS,
  }),
  c(
    "curse-cracked-hymnal",
    "Curse! Cracked Hymnal",
    1,
    "EARLY",
    [{ type: "DISCARD_RANDOM_CARDS", zone: "HAND", count: 2 }],
    CardType.CURSE,
    CardSetId.CLERICAL_ERRORS,
  ),
  r(
    "hearth-cantors",
    "Hearth Cantors",
    "CLASS",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["UNDEAD"] },
    ]),
    CardSetId.CLERICAL_ERRORS,
    1,
    2,
    {
      type: "COMBAT_BONUS",
      amount: 2,
      target: "PLAYERS",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  r(
    "candle-scribes",
    "Candle Scribes",
    "CLASS",
    { type: "RUN_AWAY_ROLL", amount: 1, conditions: [] },
    CardSetId.CLERICAL_ERRORS,
    1,
    2,
    {
      type: "DRAW_CARDS",
      deck: DeckType.TREASURE,
      count: 1,
      target: "SELF",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_TURN",
    },
  ),
  r(
    "tinker-gnomes",
    "Tinker Gnomes",
    "RACE",
    {
      type: "EQUIPMENT_TAG_BONUS",
      amountPerCard: 1,
      maxCards: 2,
      tags: ["WEAPON"],
      conditions: [],
    },
    CardSetId.CLERICAL_ERRORS,
    1,
    2,
  ),
  r(
    "moss-gnomes",
    "Moss Gnomes",
    "RACE",
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["BEAST"] },
    ]),
    CardSetId.CLERICAL_ERRORS,
    1,
    2,
    {
      type: "RUN_AWAY_BONUS",
      amount: 2,
      target: "SELF",
      cost: { type: "DISCARD_HAND", count: 1 },
      usage: "ONCE_PER_COMBAT",
    },
  ),
  q({
    id: "chimeblade",
    name: "Chimeblade",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.HANDS,
    hands: 1,
    bonus: 3,
    gold: 650,
    tags: ["WEAPON", "BLADE", "MAGIC"],
    setId: CardSetId.CLERICAL_ERRORS,
    starter: false,
  }),
  q({
    id: "pocket-vestry",
    name: "Pocket Vestry",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.BODY,
    bonus: 2,
    gold: 600,
    tags: ["ARMOR", "MAGIC"],
    modifier: cancelCurse,
    setId: CardSetId.CLERICAL_ERRORS,
    starter: false,
  }),
  q({
    id: "resonance-satchel",
    name: "Resonance Satchel",
    tier: 2,
    copies: 2,
    slot: EquipmentSlot.BODY,
    bonus: 2,
    gold: 650,
    tags: ["ARMOR", "MAGIC"],
    modifier: {
      type: "EQUIPMENT_TAG_BONUS",
      amountPerCard: 1,
      maxCards: 2,
      tags: ["MAGIC"],
      conditions: [],
    },
    setId: CardSetId.CLERICAL_ERRORS,
    starter: false,
  }),
  attachment(
    "resonant-rivet",
    "Resonant Rivet",
    1,
    2,
    2,
    ["WEAPON"],
    CardSetId.CLERICAL_ERRORS,
  ),
  attachment(
    "saints-polish",
    "Saint's Polish",
    2,
    2,
    3,
    ["MAGIC"],
    CardSetId.CLERICAL_ERRORS,
  ),
  a({
    id: "encore-of-courage",
    name: "Encore of Courage",
    type: CardType.TEMPORARY_BONUS,
    tier: 1,
    copies: 2,
    gold: 250,
    setId: CardSetId.CLERICAL_ERRORS,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 3 }],
  }),
  a({
    id: "misfiled-prophecy",
    name: "Misfiled Prophecy",
    type: CardType.MONSTER_MODIFIER,
    tier: 2,
    copies: 2,
    gold: 300,
    setId: CardSetId.CLERICAL_ERRORS,
    play: monsterTarget,
    effects: [{ type: "MODIFY_MONSTER", strength: -3, treasures: -1 }],
  }),
  a({
    id: "backstage-passage",
    name: "Backstage Passage",
    type: CardType.UTILITY,
    tier: 1,
    copies: 2,
    deck: DeckType.DOOR,
    setId: CardSetId.CLERICAL_ERRORS,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.DOOR, count: 1 }],
  }),
];

/** Original companion-focused pack; Hirelings and mounts use the existing public containers. */
const steedHirelings: readonly Entry[] = [
  m({
    id: "bridle-chewing-ogre",
    name: "Bridle-Chewing Ogre",
    tier: 1,
    copies: 2,
    strength: 6,
    treasures: 2,
    tags: ["BEAST"],
    bad: [{ type: "DISCARD_CHOSEN_CARDS", zone: "EQUIPMENT", count: 1 }],
    setId: CardSetId.STEED_HIRELINGS,
  }),
  m({
    id: "stable-ghost",
    name: "Stable Ghost",
    tier: 2,
    copies: 2,
    strength: 10,
    treasures: 3,
    tags: ["UNDEAD"],
    bad: [{ type: "DISCARD_ROLE", role: "CLASS" }],
    setId: CardSetId.STEED_HIRELINGS,
  }),
  m({
    id: "thunderhoof-giant",
    name: "Thunderhoof Giant",
    tier: 3,
    copies: 1,
    strength: 17,
    treasures: 4,
    levels: 2,
    tags: ["BEAST"],
    bad: [{ type: "DEATH" }],
    setId: CardSetId.STEED_HIRELINGS,
  }),
  c(
    "curse-loose-stirrup",
    "Combat Curse! Loose Stirrup",
    1,
    "EARLY",
    [{ type: "COMBAT_BONUS", amount: -3 }],
    CardType.COMBAT_CURSE,
    CardSetId.STEED_HIRELINGS,
  ),
  companion(
    "mule-cartographer",
    "Mule Cartographer",
    "HIRELING",
    1,
    1,
    undefined,
    CardSetId.STEED_HIRELINGS,
  ),
  companion(
    "reed-runner",
    "Reed Runner",
    "MOUNT",
    1,
    2,
    { type: "RUN_AWAY_ROLL", amount: 1, conditions: [] },
    CardSetId.STEED_HIRELINGS,
  ),
  companion(
    "saddle-sage",
    "Saddle Sage",
    "HIRELING",
    2,
    2,
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["ARCANE"] },
    ]),
    CardSetId.STEED_HIRELINGS,
  ),
  companion(
    "brass-stablehand",
    "Brass Stablehand",
    "HIRELING",
    2,
    2,
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
    CardSetId.STEED_HIRELINGS,
  ),
  companion(
    "iron-mane-ram",
    "Iron-Mane Ram",
    "MOUNT",
    2,
    3,
    condition("COMBAT_POWER", 2, [
      { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
    ]),
    CardSetId.STEED_HIRELINGS,
  ),
  companion(
    "dawn-courier",
    "Dawn Courier",
    "HIRELING",
    3,
    3,
    { type: "RUN_AWAY_ROLL", amount: 1, conditions: [] },
    CardSetId.STEED_HIRELINGS,
  ),
  companion(
    "skybridge-elk",
    "Skybridge Elk",
    "MOUNT",
    3,
    4,
    undefined,
    CardSetId.STEED_HIRELINGS,
  ),
  q({
    id: "trailward-saddlebag",
    name: "Trailward Saddlebag",
    tier: 1,
    copies: 2,
    slot: EquipmentSlot.BODY,
    bonus: 2,
    gold: 450,
    tags: ["ARMOR"],
    setId: CardSetId.STEED_HIRELINGS,
    starter: false,
  }),
  a({
    id: "mounted-charge",
    name: "Mounted Charge",
    type: CardType.TEMPORARY_BONUS,
    tier: 2,
    copies: 2,
    gold: 350,
    setId: CardSetId.STEED_HIRELINGS,
    play: players,
    effects: [{ type: "COMBAT_BONUS", amount: 4 }],
  }),
  a({
    id: "spook-the-herd",
    name: "Spook the Herd",
    type: CardType.MONSTER_MODIFIER,
    tier: 2,
    copies: 3,
    gold: 350,
    setId: CardSetId.STEED_HIRELINGS,
    play: monsterTarget,
    effects: [{ type: "MODIFY_MONSTER", strength: 4, treasures: 1 }],
  }),
  a({
    id: "waystation-gossip",
    name: "Waystation Gossip",
    type: CardType.UTILITY,
    tier: 1,
    copies: 2,
    deck: DeckType.DOOR,
    setId: CardSetId.STEED_HIRELINGS,
    play: ownTurn,
    effects: [{ type: "DRAW_CARDS", deck: DeckType.TREASURE, count: 1 }],
  }),
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
  ...classicFantasy,
  ...clericalErrors,
  ...steedHirelings,
  e(
    {
      id: "quiet-acquisition-office",
      artKey: "door.class.quiet-acquisition-office",
      setId: CardSetId.CLERICAL_ERRORS,
      tier: 2,
      name: "Quiet Acquisition Office",
      description:
        "+2 against Constructs. Discard 1 hand card to attempt taking one exact equipped item (2/6), once per turn.",
      type: CardType.CLASS,
      deck: DeckType.DOOR,
      tags: [],
      play: ownTurn,
      effects: [],
      role: {
        role: "CLASS",
        modifier: condition("COMBAT_POWER", 2, [
          { type: "MONSTER_HAS_TAG", anyOf: ["CONSTRUCT"] },
        ]),
        activeAbility: {
          type: "STEAL_EQUIPPED_ITEM",
          target: "EQUIPMENT",
          successChance: { numerator: 2, denominator: 6 },
          cost: { type: "DISCARD_HAND", count: 1 },
          usage: "ONCE_PER_TURN",
        },
      },
    },
    2,
  ),
  a({
    id: "wrong-pocket-courier",
    name: "Wrong-Pocket Courier",
    type: CardType.UTILITY,
    tier: 2,
    copies: 3,
    deck: DeckType.TREASURE,
    gold: 300,
    setId: CardSetId.CLERICAL_ERRORS,
    play: { timings: [CardPlayTiming.TURN], target: CardPlayTarget.ANY_PLAYER },
    effects: [{ type: "STEAL_RANDOM_HAND_CARD" }],
  }),
  e(
    {
      id: "crossed-door-signals",
      artKey: "door.action.crossed-door-signals",
      setId: CardSetId.CORE,
      tier: 2,
      name: "Crossed Door Signals",
      description: "When opened, two engine-selected Monsters arrive together.",
      type: CardType.UTILITY,
      deck: DeckType.DOOR,
      tags: [],
      play: {
        timings: [CardPlayTiming.WHEN_DRAWN],
        target: CardPlayTarget.SELF,
      },
      effects: [{ type: "AMBUSH_MONSTERS", count: 2 }],
      requiredGameOption: "DOUBLE_MONSTER_AMBUSH",
    },
    2,
  ),
  e(
    {
      id: "stacked-hat-rail",
      artKey: "treasure.equipment.stacked-hat-rail",
      setId: CardSetId.ARSENAL,
      tier: 2,
      name: "Stacked Hat Rail",
      description: "+1 body Equipment. Grants one additional Head capacity.",
      type: CardType.EQUIPMENT,
      deck: DeckType.TREASURE,
      tags: ["ARMOR"],
      goldValue: 500,
      starterEligible: false,
      play: ownTurn,
      effects: [],
      capacityModifiers: [{ capacity: "HEAD", amount: 1 }],
      equipment: { slot: EquipmentSlot.BODY, hands: 0, combatBonus: 1 },
    },
    2,
  ),
  e(
    {
      id: "foldout-grip-harness",
      artKey: "treasure.equipment.foldout-grip-harness",
      setId: CardSetId.ARSENAL,
      tier: 2,
      name: "Foldout Grip Harness",
      description: "+1 body Equipment. Grants one additional Hand capacity.",
      type: CardType.EQUIPMENT,
      deck: DeckType.TREASURE,
      tags: ["ARMOR"],
      goldValue: 500,
      starterEligible: false,
      play: ownTurn,
      effects: [],
      capacityModifiers: [{ capacity: "HANDS", amount: 1 }],
      equipment: { slot: EquipmentSlot.BODY, hands: 0, combatBonus: 1 },
    },
    2,
  ),
  e(
    {
      id: "roster-clerk",
      artKey: "treasure.companion.roster-clerk",
      setId: CardSetId.STEED_HIRELINGS,
      tier: 2,
      name: "Roster Clerk",
      description: "+1 companion. Grants one additional Hireling capacity.",
      type: CardType.HIRELING,
      deck: DeckType.TREASURE,
      tags: [],
      goldValue: 0,
      sellable: false,
      tradeable: false,
      play: ownTurn,
      effects: [],
      capacityModifiers: [{ capacity: "HIRELING", amount: 1 }],
      companion: { kind: "HIRELING", combatBonus: 1 },
    },
    2,
  ),
  e(
    {
      id: "caravan-wrangler",
      artKey: "treasure.companion.caravan-wrangler",
      setId: CardSetId.STEED_HIRELINGS,
      tier: 2,
      name: "Caravan Wrangler",
      description: "+1 companion. Grants one additional Mount capacity.",
      type: CardType.MOUNT,
      deck: DeckType.TREASURE,
      tags: [],
      goldValue: 0,
      sellable: false,
      tradeable: false,
      play: ownTurn,
      effects: [],
      capacityModifiers: [{ capacity: "MOUNT", amount: 1 }],
      companion: { kind: "MOUNT", combatBonus: 1 },
    },
    2,
  ),
];

export function validateProductionCardDefinitions(
  definitions: readonly CardDefinition[],
): void {
  const errors: string[] = [];
  const require = (
    definition: CardDefinition,
    conditionValue: boolean,
    message: string,
  ) => {
    if (!conditionValue) errors.push(`${definition.id}: ${message}`);
  };
  for (const definition of definitions) {
    require(definition, definition.artKey.trim().length > 0, "missing art key");
    require(definition, definition.name.trim().length > 0, "missing name");
    for (const modifier of definition.capacityModifiers ?? [])
      require(definition, Number.isSafeInteger(modifier.amount) &&
        modifier.amount !== 0, "capacity modifier has an invalid amount");
    require(definition, definition.play !== undefined &&
      definition.play.timings.length >
        0, "action has no typed timing/target metadata");
    switch (definition.type) {
      case CardType.MONSTER:
        require(definition, definition.monster !==
          undefined, "missing Monster rules");
        require(definition, definition.play?.timings.includes(
          CardPlayTiming.POST_DOOR,
        ) === true &&
          definition.play.target ===
            CardPlayTarget.SELF, "missing Look-for-Trouble timing/target metadata");
        break;
      case CardType.CURSE:
      case CardType.COMBAT_CURSE:
        require(definition, definition.curse !==
          undefined, "missing Curse severity");
        require(definition, definition.effects.length >
          0, "missing Curse effects");
        break;
      case CardType.EQUIPMENT:
        require(definition, definition.equipment !==
          undefined, "missing Equipment rules");
        break;
      case CardType.CLASS:
      case CardType.RACE:
        require(definition, definition.role?.role ===
          definition.type, "missing or mismatched role rules");
        require(definition, definition.role?.modifier !== undefined ||
          definition.role?.activeAbility !==
            undefined, "role has neither a passive nor an active ability");
        if (definition.role?.activeAbility !== undefined) {
          const ability = definition.role.activeAbility;
          require(definition, Number.isSafeInteger(ability.cost.count) &&
            ability.cost.count >
              0, "role ability has an invalid hand-card cost");
          require(definition, ability.type === "DRAW_CARDS"
            ? Number.isSafeInteger(ability.count) && ability.count > 0
            : ability.type === "STEAL_EQUIPPED_ITEM"
              ? Number.isSafeInteger(ability.successChance.numerator) &&
                Number.isSafeInteger(ability.successChance.denominator) &&
                ability.successChance.numerator > 0 &&
                ability.successChance.numerator <
                  ability.successChance.denominator
              : ability.amount !== 0, "role ability has no meaningful result");
        }
        break;
      case CardType.HIRELING:
      case CardType.MOUNT:
        require(definition, definition.companion !==
          undefined, "missing companion rules");
        break;
      case CardType.ROLE_PERMISSION:
        require(definition, definition.rolePermission !==
          undefined, "missing role-permission rules");
        break;
      case CardType.ATTACHMENT:
        require(definition, definition.attachment !==
          undefined, "missing attachment rules");
        break;
      case CardType.TEMPORARY_BONUS: {
        require(definition, definition.effects.length >
          0, "missing combat effect");
        const effectTypes = new Set(
          definition.effects.map((effect) => effect.type),
        );
        const expectedTarget = effectTypes.has("COMBAT_SIDE_BONUS")
          ? CardPlayTarget.COMBAT_SIDE
          : effectTypes.has("COMBAT_BONUS")
            ? CardPlayTarget.COMBAT_PLAYERS
            : CardPlayTarget.MONSTER_ENCOUNTER;
        require(definition, effectTypes.size === 1 &&
          definition.play?.target ===
            expectedTarget, "combat effect and authored side target do not agree");
        break;
      }
      case CardType.MONSTER_MODIFIER:
      case CardType.CLONE_MONSTER:
        require(definition, definition.play?.target ===
          CardPlayTarget.MONSTER_ENCOUNTER &&
          definition.effects.length >
            0, "missing exact Monster target/effect metadata");
        break;
      case CardType.ADD_MONSTER:
        require(definition, definition.play?.target ===
          CardPlayTarget.HAND_MONSTER &&
          definition.effects.length >
            0, "missing hand-Monster target/effect metadata");
        break;
      case CardType.UTILITY:
        require(definition, definition.effects.length >
          0, "missing utility effects");
        break;
    }
  }
  if (errors.length > 0)
    throw new TypeError(
      `Invalid production card catalog:\n${errors.join("\n")}`,
    );
}

function validateProductionCatalog(entries: readonly Entry[]): void {
  const definitionIds = new Set<string>();
  const artKeys = new Set<string>();
  const errors: string[] = [];
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.copies) || entry.copies < 1)
      errors.push(`${entry.definition.id}: invalid physical copy count`);
    if (definitionIds.has(entry.definition.id))
      errors.push(`${entry.definition.id}: duplicate definition id`);
    if (artKeys.has(entry.definition.artKey))
      errors.push(`${entry.definition.id}: duplicate art key`);
    definitionIds.add(entry.definition.id);
    artKeys.add(entry.definition.artKey);
  }
  if (errors.length > 0)
    throw new TypeError(
      `Invalid production card copies:\n${errors.join("\n")}`,
    );
}

export function createDevelopmentCardSet(): CardSet {
  validateProductionCatalog(catalog);
  const definitions = catalog.map<CardDefinition>((item) => ({
    ...item.definition,
    id: parseCardDefinitionId(item.definition.id),
  }));
  validateProductionCardDefinitions(definitions);
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
