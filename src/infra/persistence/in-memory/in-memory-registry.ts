import { InMemoryAccountRepository } from "./in-memory-account-repository"
import { InMemoryUserRepository } from "./in-memory-user-repository"
import { InMemoryIdempotencyRepository } from "./in-memory-idempotency-repository"
import { InMemoryWalletRepository } from "./in-memory-wallet-repository"
import { InMemoryLedgerRepository } from "./in-memory-ledger-repository"
import { InMemoryRemittanceRepository } from "./in-memory-remittance-repository"
import { InMemoryKycProfileRepository } from "./in-memory-kyc-profile-repository"
import { InMemoryUnitOfWork } from "./in-memory-unit-of-work"

/**
 * A single shared instance of every in-memory repository. Historically this
 * was what every *-factory.ts imported (before Postgres was wired up — see
 * postgres-registry.ts, which factories use now); state is consistent across
 * every request regardless of which factory built the use case handling it.
 * Nothing under src/ imports this anymore, but it's kept — and kept in sync
 * with postgres-registry.ts's shape — as the in-memory stack's one obvious
 * entry point for tests or scripts that want it, the same way use-case tests
 * already construct individual InMemory*Repository instances directly.
 */
export const inMemoryRegistry = {
  accountRepository: new InMemoryAccountRepository(),
  userRepository: new InMemoryUserRepository(),
  walletRepository: new InMemoryWalletRepository(),
  ledgerRepository: new InMemoryLedgerRepository(),
  remittanceRepository: new InMemoryRemittanceRepository(),
  kycProfileRepository: new InMemoryKycProfileRepository(),
  idempotencyRepository: new InMemoryIdempotencyRepository(),
  unitOfWork: new InMemoryUnitOfWork(),
}
