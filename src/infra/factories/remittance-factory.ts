import { buildRemittanceModule } from "src/main/remittance/remittance-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { SendRemittanceInput } from "src/application/remittance/dto/send-remittance-input";
import { SendRemittanceOutput } from "src/application/remittance/dto/send-remittance-output";
import { SystemClock } from "../time/system-clock";
import { inMemoryRegistry } from "../persistence/in-memory/in-memory-registry";
import { seedTreasuryWallets } from "../persistence/in-memory/seed-treasury-wallets";
import { MockExchangeRateProvider } from "../exchange/mock-exchange-rate-provider";
import { InMemoryComplianceChecker } from "../compliance/in-memory-compliance-checker";
import { FlatPercentageFeeCalculator } from "../pricing/flat-percentage-fee-calculator";

export async function createSendRemittanceUseCase(): Promise<UseCase<SendRemittanceInput, SendRemittanceOutput>> {
  const clock = new SystemClock()

  // Treasury wallets must exist before any remittance can be posted against
  // them; seeding is idempotent (skips currencies already seeded), so it's
  // safe to call every time this factory runs. Awaited so the use case is
  // never handed out before the wallets it depends on actually exist.
  await seedTreasuryWallets(inMemoryRegistry.walletRepository, clock)

  const dependencies = {
    walletRepository: inMemoryRegistry.walletRepository,
    ledgerRepository: inMemoryRegistry.ledgerRepository,
    remittanceRepository: inMemoryRegistry.remittanceRepository,
    exchangeRateProvider: new MockExchangeRateProvider(),
    complianceChecker: new InMemoryComplianceChecker(inMemoryRegistry.kycProfileRepository),
    feeCalculator: new FlatPercentageFeeCalculator(),
    idempotencyRepository: inMemoryRegistry.idempotencyRepository,
    clock
  }

  return buildRemittanceModule(dependencies)
}
