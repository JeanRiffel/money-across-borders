import { PostgresAccountRepository } from './postgres-account-repository';
import { PostgresUserRepository } from './postgres-user-repository';
import { PostgresWalletRepository } from './postgres-wallet-repository';
import { PostgresLedgerRepository } from './postgres-ledger-repository';
import { PostgresRemittanceRepository } from './postgres-remittance-repository';
import { PostgresKycProfileRepository } from './postgres-kyc-profile-repository';
import { PostgresIdempotencyRepository } from './postgres-idempotency-repository';
import { PostgresOutboxRepository } from './postgres-outbox-repository';
import { PostgresUnitOfWork } from './postgres-unit-of-work';

/**
 * Postgres counterpart to in-memory-registry.ts, imported by every
 * *-factory.ts — this is what makes the running app persist for real. Each
 * Postgres*Repository takes no constructor args (they call the shared
 * pg.ts getExecutor() per query instead of holding injected state), so
 * unlike the in-memory registry this single-instance-per-repo shape isn't
 * load-bearing for cross-factory state sharing (Postgres itself is that
 * shared state) — it's kept anyway to mirror the existing convention and
 * give factories one obvious place to import from.
 */
export const postgresRegistry = {
  accountRepository: new PostgresAccountRepository(),
  userRepository: new PostgresUserRepository(),
  walletRepository: new PostgresWalletRepository(),
  ledgerRepository: new PostgresLedgerRepository(),
  remittanceRepository: new PostgresRemittanceRepository(),
  kycProfileRepository: new PostgresKycProfileRepository(),
  idempotencyRepository: new PostgresIdempotencyRepository(),
  outboxRepository: new PostgresOutboxRepository(),
  unitOfWork: new PostgresUnitOfWork(),
};
