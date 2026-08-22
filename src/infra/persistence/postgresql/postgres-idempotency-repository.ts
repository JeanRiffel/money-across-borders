import { IdempotencyRecord, IdempotencyRepository } from "../../../application/repositories/idempotency-repository";
import { getExecutor } from "../../config/database/postgresql/pg";

type IdempotencyRow = {
  response_body: unknown | null
}

export class PostgresIdempotencyRepository<O = any> implements IdempotencyRepository<O> {

  // Returns the cached response value directly — NOT wrapped in
  // {key, response}/IdempotencyRecord — deliberately matching
  // InMemoryIdempotencyRepository's real, tested contract. IdempotentDecorator
  // reads whatever this resolves to as `existing as O` (see its comment); the
  // IdempotencyRecord<O> return type on the interface is looser than what the
  // decorator actually relies on, and this adapter follows the working
  // contract, not the type.
  async findByKey(key: string): Promise<IdempotencyRecord<O> | null> {
    const result = await getExecutor().query<IdempotencyRow>(
      `SELECT response_body FROM idempotency_records WHERE key = $1`,
      [key]
    )
    // response_body is NULL for a row that's been claim()ed but hasn't had
    // save() called yet (still in flight) — treated the same as "no row at
    // all" here; IdempotentDecorator only reaches this after claim() has
    // already told it whether *it* holds the reservation.
    if (!result.rows[0] || result.rows[0].response_body === null) return null
    return result.rows[0].response_body as IdempotencyRecord<O>
  }

  // Atomically reserves `key` via the UNIQUE constraint — the real
  // concurrency gate for IdempotentDecorator (see its comment). Only inserts
  // the key itself; response_body stays NULL until save() completes it.
  async claim(key: string): Promise<boolean> {
    const result = await getExecutor().query(
      `INSERT INTO idempotency_records (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
      [key]
    )
    return (result.rowCount ?? 0) > 0
  }

  // Upserts by key: the row already exists from claim() in the normal path,
  // so this fills in the response; ON CONFLICT DO UPDATE also makes a direct
  // save() (bypassing claim(), as the unit test for the in-memory
  // equivalent does) work standalone.
  async save(record: IdempotencyRecord<O>): Promise<void> {
    await getExecutor().query(
      `INSERT INTO idempotency_records (key, request_hash, response_body, status_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET
         request_hash = EXCLUDED.request_hash,
         response_body = EXCLUDED.response_body,
         status_code = EXCLUDED.status_code`,
      [
        record.key,
        record.request_hash ?? null,
        JSON.stringify(record.response ?? null),
        record.status_code ?? null,
      ]
    )
  }

  // Releases a reservation that never completed (the wrapped use case
  // threw), so a retry with the same key can claim it again. The
  // response_body IS NULL guard makes this a no-op against a row that did
  // complete, so it can never delete a legitimately cached response.
  async release(key: string): Promise<void> {
    await getExecutor().query(
      `DELETE FROM idempotency_records WHERE key = $1 AND response_body IS NULL`,
      [key]
    )
  }
}
