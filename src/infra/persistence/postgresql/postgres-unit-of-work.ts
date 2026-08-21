import { UnitOfWork } from "../../../application/shared/transaction/unit-of-work"
import { pool, transactionContext } from "../../config/database/postgresql/pg"

// Checks out one connection for the whole callback, BEGINs, runs `work`
// with that connection published via transactionContext (see pg.ts) so every
// Postgres*Repository call made inside `work` participates in the same
// transaction transparently, then COMMITs on success or ROLLBACKs on any
// thrown error — the error is rethrown so callers see the original failure.
export class PostgresUnitOfWork implements UnitOfWork {
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const result = await transactionContext.run(client, work)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}
