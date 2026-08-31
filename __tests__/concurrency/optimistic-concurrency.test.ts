import { pool } from "../../src/infra/config/database/postgresql/pg"
import { WalletOptimisticRepository } from "../../src/infra/persistence/postgresql/concurrency-lab/wallet-optimistic-repository"
import { createLabAccount, createLabWallet, deleteLabAccount, closeLabPool } from "./support/db"

// Concept: Optimistic Concurrency — see
// WalletOptimisticRepository.updateBalanceOptimistic.
//
// SQL:
//   UPDATE wallets SET balance_minor_units = $1, version = version + 1
//   WHERE id = $2 AND version = $3
//
// Two callers read the same (balance, version) pair, each computes its own
// new balance from it, and both race to write back via Promise.all — no
// lock held between the read and the write. Exactly one UPDATE's
// `WHERE version = $3` still matches (rowCount 1); the other's matches
// nothing (rowCount 0) because the winner already bumped the version.
describe("Optimistic concurrency — version column", () => {
  const repo = new WalletOptimisticRepository()
  let accountId: string
  let walletId: string

  beforeEach(async () => {
    accountId = await createLabAccount()
    walletId = await createLabWallet(accountId, { balanceMinorUnits: 1000, version: 0 })
  })

  afterEach(async () => {
    await deleteLabAccount(accountId)
  })

  afterAll(async () => {
    await closeLabPool()
  })

  test("of two concurrent version-checked updates from the same read, only one succeeds", async () => {
    const read = await repo.findWithVersion(pool, walletId)

    const [resultA, resultB] = await Promise.all([
      repo.updateBalanceOptimistic(pool, walletId, Number(read.balance_minor_units) + 100, read.version),
      repo.updateBalanceOptimistic(pool, walletId, Number(read.balance_minor_units) + 200, read.version),
    ])

    const outcomes = [resultA, resultB]
    expect(outcomes.filter(Boolean)).toHaveLength(1)
    expect(outcomes.filter(ok => !ok)).toHaveLength(1)

    const finalRow = await repo.findWithVersion(pool, walletId)
    expect(finalRow.version).toBe(1) // bumped exactly once, by the winner
  })

  test("the loser can recover by re-reading the fresh version and retrying", async () => {
    const staleRead = await repo.findWithVersion(pool, walletId)

    // Simulates another writer winning first, using the same stale read.
    const firstWriteWon = await repo.updateBalanceOptimistic(pool, walletId, 1100, staleRead.version)
    expect(firstWriteWon).toBe(true)

    const conflictingWrite = await repo.updateBalanceOptimistic(pool, walletId, 1200, staleRead.version)
    expect(conflictingWrite).toBe(false) // same stale version — rejected, not silently lost

    const freshRead = await repo.findWithVersion(pool, walletId)
    const retryWithFreshVersion = await repo.updateBalanceOptimistic(pool, walletId, 1300, freshRead.version)
    expect(retryWithFreshVersion).toBe(true)
  })
})
