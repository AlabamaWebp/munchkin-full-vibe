import {
  CardSetId,
  CardType,
  type CardDefinition,
  type CardSetId as CardSetIdType,
  type CardTier,
} from "./cards.js";
import { createDevelopmentCardSet } from "./development-cards.js";
import {
  BALANCED_TREASURE_WEIGHTS,
  doorWeightsForLevel,
  type TierWeights,
} from "./deck.js";

export interface BalanceSimulationOptions {
  readonly seed: number;
  readonly iterations: number;
  readonly enabledSetIds?: readonly CardSetIdType[];
}

export interface BalanceSimulationReport {
  readonly seed: number;
  readonly iterations: number;
  readonly catalog: Readonly<
    Record<CardSetIdType, { definitions: number; physicalCards: number }>
  >;
  readonly doorTierDistribution: Readonly<
    Record<"LEVEL_1_3" | "LEVEL_4_6" | "LEVEL_7_9", readonly number[]>
  >;
  readonly treasureTierDistribution: Readonly<
    Record<"T1_ENCOUNTER" | "T2_ENCOUNTER" | "T3_ENCOUNTER", readonly number[]>
  >;
  readonly usableStartingEquipmentProbability: number;
  readonly startingRestrictionUnusableRate: number;
  readonly weakTierOneSoloBeatability: number;
  readonly doorMonsterBeatability: Readonly<
    Record<"LEVEL_1_3" | "LEVEL_4_6" | "LEVEL_7_9", number>
  >;
  readonly earlyPermanentDestructionRate: number;
  readonly consecutiveEarlyCurseDestructionRate: number;
  readonly averageMonsterRewardByTier: readonly number[];
  readonly averageEquipmentPower: readonly {
    tier: CardTier;
    slot: string;
    hands: number;
    averageBonus: number;
  }[];
  readonly noPlausibleRecoveryRate: number;
  readonly economy: {
    readonly averageGoldPerTreasure: number;
    readonly averageGoldPerWonCombat: number;
    readonly twoSaleLevelsFromOneRewardRate: number;
  };
  readonly methodology: "SEEDED_SCENARIO_SAMPLING";
}

class Random {
  private value: number;
  constructor(seed: number) {
    this.value = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let x = this.value;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.value = x >>> 0;
    return this.value / 0x1_0000_0000;
  }
  int(max: number): number {
    return Math.floor(this.next() * max);
  }
}

const bands = [
  { key: "LEVEL_1_3" as const, level: 2, power: [2, 7] as const },
  { key: "LEVEL_4_6" as const, level: 5, power: [9, 16] as const },
  { key: "LEVEL_7_9" as const, level: 8, power: [17, 23] as const },
];

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
function weightedTier(
  random: Random,
  weights: TierWeights,
  available: ReadonlySet<CardTier>,
): CardTier {
  const tiers = ([1, 2, 3] as const).filter(
    (tier) => available.has(tier) && weights[tier] > 0,
  );
  const candidates =
    tiers.length > 0
      ? tiers
      : ([1, 2, 3] as const).filter((tier) => available.has(tier));
  const total = candidates.reduce(
    (sum, tier) => sum + (tiers.length > 0 ? weights[tier] : 1),
    0,
  );
  let cursor = random.next() * total;
  for (const tier of candidates) {
    cursor -= tiers.length > 0 ? weights[tier] : 1;
    if (cursor < 0) return tier;
  }
  return candidates.at(-1) ?? 1;
}

function physicalDefinitions(
  definitions: readonly CardDefinition[],
  cards: readonly { definitionId: CardDefinition["id"] }[],
): readonly CardDefinition[] {
  const byId = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  return cards.map((card) => byId.get(card.definitionId)!).filter(Boolean);
}
function sample(
  random: Random,
  pool: readonly CardDefinition[],
  weights: TierWeights,
): CardDefinition {
  const available = new Set(pool.map((definition) => definition.tier));
  const tier = weightedTier(random, weights, available);
  const tierPool = pool.filter((definition) => definition.tier === tier);
  return tierPool[random.int(tierPool.length)]!;
}
function distribution(
  counts: readonly number[],
  total: number,
): readonly number[] {
  return counts.map((count) => round(count / Math.max(1, total)));
}
function permanentDestruction(definition: CardDefinition): boolean {
  return definition.effects.some(
    (effect) =>
      effect.type === "DISCARD_ROLE" ||
      (effect.type === "DISCARD_CHOSEN_CARDS" && effect.zone === "EQUIPMENT"),
  );
}

