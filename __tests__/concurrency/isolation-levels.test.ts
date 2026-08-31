import { pool } from "../../src/infra/config/database/postgresql/pg"
import { IsolationLevel } from "../../src/infra/persistence/postgresql/concurrency-lab/isolation"
import { createLabAccount, createLabWallet, deleteLabAccount, closeLabPool } from "./support/db"

// Concept: Isolation Level — see
// src/infra/persistence/postgresql/concurrency-lab/isolation.ts for the
// single-transaction helper (runInIsolatedTransaction); this test needs two
// transactions interleaved by hand instead, to control exactly when each
// one reads relative to the other's commit — the scenario the isolation
// level actually changes the outcome of.
//
// SQL (once per transaction):
//   BEGIN;
//   SET TRANSACTION ISOLATION LEVEL <level>;
//   SELECT balance_minor_units FROM wallets WHERE id = $1;
//   -- ... later ...
//   UPDATE wallets SET balance_minor_units = $1 WHERE id = $2;
//   COMMIT;
//
// Both transactions are deliberately naive — a plain read, then later a
// plain unconditional write (no FOR UPDATE, no atomic WHERE, no version
// check: exactly the "lost update" bug this whole lab exists to explain).
// The isolation level alone decides what happens to the loser:
//
//   READ COMMITTED (Postgres' default)      REPEATABLE READ / SERIALIZABLE
//   T1 BEGIN                                T1 BEGIN
//   T1 SELECT (sees 1000)                   T1 SELECT (sees 1000)
//                       T2 BEGIN                                T2 BEGIN
//                       T2 SELECT (sees 1000)                   T2 SELECT (sees 1000)
//   T1 UPDATE -> 1100                       T1 UPDATE -> 1100
//   T1 COMMIT                               T1 COMMIT
//                       T2 UPDATE -> 1200                       T2 UPDATE -> 1200
//                       ↳ succeeds,                              ↳ FAILS: 40001 could not
//                         silently overwrites T1                   serialize access due to
//                       T2 COMMIT                                  concurrent update
//
// i.e. READ COMMITTED lets T2's blind UPDATE re-evaluate its WHERE clause
// against T1's now-current, already-committed row and apply anyway — a
// silent lost update, no error. REPEATABLE READ/SERIALIZABLE instead detect
// that the row changed since T2's transaction snapshot began and reject
// T2's write outright.
async function runNaiveReadThenWrite(
  level: IsolationLevel,
  walletId: string,
  delta: number
): Promise<{ code: string } | null> {
  const client1 = await pool.connect()
  const client2 = await pool.connect()

  try {
    await client1.query("BEGIN")
    await client1.query(`SET TRANSACTION ISOLATION LEVEL ${level}`)
    const read1 = await client1.query<{ balance_minor_units: string }>(
      "SELECT balance_minor_units FROM wallets WHERE id = $1",
      [walletId]
    )

    await client2.query("BEGIN")
    await client2.query(`SET TRANSACTION ISOLATION LEVEL ${level}`)
    const read2 = await client2.query<{ balance_minor_units: string }>(
      "SELECT balance_minor_units FROM wallets WHERE id = $1",
      [walletId]
    )

    // T1: naive read-then-write, commits first.
    const t1NewBalance = Number(read1.rows[0].balance_minor_units) + delta
    await client1.query("UPDATE wallets SET balance_minor_units = $1 WHERE id = $2", [t1NewBalance, walletId])
    await client1.query("COMMIT")

    // T2: same naive pattern, still computing from its earlier snapshot.
    const t2NewBalance = Number(read2.rows[0].balance_minor_units) + delta * 2
    try {
      await client2.query("UPDATE wallets SET balance_minor_units = $1 WHERE id = $2", [t2NewBalance, walletId])
      await client2.query("COMMIT")
      return null
    } catch (error) {
      await client2.query("ROLLBACK")
      return { code: (error as { code: string }).code }
    }
  } finally {
    client1.release()
    client2.release()
  }
}

describe("Isolation level — SET TRANSACTION ISOLATION LEVEL", () => {
  let accountId: string
  let walletId: string

  beforeEach(async () => {
    accountId = await createLabAccount()
    walletId = await createLabWallet(accountId, { balanceMinorUnits: 1000 })
  })

  afterEach(async () => {
    await deleteLabAccount(accountId)
  })

  afterAll(async () => {
    await closeLabPool()
  })

  test("READ COMMITTED: T2 silently overwrites T1 — classic lost update, no error", async () => {
    const t2Error = await runNaiveReadThenWrite("READ COMMITTED", walletId, 100)
    expect(t2Error).toBeNull()

    const finalRow = await pool.query<{ balance_minor_units: string }>(
      "SELECT balance_minor_units FROM wallets WHERE id = $1",
      [walletId]
    )
    // T2 committed 1000 + 200 = 1200, computed from its stale read — T1's
    // +100 is gone, never reflected in the final balance.
    expect(Number(finalRow.rows[0].balance_minor_units)).toBe(1200)
  })

  test.each(["REPEATABLE READ", "SERIALIZABLE"] as const)(
    "%s: T2 is rejected with 40001 instead of silently overwriting T1",
    async (level) => {
      const t2Error = await runNaiveReadThenWrite(level, walletId, 100)
      expect(t2Error?.code).toBe("40001")

      const finalRow = await pool.query<{ balance_minor_units: string }>(
        "SELECT balance_minor_units FROM wallets WHERE id = $1",
        [walletId]
      )
      // Only T1's committed write survives — T2's UPDATE never applied.
      expect(Number(finalRow.rows[0].balance_minor_units)).toBe(1100)
    }
  )
})
