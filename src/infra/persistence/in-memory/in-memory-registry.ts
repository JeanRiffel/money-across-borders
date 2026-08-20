import { InMemoryAccountRepository } from "./in-memory-account-repository"
import { InMemoryIdempotencyRepository } from "./in-memory-idempotency-repository"
import { InMemoryWalletRepository } from "./in-memory-wallet-repository"
import { InMemoryLedgerRepository } from "./in-memory-ledger-repository"
import { InMemoryRemittanceRepository } from "./in-memory-remittance-repository"
import { InMemoryKycProfileRepository } from "./in-memory-kyc-profile-repository"

/**
 * A single shared instance of every in-memory repository, imported by every
 * *-factory.ts in this module. This deliberately deviates from the existing
 * per-factory `new PostgresXRepository()` pattern: that pattern is fine for
 * Postgres (one external, shared database), but fatal for in-memory mode — if
 * account-factory.ts, wallet-factory.ts and remittance-factory.ts each `new`
 * their own in-memory repos, an account created via one factory would be
 * invisible to another and the whole demo flow would break. This module is
 * the fix: one process-wide registry, so state is consistent across every
 * request regardless of which factory built the use case handling it.
 */
export const inMemoryRegistry = {
  accountRepository: new InMemoryAccountRepository(),
  walletRepository: new InMemoryWalletRepository(),
  ledgerRepository: new InMemoryLedgerRepository(),
  remittanceRepository: new InMemoryRemittanceRepository(),
  kycProfileRepository: new InMemoryKycProfileRepository(),
  idempotencyRepository: new InMemoryIdempotencyRepository(),
}
