import { QueryExecutor } from "./query-executor"

export type WalletVersionRow = {
  id: string
  balance_minor_units: string // BIGINT comes back as a string from `pg`
  version: number
}

// Raw SQL against the real `wallets` table (see the `version` column added
// by migrations/004_add_wallet_version.sql), deliberately outside
// PostgresWalletRepository — see docs/concurrency-lab.md.
export class WalletOptimisticRepository {

  async findWithVersion(executor: QueryExecutor, walletId: string): Promise<WalletVersionRow> {
    const result = await executor.query<WalletVersionRow>(
      `SELECT id, balance_minor_units, version FROM wallets WHERE id = $1`,
      [walletId]
    )
    if (!result.rows[0]) throw new Error(`wallet ${walletId} not found`)
    return result.rows[0]
  }

  // Concept: Optimistic Concurrency
  // SQL:      UPDATE wallets SET balance_minor_units = $1, version = version + 1
  //           WHERE id = $2 AND version = $3
  // Behavior: no lock is held while the caller computes newBalanceMinorUnits
  // — any number of readers can read the same (balance, version) pair at
  // once. The WHERE version = $3 clause is what detects whether the row
  // changed since it was read: `rowCount === 0` means someone else's UPDATE
  // already won and bumped the version (or the row doesn't exist) — the
  // caller must treat that as a conflict, re-read, and retry, never assume
  // its write landed just because the query didn't throw.
  async updateBalanceOptimistic(
    executor: QueryExecutor,
    walletId: string,
    newBalanceMinorUnits: number,
    expectedVersion: number
  ): Promise<boolean> {
    const result = await executor.query(
      `UPDATE wallets
       SET balance_minor_units = $1, version = version + 1
       WHERE id = $2 AND version = $3`,
      [newBalanceMinorUnits, walletId, expectedVersion]
    )
    return (result.rowCount ?? 0) > 0
  }
}
