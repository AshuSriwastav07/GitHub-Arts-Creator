/**
 * Seeded PRNG utilities. Every generator must derive all randomness from the
 * numeric `seed` via these helpers so identical inputs yield identical bytes.
 */

/** mulberry32 — tiny, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive a per-style/per-feature seed from the master seed. */
export function derivedSeed(masterSeed: number, salt: string): number {
  return (fnv1a(salt) ^ Math.imul(masterSeed >>> 0, 0x9e3779b1)) >>> 0;
}

export class Rng {
  private nextFloat: () => number;

  constructor(seed: number) {
    this.nextFloat = mulberry32(seed);
  }

  float(): number {
    return this.nextFloat();
  }

  range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1 - Number.EPSILON));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.nextFloat() * arr.length))];
  }
}
