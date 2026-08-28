import { DeterministicRng } from '../../../../src/infra/seed/rng/deterministic-rng';

describe('DeterministicRng', () => {
  it('produces the exact same sequence for the same seed', () => {
    const a = new DeterministicRng(42);
    const b = new DeterministicRng(42);

    const sequenceA = Array.from({ length: 50 }, () => a.next());
    const sequenceB = Array.from({ length: 50 }, () => b.next());

    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = new DeterministicRng(42);
    const b = new DeterministicRng(43);

    const sequenceA = Array.from({ length: 20 }, () => a.next());
    const sequenceB = Array.from({ length: 20 }, () => b.next());

    expect(sequenceA).not.toEqual(sequenceB);
  });

  it('always returns floats in [0, 1)', () => {
    const rng = new DeterministicRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('nextInt respects inclusive bounds', () => {
    const rng = new DeterministicRng(7);
    for (let i = 0; i < 500; i++) {
      const value = rng.nextInt(5, 8);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(8);
    }
  });

  it('weightedPick honors relative weights over many draws', () => {
    const rng = new DeterministicRng(123);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 10_000; i++) {
      const pick = rng.weightedPick([
        { value: 'a', weight: 0.9 },
        { value: 'b', weight: 0.1 },
      ]);
      counts[pick as 'a' | 'b']++;
    }
    const ratio = counts.a / (counts.a + counts.b);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.98);
  });

  it('uuid() produces valid, deterministic RFC-4122-shaped UUIDs', () => {
    const a = new DeterministicRng(1).uuid();
    const b = new DeterministicRng(1).uuid();
    const c = new DeterministicRng(2).uuid();

    const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(a).toMatch(uuidShape);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('shuffle is a permutation of the input and does not mutate it', () => {
    const rng = new DeterministicRng(9);
    const input = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(input);

    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled.slice().sort()).toEqual(input.slice().sort());
  });
});
