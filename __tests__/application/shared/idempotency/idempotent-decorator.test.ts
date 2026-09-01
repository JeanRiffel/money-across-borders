import { IdempotentDecorator } from '../../../../src/application/shared/idempotency/idempotent-decorator'
import { UseCase } from '../../../../src/application/shared/idempotency/common-use-case.'
import { InMemoryIdempotencyRepository } from '../../../../src/infra/persistence/in-memory/in-memory-idempotency-repository'
import { IdempotencyKeyInFlightError } from '../../../../src/domain/shared/errors'

// A fake wrapped use case that counts how many times it actually ran.
// Resolves immediately by default; hold() switches it to waiting for an
// explicit releaseAll() — needed only where a test must keep an execution
// "in flight" while other concurrent callers race for the same claim.
// throwOnNextCall() is one-shot, so a retry after a failure behaves like a
// normal successful call again.
class RecordingUseCase implements UseCase<{ idempotencyKey: string; value: string }, { echoed: string }> {
  public executions: string[] = []
  private pending: Array<() => void> = []
  private holding = false
  private throwOnce = false

  async execute(input: { idempotencyKey: string; value: string }): Promise<{ echoed: string }> {
    this.executions.push(input.value)
    if (this.throwOnce) {
      this.throwOnce = false
      throw new Error('use case failed')
    }
    if (this.holding) {
      await new Promise<void>(resolve => this.pending.push(resolve))
    }
    return { echoed: input.value }
  }

  hold(): void {
    this.holding = true
  }

  releaseAll(): void {
    this.holding = false
    const toRelease = this.pending.splice(0)
    toRelease.forEach(resolve => resolve())
  }

  throwOnNextCall(): void {
    this.throwOnce = true
  }
}

describe('IdempotentDecorator', () => {
  it('runs the wrapped use case once per key and replays the saved response on a later retry', async () => {
    const useCase = new RecordingUseCase()
    const decorator = new IdempotentDecorator(useCase, new InMemoryIdempotencyRepository())

    const first = await decorator.execute({ idempotencyKey: 'key-1', value: 'first-call' })
    // Same key again — replayed from the saved response, the wrapped use
    // case must not run a second time.
    const second = await decorator.execute({ idempotencyKey: 'key-1', value: 'second-call' })

    expect(useCase.executions).toEqual(['first-call'])
    expect(first).toEqual({ echoed: 'first-call' })
    expect(second).toEqual({ echoed: 'first-call' })
  })

  it('of N concurrent calls sharing a key, exactly one executes the wrapped use case', async () => {
    const useCase = new RecordingUseCase()
    const decorator = new IdempotentDecorator(useCase, new InMemoryIdempotencyRepository())
    useCase.hold() // keep the claim-winner in flight until every caller has raced for it

    const attempts = 10
    const calls = Array.from({ length: attempts }, (_, i) =>
      decorator.execute({ idempotencyKey: 'shared-key', value: `attempt-${i}` }).then(
        value => ({ status: 'fulfilled' as const, value }),
        error => ({ status: 'rejected' as const, error })
      )
    )

    // Let every attempt's claim() race settle (only the winner actually
    // calls into the wrapped use case) before releasing it.
    await Promise.resolve()
    await Promise.resolve()
    useCase.releaseAll()

    const settled = await Promise.all(calls)

    expect(useCase.executions).toHaveLength(1)

    const fulfilled = settled.filter(s => s.status === 'fulfilled')
    const rejected = settled.filter(s => s.status === 'rejected')
    // Every caller either replays the winner's result or fails closed with
    // IdempotencyKeyInFlightError — never a second execution.
    expect(fulfilled.length + rejected.length).toEqual(attempts)
    for (const r of rejected as Array<{ status: 'rejected'; error: unknown }>) {
      expect(r.error).toBeInstanceOf(IdempotencyKeyInFlightError)
    }
    for (const f of fulfilled as Array<{ status: 'fulfilled'; value: { echoed: string } }>) {
      expect(f.value).toEqual({ echoed: 'attempt-0' })
    }
  })

  it('releases the claim when the wrapped use case throws, so a retry with the same key can run again', async () => {
    const useCase = new RecordingUseCase()
    const decorator = new IdempotentDecorator(useCase, new InMemoryIdempotencyRepository())

    useCase.throwOnNextCall()
    await expect(decorator.execute({ idempotencyKey: 'key-2', value: 'boom' })).rejects.toThrow('use case failed')

    const retry = await decorator.execute({ idempotencyKey: 'key-2', value: 'retry' })

    expect(retry).toEqual({ echoed: 'retry' })
    expect(useCase.executions).toEqual(['boom', 'retry'])
  })

  it('treats different keys as fully independent requests', async () => {
    const useCase = new RecordingUseCase()
    const decorator = new IdempotentDecorator(useCase, new InMemoryIdempotencyRepository())

    const a = await decorator.execute({ idempotencyKey: 'key-a', value: 'a' })
    const b = await decorator.execute({ idempotencyKey: 'key-b', value: 'b' })

    expect(a).toEqual({ echoed: 'a' })
    expect(b).toEqual({ echoed: 'b' })
    expect(useCase.executions).toEqual(['a', 'b'])
  })
})
