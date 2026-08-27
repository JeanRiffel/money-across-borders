import { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import dotenv from 'dotenv';

// Self-contained on purpose: `pool` is constructed eagerly below, at import
// time, so POSTGRES_* must already be in process.env by then regardless of
// whether — or when, relative to this import — the entrypoint (server.ts,
// run-migrations.ts, ...) calls dotenv.config() itself. dotenv.config() is
// safe to call more than once (later calls don't override already-set vars).
dotenv.config();

export const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT),
});

// Ambient home for "the PoolClient of the transaction currently in flight",
// set by PostgresUnitOfWork.runInTransaction and read by getExecutor(). This
// lets every Postgres*Repository just call getExecutor().query(...) without
// a `client` parameter threaded through every repository method (which would
// mean changing every XRepository port signature, including the ones
// InMemory* implements) — see UnitOfWork (application/shared/transaction).
export const transactionContext = new AsyncLocalStorage<PoolClient>();

// Outside a transaction this resolves to `pool` itself (each query gets its
// own connection from the pool and auto-commits, today's default behavior).
// Inside unitOfWork.runInTransaction(...), it transparently resolves to that
// transaction's PoolClient instead, so every repository call made during the
// callback participates in the same BEGIN/COMMIT/ROLLBACK.
export function getExecutor(): Pool | PoolClient {
  return transactionContext.getStore() ?? pool;
}
