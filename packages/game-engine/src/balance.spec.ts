import { describe, expect, it } from "vitest";
import { CardSetId, simulateBalance } from "./index.js";

describe("balance harness", () => {
  it("is deterministic and exercises every metric in a small CI run", () => {
    const options = {
      seed: 12345,
      iterations: 500,
      enabledSetIds: [CardSetId.CORE],
    } as const;
    const first = simulateBalance(options);
    expect(simulateBalance(options)).toEqual(first);
    expect(first.catalog.CORE).toEqual({ definitions: 80, physicalCards: 192 });
    expect(first.doorTierDistribution.LEVEL_1_3[2]).toBe(0);
    expect(first.usableStartingEquipmentProbability).toBe(1);
    expect(first.weakTierOneSoloBeatability).toBeGreaterThan(0.5);
    expect(first.earlyPermanentDestructionRate).toBeLessThan(0.05);
    expect(first.averageMonsterRewardByTier[2]).toBeGreaterThan(
      first.averageMonsterRewardByTier[0]!,
    );
    expect(first.economy.averageGoldPerWonCombat).toBeGreaterThan(0);
  });
});
