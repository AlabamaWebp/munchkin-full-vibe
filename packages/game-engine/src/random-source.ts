export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

const UINT32_RANGE = 0x1_0000_0000;

function validateMaximum(maxExclusive: number): void {
  if (
    !Number.isSafeInteger(maxExclusive) ||
    maxExclusive <= 0 ||
    maxExclusive > UINT32_RANGE
  ) {
    throw new RangeError(
      `maxExclusive must be a positive safe integer no greater than ${UINT32_RANGE}.`,
    );
  }
}

export function createSeededRandomSource(seed: number): RandomSource {
  if (!Number.isSafeInteger(seed)) {
    throw new TypeError("Random seed must be a safe integer.");
  }

  let state = seed >>> 0;

  return {
    nextInt(maxExclusive: number): number {
      validateMaximum(maxExclusive);

      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      const unitValue = ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;

      return Math.floor(unitValue * maxExclusive);
    },
  };
}
