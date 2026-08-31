import { v7 as uuidv7 } from "uuid"
import { pool } from "../../src/infra/config/database/postgresql/pg"
import { PostgresIdempotencyRepository } from "../../src/infra/persistence/postgresql/postgres-idempotency-repository"

// Concept: Idempotency — see PostgresIdempotencyRepository.claim(), the
// production Postgres adapter for IdempotencyRepository (application/
// repositories/idempotency-repository.ts). Currently unused by any
// *-factory.ts — the app wires idempotency to Redis instead (see
// architecture.md's "Idempotency" bullet) — but this exercises the exact
// same SQL directly against a real Postgres.
//
// SQL:
//   INSERT INTO idempotency_records (key) VALUES ($1) ON CONFLICT (key) DO NOTHING
//
// N concurrent requests carrying the same Idempotency-Key all attempt this
// INSERT at once via Promise.all — each on its own pooled connection, so
// this is genuine concurrency, not a scripted ordering. Postgres' UNIQUE
// index on `key` (001_init_schema.sql) is what actually decides the race:
// only one INSERT can ever land; every other caller's affected-row count is
// 0, straight from the constraint, no application-level locking involved.
describe("Idempotency — UNIQUE (key) constraint", () => {
  const repository = new PostgresIdempotencyRepository()
  let key: string

  beforeEach(() => {
    key = uuidv7()
  })

  afterEach(async () => {
    await pool.query(`DELETE FROM idempotency_records WHERE key = $1`, [key])
  })

  afterAll(async () => {
    await pool.end()
  })

  test("of N concurrent claim() calls for the same key, exactly one wins", async () => {
    const attempts = 10

    const results = await Promise.all(Array.from({ length: attempts }, () => repository.claim(key)))

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.filter(ok => !ok)).toHaveLength(attempts - 1)

    const row = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM idempotency_records WHERE key = $1`,
      [key]
    )
    expect(Number(row.rows[0].count)).toBe(1) // the constraint enforced this, not application logic
  })

  test("release() lets a claim that never completed be reclaimed", async () => {
    expect(await repository.claim(key)).toBe(true)
    await repository.release(key)
    expect(await repository.claim(key)).toBe(true)
  })

  test("release() is a no-op once a response was saved — a late retry sees the cached response, not a fresh claim", async () => {
    await repository.claim(key)
    await repository.save({ key, response: { ok: true } })
    await repository.release(key)

    expect(await repository.claim(key)).toBe(false)
    expect(await repository.findByKey(key)).toEqual({ ok: true })
  })
})
