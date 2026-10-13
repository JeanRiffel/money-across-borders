import { runReadinessChecks } from '../../src/main/readiness'

describe('runReadinessChecks', () => {
  it('is ready when every check resolves', async () => {
    const result = await runReadinessChecks(
      [
        { name: 'postgres', check: async () => ({ rows: [] }) },
        { name: 'redis', check: async () => 'PONG' },
      ],
      100
    )

    expect(result).toEqual({ ready: true, checks: { postgres: 'ok', redis: 'ok' }, errors: {} })
  })

  // The exact state of the incident: both clients closed, process still up.
  it('is not ready when a check rejects, and reports which one', async () => {
    const result = await runReadinessChecks(
      [
        {
          name: 'postgres',
          check: () => Promise.reject(new Error('Cannot use a pool after calling end on the pool')),
        },
        { name: 'redis', check: async () => 'PONG' },
      ],
      100
    )

    expect(result.ready).toBe(false)
    expect(result.checks).toEqual({ postgres: 'fail', redis: 'ok' })
    expect(result.errors.postgres).toContain('Cannot use a pool after calling end on the pool')
  })

  it('treats a synchronous throw as a failure', async () => {
    const result = await runReadinessChecks(
      [
        {
          name: 'redis',
          check: () => {
            throw new Error('The client is closed')
          },
        },
      ],
      100
    )

    expect(result.ready).toBe(false)
    expect(result.checks.redis).toBe('fail')
  })

  it('fails a check that does not settle within the timeout', async () => {
    jest.useFakeTimers()
    try {
      const pending = runReadinessChecks(
        [{ name: 'redis', check: () => new Promise(() => {}) }],
        2000
      )
      await jest.advanceTimersByTimeAsync(2000)
      const result = await pending

      expect(result.ready).toBe(false)
      expect(result.errors.redis).toContain('timed out after 2000ms')
    } finally {
      jest.useRealTimers()
    }
  })
})
