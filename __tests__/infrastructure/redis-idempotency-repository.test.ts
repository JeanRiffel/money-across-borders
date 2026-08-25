import { RedisIdempotencyRepository } from '../../src/infra/persistence/redis/redis-idempotency-repository'

// A minimal in-process fake of the two node-redis primitives this adapter
// actually uses (SET with NX/EX, GET, and one EVAL script) — enough to
// exercise the real claim/save/findByKey/release contract without a Redis
// server, matching this project's convention of `npm test` never touching
// real infra (see CLAUDE.md). It's not a general Redis mock: it only
// implements the NX/EX/eval semantics RedisIdempotencyRepository relies on.
class FakeRedisClient {
  private store = new Map<string, string>()

  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null> {
    if (options?.NX && this.store.has(key)) return null
    this.store.set(key, value)
    return 'OK'
  }

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  async eval(_script: string, { keys, arguments: args }: { keys: string[]; arguments: string[] }): Promise<number> {
    const [key] = keys
    const [expected] = args
    if (this.store.get(key) === expected) {
      this.store.delete(key)
      return 1
    }
    return 0
  }
}

describe('RedisIdempotencyRepository', () => {

  let fakeClient: FakeRedisClient
  let repository: RedisIdempotencyRepository

  beforeEach(() => {
    fakeClient = new FakeRedisClient()
    repository = new RedisIdempotencyRepository(fakeClient as any)
  })

  test('persists idempotency key', async () => {
    const key = 'abc-123'
    const response = { accountId: '1' }

    await repository.save({ key, response })

    const result = await repository.findByKey(key)

    expect(result).toEqual(response)
  })

  test('claim() reserves a key so a second concurrent claim is refused', async () => {
    const key = 'concurrent-key'

    const firstClaim = await repository.claim(key)
    const secondClaim = await repository.claim(key)

    expect(firstClaim).toBe(true)
    expect(secondClaim).toBe(false)
  })

  test('findByKey() returns null while a key is claimed but not yet saved', async () => {
    const key = 'in-flight-key'

    await repository.claim(key)

    expect(await repository.findByKey(key)).toBeNull()
  })

  test('release() frees a claim that never completed, allowing a retry to claim it again', async () => {
    const key = 'released-key'

    await repository.claim(key)
    await repository.release(key)

    expect(await repository.claim(key)).toBe(true)
  })

  test('release() is a no-op once a response has been saved for the key', async () => {
    const key = 'completed-key'
    const response = { ok: true }

    await repository.claim(key)
    await repository.save({ key, response })
    await repository.release(key)

    expect(await repository.findByKey(key)).toEqual(response)
  })

})
