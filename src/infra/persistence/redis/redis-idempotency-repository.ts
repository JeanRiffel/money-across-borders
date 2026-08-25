import { createClient } from "redis"
import { IdempotencyRecord, IdempotencyRepository } from "../../../application/repositories/idempotency-repository"

// Inferred from createClient's own return type rather than importing a
// RedisClientType generic by name — keeps this file agnostic to exactly
// which internal type name the installed "redis" version exports.
type RedisClient = ReturnType<typeof createClient>

// Marker stored while a key is claimed but the wrapped use case hasn't
// finished yet. Mirrors PostgresIdempotencyRepository's in-flight state
// (a row that exists with response_body IS NULL) — Redis has no concept of
// a partial row, so a sentinel value stands in for that NULL.
const IN_FLIGHT = "__IN_FLIGHT__"

// How long a claim survives if the process crashes between claim() and
// save()/release(). This is Redis doing automatically what
// PostgresIdempotencyRepository.release() has to be called to do — a
// crashed process here self-heals after this many seconds instead of
// wedging the key forever. Kept short: it only needs to outlive one
// use-case execution.
const CLAIM_TTL_SECONDS = 30

// How long a *completed* response stays cached for idempotent replay.
// idempotency_records in Postgres has no equivalent — nothing prunes that
// table, it grows forever. This is the practical win of moving the store to
// Redis: old keys fall off on their own.
const RESPONSE_TTL_SECONDS = 24 * 60 * 60 // 24h

// release() must delete the key only if it's still holding *this*
// reservation's IN_FLIGHT marker — never a response a concurrent save()
// already wrote. A plain GET-then-DEL would race with that save() (two
// round trips, another client could act in between); this Lua script makes
// the check-and-delete one atomic step. It's the Redis-shaped version of the
// Postgres adapter's `DELETE ... WHERE response_body IS NULL` guard.
const RELEASE_IF_IN_FLIGHT_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`

export class RedisIdempotencyRepository<O = any> implements IdempotencyRepository<O> {

  constructor(private readonly client: RedisClient) {}

  // Atomically reserves `key` — SET ... NX only writes if the key doesn't
  // exist yet, in one round trip, so this is the same real concurrency gate
  // PostgresIdempotencyRepository.claim() gets from its UNIQUE constraint.
  async claim(key: string): Promise<boolean> {
    const result = await this.client.set(this.toRedisKey(key), IN_FLIGHT, {
      NX: true,
      EX: CLAIM_TTL_SECONDS,
    })
    return result !== null
  }

  // Overwrites the IN_FLIGHT marker with the real response and resets the
  // TTL to the longer replay window. Unconditional, like the Postgres
  // adapter's upsert: by the time save() runs, claim() has already
  // established that this call owns the key.
  async save(record: IdempotencyRecord<O>): Promise<void> {
    await this.client.set(this.toRedisKey(record.key), JSON.stringify(record.response ?? null), {
      EX: RESPONSE_TTL_SECONDS,
    })
  }

  // Resolves to the cached response value directly — NOT wrapped in
  // {key, response} — deliberately matching InMemoryIdempotencyRepository's
  // and PostgresIdempotencyRepository's real, tested contract (see their
  // comments; IdempotentDecorator reads this as `existing as O`).
  async findByKey(key: string): Promise<IdempotencyRecord<O> | null> {
    const raw = await this.client.get(this.toRedisKey(key))
    if (raw === null || raw === IN_FLIGHT) return null
    return JSON.parse(raw) as IdempotencyRecord<O>
  }

  async release(key: string): Promise<void> {
    await this.client.eval(RELEASE_IF_IN_FLIGHT_SCRIPT, {
      keys: [this.toRedisKey(key)],
      arguments: [IN_FLIGHT],
    })
  }

  // Namespaced so idempotency keys can't collide with some other feature's
  // keys in the same Redis instance later (e.g. a rate-limit counter).
  private toRedisKey(key: string): string {
    return `idempotency:${key}`
  }
}
