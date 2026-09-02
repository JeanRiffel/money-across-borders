import { computeBackoffDelayMs } from '../../../src/infra/resilience/backoff'

describe('computeBackoffDelayMs', () => {
  const noJitter = () => 0

  it('returns the base delay on the first attempt', () => {
    const delay = computeBackoffDelayMs(1, { baseDelayMs: 100, maxDelayMs: 10_000, jitterMs: 0 }, noJitter)
    expect(delay).toBe(100)
  })

  it('doubles the delay on each subsequent attempt (exponential)', () => {
    const config = { baseDelayMs: 100, maxDelayMs: 10_000, jitterMs: 0 }
    expect(computeBackoffDelayMs(1, config, noJitter)).toBe(100)
    expect(computeBackoffDelayMs(2, config, noJitter)).toBe(200)
    expect(computeBackoffDelayMs(3, config, noJitter)).toBe(400)
    expect(computeBackoffDelayMs(4, config, noJitter)).toBe(800)
  })

  it('caps the delay at maxDelayMs', () => {
    const delay = computeBackoffDelayMs(10, { baseDelayMs: 100, maxDelayMs: 1000, jitterMs: 0 }, noJitter)
    expect(delay).toBe(1000)
  })

  it('adds bounded jitter on top of the exponential delay', () => {
    const alwaysMax = () => 1 // random() returning 1 is jitterMs's upper bound
    const delay = computeBackoffDelayMs(1, { baseDelayMs: 100, maxDelayMs: 10_000, jitterMs: 50 }, alwaysMax)
    expect(delay).toBe(150)
  })

  it('never lets jitter push the delay below the pure exponential value', () => {
    const alwaysMin = () => 0
    const delay = computeBackoffDelayMs(2, { baseDelayMs: 100, maxDelayMs: 10_000, jitterMs: 50 }, alwaysMin)
    expect(delay).toBe(200)
  })

  it('clamps a jittered delay that would exceed maxDelayMs', () => {
    const alwaysMax = () => 1
    const delay = computeBackoffDelayMs(1, { baseDelayMs: 980, maxDelayMs: 1000, jitterMs: 50 }, alwaysMax)
    expect(delay).toBe(1000)
  })

  it('is deterministic for a given attempt, config and random source', () => {
    const fixedRandom = () => 0.5
    const config = { baseDelayMs: 100, maxDelayMs: 10_000, jitterMs: 40 }
    const first = computeBackoffDelayMs(3, config, fixedRandom)
    const second = computeBackoffDelayMs(3, config, fixedRandom)
    expect(first).toBe(second)
    expect(first).toBe(400 + 20)
  })
})
