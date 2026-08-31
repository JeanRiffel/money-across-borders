import { pool } from "../../src/infra/config/database/postgresql/pg"
import { WalletLockRepository } from "../../src/infra/persistence/postgresql/concurrency-lab/wallet-lock-repository"
import { createLabAccount, createLabWallet, deleteLabAccount, closeLabPool, waitUntilWaitingOnLock, backendPidOf } from "./support/db"

// Concept: Pessimistic Lock — see WalletLockRepository.findByIdForUpdate.
//
// SQL:
//   SELECT id, balance_minor_units, version FROM wallets WHERE id = $1 FOR UPDATE
//
// Timeline this test asserts, with two real connections (client1, client2):
//
//   T1                                    T2
//   BEGIN
//   SELECT ... FOR UPDATE   (locks row)
//                                          BEGIN
//                                          SELECT ... FOR UPDATE   → blocks
//   COMMIT                  (releases)
//                                          ↳ unblocks, proceeds
//
// "T2 is blocked" is verified against Postgres' own
// pg_stat_activity.wait_event_type for T2's backend pid — not a sleep() —
// so the test waits only as long as it actually takes T2 to become blocked,
// and would fail loudly (timeout) if FOR UPDATE ever stopped locking.
describe("Pessimistic lock — SELECT ... FOR UPDATE", () => {
  const repo = new WalletLockRepository()
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

  test("a second FOR UPDATE on the same row blocks until the first transaction ends", async () => {
    const events: string[] = []
    const client1 = await pool.connect()
    const client2 = await pool.connect()

    try {
      const client2Pid = await backendPidOf(client2)

      await client1.query("BEGIN")
      await repo.findByIdForUpdate(client1, walletId)
      events.push("t1-locked")

      await client2.query("BEGIN")
      const t2Promise = repo.findByIdForUpdate(client2, walletId).then(() => {
        events.push("t2-locked")
      })

      await waitUntilWaitingOnLock(client2Pid)
      // T2's SELECT ... FOR UPDATE is genuinely blocked in Postgres right
      // now — confirm it hasn't (and, given the lock, couldn't have)
      // resolved yet.
      expect(events).toEqual(["t1-locked"])

      await repo.setBalance(client1, walletId, 900)
      await client1.query("COMMIT")

      await t2Promise
      expect(events).toEqual(["t1-locked", "t2-locked"])

      const rowSeenByT2 = await repo.findById(client2, walletId)
      expect(Number(rowSeenByT2.balance_minor_units)).toBe(900) // T2 sees T1's committed write, not the pre-lock value

      await client2.query("COMMIT")
    } finally {
      client1.release()
      client2.release()
    }
  })
})
