/**
 * Small seedable PRNG (mulberry32) plus a handful of sampling helpers built
 * on top of it. Deliberately hand-rolled instead of pulling in a random/
 * fixtures library: the whole point of `--seed 42` reproducing the same
 * dataset is undermined the moment reproducibility depends on a third-party
 * package's internal algorithm staying byte-identical across versions.
 *
 * Every seed generator (see ../generators/*) is written to draw from exactly
 * one `DeterministicRng` instance, in a fixed order, so "same seed + same
 * config → same dataset" holds for the whole pipeline, not just one table.
 */
export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    // mulberry32 wants a 32-bit integer seed; Math.imul below keeps every
    // subsequent step inside uint32 space regardless of what's passed in.
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive on both ends. */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** True with probability `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Picks one element uniformly at random. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('DeterministicRng.pick: cannot pick from an empty array');
    }
    return items[this.nextInt(0, items.length - 1)];
  }

  /**
   * Picks one item honoring relative weights (weights need not sum to 1 —
   * they're normalized internally). Used for every "distribution" in
   * SeedConfig (KYC status, activity profile, currency, remittance status).
   */
  weightedPick<T>(entries: readonly { value: T; weight: number }[]): T {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) {
      throw new Error('DeterministicRng.weightedPick: weights must sum to more than 0');
    }
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.value;
    }
    // Floating-point edge case (roll never quite reaches 0) — last entry.
    return entries[entries.length - 1].value;
  }

  /** Fisher-Yates shuffle; returns a new array, does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * A deterministic, RFC-4122-shaped v4 UUID string. Deliberately used
   * instead of `AccountId.generate()`/uuidv7() (which draws from the
   * platform's real random source, not this seed) for every entity id the
   * seed creates — see docs/seed.md's "Determinism" section. Still passes
   * `uuidValidate()` (any version's bit pattern does), so it's accepted
   * anywhere an `*Id.from(...)` call is used.
   */
  uuid(): string {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = this.nextInt(0, 255);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
