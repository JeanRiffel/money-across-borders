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
    if (!result.rows[0]) return null
    return result.rows[0].response_body as IdempotencyRecord<O>
  }

  // Never updated once cached — ON CONFLICT DO NOTHING makes a racing
  // duplicate save a no-op rather than a unique-violation.
  async save(record: IdempotencyRecord<O>): Promise<void> {
    await getExecutor().query(
      `INSERT INTO idempotency_records (key, request_hash, response_body, status_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING`,
      [
        record.key,
        record.request_hash ?? null,
        JSON.stringify(record.response ?? null),
        record.status_code ?? null,
      ]
    )
  }
}
