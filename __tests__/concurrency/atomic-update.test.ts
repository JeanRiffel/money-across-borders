import { pool } from "../../src/infra/config/database/postgresql/pg"
import { WalletLockRepository } from "../../src/infra/persistence/postgresql/concurrency-lab/wallet-lock-repository"
import { createLabAccount, createLabWallet, deleteLabAccount, closeLabPool } from "./support/db"

// Concept: Atomic Update — see WalletLockRepository.debitAtomic.
//
// SQL:
//   UPDATE wallets SET balance_minor_units = balance_minor_units - $1
//   WHERE id = $2 AND balance_minor_units >= $1
//
// No SELECT, no lock, no transaction wrapping this call — each debitAtomic()
// call below is its own single-statement, autocommitting query on its own
// pooled connection, and all of them fire at once via Promise.all: this is
// real, unordered concurrency, not a scripted timeline. The affected-row
// count is the only thing that tells a caller whether its debit landed.
describe("Atomic update — UPDATE ... WHERE balance_minor_units >= $1", () => {
  const repo = new WalletLockRepository()
  let accountId: string
  let walletId: string

  beforeEach(async () => {
    accountId = await createLabAccount()
    walletId = await createLabWallet(accountId, { balanceMinorUnits: 500 })
  })

  afterEach(async () => {
    await deleteLabAccount(accountId)
  })

  afterAll(async () => {
    await closeLabPool()
  })

  test("exactly as many concurrent debits succeed as the balance can afford, never overdrawing", async () => {
    const attempts = 20
    const debitAmount = 100 // wallet can afford exactly 5 of these

    const results = await Promise.all(
      Array.from({ length: attempts }, () => repo.debitAtomic(pool, walletId, debitAmount))
    )

    const succeeded = results.filter(Boolean).length
    expect(succeeded).toBe(5)
    expect(results.filter(ok => !ok)).toHaveLength(attempts - succeeded)

    const row = await repo.findById(pool, walletId)
    expect(Number(row.balance_minor_units)).toBe(500 - succeeded * debitAmount)
    // Backstop: even if the WHERE clause above were ever weakened, the
    // CHECK (balance_minor_units >= 0) constraint from 001_init_schema.sql
    // would still make an overdraft impossible to persist.
    expect(Number(row.balance_minor_units)).toBeGreaterThanOrEqual(0)
  })
})
