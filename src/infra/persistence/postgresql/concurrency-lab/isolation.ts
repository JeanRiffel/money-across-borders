import { PoolClient } from 'pg';

export type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

// Concept: Isolation Level
// SQL:      BEGIN;
//           SET TRANSACTION ISOLATION LEVEL <level>;
//           -- operations
//           COMMIT;  -- or ROLLBACK
// Behavior: only changes how THIS transaction's reads/writes interact with
// OTHER concurrent transactions — it is not a lock by itself, and it never
// blocks anything on its own. Under READ COMMITTED (Postgres' default),
// each statement sees the latest committed data, so a naive read-then-write
// can silently overwrite a concurrent committed change (lost update) with
// no error at all. Under REPEATABLE READ or SERIALIZABLE, a transaction's
// snapshot is fixed for its whole duration, so Postgres instead raises
// `40001 could not serialize access due to concurrent update` at the moment
// this transaction tries to write a row that was concurrently modified and
// committed by someone else — the caller must catch that and retry, but can
// never silently lose the update. See docs/concurrency-lab.md for the exact
// timeline this backs.
//
// `level` is restricted to the union type above (never caller-supplied raw
// text), so interpolating it directly into the SQL string is safe — SET
// TRANSACTION ISOLATION LEVEL doesn't accept a bound parameter for the level
// name, unlike every other query in this codebase.
export async function runInIsolatedTransaction<T>(
  client: PoolClient,
  level: IsolationLevel,
  work: () => Promise<T>
): Promise<T> {
  await client.query('BEGIN');
  await client.query(`SET TRANSACTION ISOLATION LEVEL ${level}`);
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
