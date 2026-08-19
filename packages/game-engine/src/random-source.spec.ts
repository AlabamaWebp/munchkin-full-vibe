import { describe, expect, it } from "vitest";
import { createSeededRandomSource } from "./random-source.js";

describe("createSeededRandomSource", () => {
  it("produces the same sequence from the same seed", () => {
    const first = createSeededRandomSource(42);
    const second = createSeededRandomSource(42);

    const firstSequence = Array.from({ length: 20 }, () => first.nextInt(100));
    const secondSequence = Array.from({ length: 20 }, () =>
      second.nextInt(100),
    );

    expect(firstSequence).toEqual(secondSequence);
  });

  it("produces a different sequence from a different seed", () => {
    const first = createSeededRandomSource(42);
    const second = createSeededRandomSource(43);

    const firstSequence = Array.from({ length: 10 }, () => first.nextInt(100));
    const secondSequence = Array.from({ length: 10 }, () =>
      second.nextInt(100),
    );

    expect(firstSequence).not.toEqual(secondSequence);
  });

  it("always returns an integer inside the requested half-open range", () => {
    const random = createSeededRandomSource(-1);

    for (let index = 0; index < 500; index += 1) {
      const value = random.nextInt(6);

      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it("returns zero when there is only one possible value", () => {
    const random = createSeededRandomSource(0);

    expect(random.nextInt(1)).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, 0x1_0000_0001])(
    "rejects invalid maximum %s",
    (maximum) => {
      const random = createSeededRandomSource(1);

      expect(() => random.nextInt(maximum)).toThrow(RangeError);
    },
  );

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid seed %s",
    (seed) => {
      expect(() => createSeededRandomSource(seed)).toThrow(TypeError);
    },
  );
});