export function simulateBalance(
  options: BalanceSimulationOptions,
): BalanceSimulationReport {
  if (!Number.isInteger(options.iterations) || options.iterations < 100)
    throw new RangeError("Balance simulation needs at least 100 iterations.");
  const random = new Random(options.seed);
  const set = createDevelopmentCardSet();
  const enabled = new Set(options.enabledSetIds ?? [CardSetId.CORE]);
  const definitions = set.definitions.filter((definition) =>
    enabled.has(definition.setId),
  );
  const ids = new Set(definitions.map((definition) => definition.id));
  const door = physicalDefinitions(
    definitions,
    set.doorDeck.filter((card) => ids.has(card.definitionId)),
  );
  const treasure = physicalDefinitions(
    definitions,
    set.treasureDeck.filter((card) => ids.has(card.definitionId)),
  );
  const monsters = door.filter(
    (definition) => definition.type === CardType.MONSTER,
  );
  const equipment = treasure.filter(
    (definition) => definition.type === CardType.EQUIPMENT,
  );
  const positiveBonuses = treasure.filter(
    (definition) =>
      definition.type === CardType.TEMPORARY_BONUS &&
      definition.effects.some(
        (effect) => effect.type === "COMBAT_BONUS" && effect.amount > 0,
      ),
  );
  const starters = equipment.filter(
    (definition) => definition.starterEligible === true,
  );

  const doorDistributions = {} as Record<
    (typeof bands)[number]["key"],
    readonly number[]
  >;
  const beatability = {} as Record<(typeof bands)[number]["key"], number>;
  let noRecovery = 0;
  let monsterScenarios = 0;
  for (const band of bands) {
    const counts = [0, 0, 0];
    let fights = 0;
    let wins = 0;
    for (let index = 0; index < options.iterations; index += 1) {
      const card = sample(random, door, doorWeightsForLevel(band.level));
      counts[card.tier - 1] = (counts[card.tier - 1] ?? 0) + 1;
      if (card.monster === undefined) continue;
      fights += 1;
      monsterScenarios += 1;
      const playerPower =
        band.power[0] + random.int(band.power[1] - band.power[0] + 1);
      const heldBonus =
        random.next() < 0.45 && positiveBonuses.length > 0
          ? positiveBonuses[random.int(positiveBonuses.length)]!.effects.reduce(
              (sum, effect) =>
                effect.type === "COMBAT_BONUS"
                  ? sum + Math.max(0, effect.amount)
                  : sum,
              0,
            )
          : 0;
      if (playerPower + heldBonus > card.monster.strength) wins += 1;
      if (playerPower + Math.max(heldBonus, 3) <= card.monster.strength)
        noRecovery += 1;
    }
    doorDistributions[band.key] = distribution(counts, options.iterations);
    beatability[band.key] = round(wins / Math.max(1, fights));
  }

  const treasureDistributions = {} as Record<
    "T1_ENCOUNTER" | "T2_ENCOUNTER" | "T3_ENCOUNTER",
    readonly number[]
  >;
  for (const tier of [1, 2, 3] as const) {
    const counts = [0, 0, 0];
    for (let index = 0; index < options.iterations; index += 1) {
      const selectedTier = sample(
        random,
        treasure,
        BALANCED_TREASURE_WEIGHTS[tier],
      ).tier;
      counts[selectedTier - 1] = (counts[selectedTier - 1] ?? 0) + 1;
    }
    treasureDistributions[`T${tier}_ENCOUNTER`] = distribution(
      counts,
      options.iterations,
    );
  }

  let usableStarts = 0;
  let restrictedStartingCards = 0;
  let startingCards = 0;
  let weakWins = 0;
  const weakMonsters = monsters.filter((definition) => definition.tier === 1);
  for (let index = 0; index < options.iterations; index += 1) {
    const starter = starters[random.int(starters.length)];
    const hand = [
      starter,
      ...Array.from({ length: 3 }, () =>
        sample(random, treasure, BALANCED_TREASURE_WEIGHTS[1]),
      ),
    ].filter((card): card is CardDefinition => card !== undefined);
    if (
      hand.some(
        (card) =>
          card.type === CardType.EQUIPMENT &&
          card.tier === 1 &&
          (card.equipment?.restrictions?.length ?? 0) === 0 &&
          (card.equipment?.combatBonus ?? 0) > 0,
      )
    )
      usableStarts += 1;
    for (const card of hand) {
      startingCards += 1;
      if ((card.equipment?.restrictions?.length ?? 0) > 0)
        restrictedStartingCards += 1;
    }
    const target = weakMonsters[random.int(weakMonsters.length)]!;
    const basePower = Math.max(3, 1 + (starter?.equipment?.combatBonus ?? 0));
    const oneShot = random.next() < 0.35 ? 2 + random.int(2) : 0;
    if (basePower + oneShot > target.monster!.strength) weakWins += 1;
  }

  let destructiveEarly = 0;
  let earlyDoors = 0;
  let consecutiveDestruction = 0;
  for (let index = 0; index < options.iterations; index += 1) {
    let chainDestructive = 0;
    for (let draw = 0; draw < 3; draw += 1) {
      const card = sample(random, door, doorWeightsForLevel(1));
      if (draw === 0) {
        earlyDoors += 1;
        if (permanentDestruction(card)) destructiveEarly += 1;
      }
      if (permanentDestruction(card)) chainDestructive += 1;
    }
    if (chainDestructive >= 2) consecutiveDestruction += 1;
  }

  const rewardAverages = ([1, 2, 3] as const).map((tier) => {
    const tierMonsters = monsters.filter((monster) => monster.tier === tier);
    return round(
      tierMonsters.reduce(
        (sum, monster) => sum + monster.monster!.treasureRewards,
        0,
      ) / Math.max(1, tierMonsters.length),
    );
  });
  const groups = new Map<
    string,
    {
      tier: CardTier;
      slot: string;
      hands: number;
      total: number;
      count: number;
    }
  >();
  for (const card of equipment) {
    const slot = card.equipment!.slot;
    const hands = card.equipment!.hands ?? 0;
    const key = `${card.tier}:${slot}:${hands}`;
    const group = groups.get(key) ?? {
      tier: card.tier,
      slot,
      hands,
      total: 0,
      count: 0,
    };
    group.total += card.equipment!.combatBonus ?? 0;
    group.count += 1;
    groups.set(key, group);
  }
  const averageEquipmentPower = [...groups.values()].map((group) => ({
    tier: group.tier,
    slot: group.slot,
    hands: group.hands,
    averageBonus: round(group.total / group.count),
  }));

  let goldTotal = 0;
  for (const card of treasure) goldTotal += card.goldValue ?? 0;
  const averageGold = goldTotal / Math.max(1, treasure.length);
  let combatGold = 0;
  let multiSale = 0;
  for (let index = 0; index < options.iterations; index += 1) {
    const target = monsters[random.int(monsters.length)]!;
    let rewardGold = 0;
    for (let reward = 0; reward < target.monster!.treasureRewards; reward += 1)
      rewardGold +=
        sample(random, treasure, BALANCED_TREASURE_WEIGHTS[target.tier])
          .goldValue ?? 0;
    combatGold += rewardGold;
    if (rewardGold >= 2000) multiSale += 1;
  }

  const catalog = Object.fromEntries(
    Object.values(CardSetId).map((setId) => {
      const setDefinitions = set.definitions.filter(
        (definition) => definition.setId === setId,
      );
      const definitionIds = new Set(
        setDefinitions.map((definition) => definition.id),
      );
      const physicalCards = [...set.doorDeck, ...set.treasureDeck].filter(
        (card) => definitionIds.has(card.definitionId),
      ).length;
      return [setId, { definitions: setDefinitions.length, physicalCards }];
    }),
  ) as BalanceSimulationReport["catalog"];

  return {
    seed: options.seed,
    iterations: options.iterations,
    catalog,
    doorTierDistribution: doorDistributions,
    treasureTierDistribution: treasureDistributions,
    usableStartingEquipmentProbability: round(
      usableStarts / options.iterations,
    ),
    startingRestrictionUnusableRate: round(
      restrictedStartingCards / Math.max(1, startingCards),
    ),
    weakTierOneSoloBeatability: round(weakWins / options.iterations),
    doorMonsterBeatability: beatability,
    earlyPermanentDestructionRate: round(
      destructiveEarly / Math.max(1, earlyDoors),
    ),
    consecutiveEarlyCurseDestructionRate: round(
      consecutiveDestruction / options.iterations,
    ),
    averageMonsterRewardByTier: rewardAverages,
    averageEquipmentPower,
    noPlausibleRecoveryRate: round(noRecovery / Math.max(1, monsterScenarios)),
    economy: {
      averageGoldPerTreasure: round(averageGold),
      averageGoldPerWonCombat: round(combatGold / options.iterations),
      twoSaleLevelsFromOneRewardRate: round(multiSale / options.iterations),
    },
    methodology: "SEEDED_SCENARIO_SAMPLING",
  };
}
