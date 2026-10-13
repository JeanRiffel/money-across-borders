import { createGracefulShutdown, ShutdownStep } from '../../src/main/graceful-shutdown'

// Regression suite for the incident graceful-shutdown.ts documents: a hung or
// failing step must never leave the process alive (and still bound to PORT)
// with its dependencies already closed.
describe('createGracefulShutdown', () => {
  const log = { info: jest.fn(), error: jest.fn() }

  beforeEach(() => {
    jest.useFakeTimers()
    log.info.mockClear()
    log.error.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const step = (name: string, close: () => Promise<unknown>): ShutdownStep => ({ name, close })

  it('runs every step in order and exits 0 when all succeed', async () => {
    const calls: string[] = []
    const exit = jest.fn()
    const shutdown = createGracefulShutdown({
      log,
      exit,
      timeoutMs: 1000,
      steps: [
        step('http', async () => void calls.push('http')),
        step('postgres', async () => void calls.push('postgres')),
        step('redis', async () => void calls.push('redis')),
      ],
    })

    await shutdown('SIGTERM')

    expect(calls).toEqual(['http', 'postgres', 'redis'])
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('keeps running later steps when one rejects, then exits 1', async () => {
    const redisClose = jest.fn().mockResolvedValue(undefined)
    const exit = jest.fn()
    const shutdown = createGracefulShutdown({
      log,
      exit,
      timeoutMs: 1000,
      steps: [
        step('postgres', () => Promise.reject(new Error('Called end on pool more than once'))),
        step('redis', redisClose),
      ],
    })

    await shutdown('SIGTERM')

    expect(redisClose).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
    expect(log.error).toHaveBeenCalled()
  })

  it('treats a step that throws synchronously like one that rejects', async () => {
    const exit = jest.fn()
    const shutdown = createGracefulShutdown({
      log,
      exit,
      timeoutMs: 1000,
      steps: [
        step('redis', () => {
          throw new Error('The client is closed')
        }),
      ],
    })

    await shutdown('SIGINT')

    expect(exit).toHaveBeenCalledWith(1)
  })

  it('force-exits with 1 when a step hangs past the timeout', async () => {
    const exit = jest.fn()
    const shutdown = createGracefulShutdown({
      log,
      exit,
      timeoutMs: 1000,
      steps: [step('redis', () => new Promise(() => {}))],
    })

    void shutdown('SIGTERM')
    await Promise.resolve()
    expect(exit).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1000)

    expect(exit).toHaveBeenCalledWith(1)
  })

  it('ignores a second signal while already shutting down', async () => {
    const close = jest.fn().mockResolvedValue(undefined)
    const exit = jest.fn()
    const shutdown = createGracefulShutdown({
      log,
      exit,
      timeoutMs: 1000,
      steps: [step('postgres', close)],
    })

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')])

    expect(close).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('does not fire the force-exit timer after a clean shutdown', async () => {
    const exit = jest.fn()
    const shutdown = createGracefulShutdown({
      log,
      exit,
      timeoutMs: 1000,
      steps: [step('http', async () => undefined)],
    })

    await shutdown('SIGTERM')
    jest.advanceTimersByTime(5000)

    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })
})
