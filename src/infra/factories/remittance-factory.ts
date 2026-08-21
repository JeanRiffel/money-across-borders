import { buildRemittanceModule } from "src/main/remittance/remittance-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { SendRemittanceInput } from "src/application/remittance/dto/send-remittance-input";
import { SendRemittanceOutput } from "src/application/remittance/dto/send-remittance-output";
import { SystemClock } from "../time/system-clock";
import { postgresRegistry } from "../persistence/postgresql/postgres-registry";
import { MockExchangeRateProvider } from "../exchange/mock-exchange-rate-provider";
import { InMemoryComplianceChecker } from "../compliance/in-memory-compliance-checker";
import { FlatPercentageFeeCalculator } from "../pricing/flat-percentage-fee-calculator";

// No seedTreasuryWallets() call here (unlike the old in-memory-backed
// version of this factory): the treasury account + its per-currency wallets
// are seeded by migration 002_seed_treasury_wallets.sql instead, idempotently,
// as part of `npm run db:migrate` — see CLAUDE.md's Commands section.
export async function createSendRemittanceUseCase(): Promise<UseCase<SendRemittanceInput, SendRemittanceOutput>> {
  const clock = new SystemClock()

  const dependencies = {
    walletRepository: postgresRegistry.walletRepository,
    ledgerRepository: postgresRegistry.ledgerRepository,
    remittanceRepository: postgresRegistry.remittanceRepository,
    exchangeRateProvider: new MockExchangeRateProvider(),
    complianceChecker: new InMemoryComplianceChecker(postgresRegistry.kycProfileRepository),
    feeCalculator: new FlatPercentageFeeCalculator(),
    idempotencyRepository: postgresRegistry.idempotencyRepository,
    clock,
    unitOfWork: postgresRegistry.unitOfWork
  }

  return buildRemittanceModule(dependencies)
}
