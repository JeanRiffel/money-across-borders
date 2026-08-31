import { v7 as uuidv7 } from "uuid"
import { PoolClient } from "pg"
import { pool } from "../../../src/infra/config/database/postgresql/pg"

// Throwaway fixtures for the concurrency lab: real rows in the real
// `accounts`/`wallets` tables (same schema, same constraints production
// uses — see docs/concurrency-lab.md), but each scoped to a fresh account
// per test so a lab run never touches the seeded treasury wallets
// (migrations/002_seed_treasury_wallets.sql) or another test's rows.
// Requires a reachable, migrated Postgres — see "npm run test:concurrency"
// in package.json.

export async function createLabAccount(): Promise<string> {
  const id = uuidv7()
  await pool.query(`INSERT INTO accounts (id, user_id, status_id, created_at) VALUES ($1, NULL, 1, now())`, [id])
  return id
}

export async function createLabWallet(
  accountId: string,
  options: { currency?: string; balanceMinorUnits?: number; version?: number } = {}
): Promise<string> {
  const id = uuidv7()
  const currency = options.currency ?? "USD"
  const balanceMinorUnits = options.balanceMinorUnits ?? 0
  const version = options.version ?? 0
  await pool.query(
    `INSERT INTO wallets (id, account_id, currency, balance_minor_units, status_id, version, created_at)
     VALUES ($1, $2, $3, $4, 1, $5, now())`,
    [id, accountId, currency, balanceMinorUnits, version]
  )
  return id
}

// Deletes a lab account and every wallet it owns — call in afterEach so
// runs don't accumulate rows in a shared dev/CI Postgres.
export async function deleteLabAccount(accountId: string): Promise<void> {
  await pool.query(`DELETE FROM wallets WHERE account_id = $1`, [accountId])
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId])
}

export async function closeLabPool(): Promise<void> {
  await pool.end()
}

// Polls Postgres' own bookkeeping — pg_stat_activity.wait_event_type — for a
// given backend pid instead of sleeping a fixed amount, so a test waits only
// as long as it actually takes that backend to become genuinely blocked on a
// lock. Used by pessimistic-lock.test.ts to prove T2 is really waiting on T1
// (not just "probably done by now").
export async function waitUntilWaitingOnLock(pid: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await pool.query<{ wait_event_type: string | null }>(
      `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`,
      [pid]
    )
    if (result.rows[0]?.wait_event_type === "Lock") return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`backend ${pid} never reported waiting on a lock within ${timeoutMs}ms`)
}

export async function backendPidOf(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`)
  return result.rows[0].pid
}
