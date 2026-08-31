import { QueryExecutor } from "./query-executor"

export type WalletBalanceRow = {
  id: string
  balance_minor_units: string // BIGINT comes back as a string from `pg`
  version: number
}

// Raw SQL against the real `wallets` table — deliberately outside
// PostgresWalletRepository/the domain Wallet entity, so the two techniques
// below stay visible instead of hidden behind entity mapping. See
// docs/concurrency-lab.md for the concept/SQL/behavior writeup this
// repository backs.
export class WalletLockRepository {

  async findById(executor: QueryExecutor, walletId: string): Promise<WalletBalanceRow> {
    const result = await executor.query<WalletBalanceRow>(
      `SELECT id, balance_minor_units, version FROM wallets WHERE id = $1`,
      [walletId]
    )
    if (!result.rows[0]) throw new Error(`wallet ${walletId} not found`)
    return result.rows[0]
  }

  // Concept: Pessimistic Lock
  // SQL:      SELECT id, balance_minor_units, version FROM wallets
  //           WHERE id = $1 FOR UPDATE
  // Behavior: the selected row is locked until the holding transaction ends
  // (COMMIT or ROLLBACK). A concurrent FOR UPDATE — or a plain UPDATE —
  // against the same row from another transaction blocks until then, so
  // whatever the caller does between this call and its own COMMIT (read the
  // balance, compute a new one, write it) is safe from a concurrent
  // read-then-write race on the same row. Requires a `PoolClient` checked
  // out for the whole transaction, not the shared `pool` — the lock is only
  // meaningful held across multiple statements on one connection.
  async findByIdForUpdate(executor: QueryExecutor, walletId: string): Promise<WalletBalanceRow> {
    const result = await executor.query<WalletBalanceRow>(
      `SELECT id, balance_minor_units, version FROM wallets WHERE id = $1 FOR UPDATE`,
      [walletId]
    )
    if (!result.rows[0]) throw new Error(`wallet ${walletId} not found`)
    return result.rows[0]
  }

  // Used after findByIdForUpdate, inside the same transaction/lock, to write
  // back a balance computed from the locked read — the lock is what makes
  // this plain, unconditional UPDATE safe here.
  async setBalance(executor: QueryExecutor, walletId: string, balanceMinorUnits: number): Promise<void> {
    await executor.query(`UPDATE wallets SET balance_minor_units = $1 WHERE id = $2`, [balanceMinorUnits, walletId])
  }

  // Concept: Atomic Update
  // SQL:      UPDATE wallets SET balance_minor_units = balance_minor_units - $1
  //           WHERE id = $2 AND balance_minor_units >= $1
  // Behavior: the WHERE clause re-checks the balance at UPDATE time — against
  // the row's current value, not one read earlier — inside the same
  // statement. No SELECT, no lock, no transaction required: Postgres takes
  // the row-level lock the UPDATE itself needs, evaluates the WHERE clause
  // against the current row, and either applies the change or matches zero
  // rows. The affected-row count is the only signal the caller needs to know
  // whether the debit happened.
  async debitAtomic(executor: QueryExecutor, walletId: string, amountMinorUnits: number): Promise<boolean> {
    const result = await executor.query(
      `UPDATE wallets
       SET balance_minor_units = balance_minor_units - $1
       WHERE id = $2 AND balance_minor_units >= $1`,
      [amountMinorUnits, walletId]
    )
    return (result.rowCount ?? 0) > 0
  }

  async creditAtomic(executor: QueryExecutor, walletId: string, amountMinorUnits: number): Promise<boolean> {
    const result = await executor.query(
      `UPDATE wallets SET balance_minor_units = balance_minor_units + $1 WHERE id = $2`,
      [amountMinorUnits, walletId]
    )
    return (result.rowCount ?? 0) > 0
  }
}
