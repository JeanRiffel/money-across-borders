import { forTesting_chunk as chunk } from '../../../../src/infra/seed/persistence/batch-writer';

describe('batch-writer chunk()', () => {
  it('splits evenly-divisible arrays into equal-sized chunks', () => {
    const result = chunk([1, 2, 3, 4, 5, 6], 2);
    expect(result).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('puts the remainder in the last, smaller chunk', () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when size >= length', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('returns no chunks for an empty array', () => {
    expect(chunk([], 100)).toEqual([]);
  });
});
