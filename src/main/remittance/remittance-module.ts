import { IdempotentDecorator } from "src/application/shared/idempotency/idempotent-decorator"
import { SendRemittanceUseCase } from "src/application/remittance/uses-cases/send-remittance-use-case"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { SendRemittanceInput } from "src/application/remittance/dto/send-remittance-input"
import { SendRemittanceOutput } from "src/application/remittance/dto/send-remittance-output"
import { WalletRepository } from "src/domain/wallet/repository/wallet-repository"
import { LedgerRepository } from "src/domain/ledger/repository/ledger-repository"
import { LedgerService } from "src/domain/ledger/services/ledger-service"
import { RemittanceRepository } from "src/domain/remittance/repository/remittance-repository"
import { ExchangeRateProvider } from "src/application/shared/exchange/exchange-rate-provider"
import { ComplianceChecker } from "src/application/shared/compliance/compliance-checker"
import { FeeCalculator } from "src/application/shared/pricing/fee-calculator"
import { IdempotencyRepository } from "src/application/repositories/idempotency-repository"
import { Clock } from "src/domain/shared/clock"

export type RemittanceModuleDependencies = {
  walletRepository: WalletRepository
  ledgerRepository: LedgerRepository
  remittanceRepository: RemittanceRepository
  exchangeRateProvider: ExchangeRateProvider
  complianceChecker: ComplianceChecker
  feeCalculator: FeeCalculator
  idempotencyRepository: IdempotencyRepository
  clock: Clock
}

export function buildRemittanceModule(
  deps: RemittanceModuleDependencies
): UseCase<
  SendRemittanceInput & { idempotencyKey: string },
  SendRemittanceOutput
> {
  const ledgerService = new LedgerService(deps.ledgerRepository, deps.clock)

  const sendRemittanceUseCase =
    new SendRemittanceUseCase(
      deps.walletRepository,
      ledgerService,
      deps.remittanceRepository,
      deps.exchangeRateProvider,
      deps.complianceChecker,
      deps.feeCalculator,
      deps.clock
    )

  const idempotentSendRemittance =
    new IdempotentDecorator(
      sendRemittanceUseCase,
      deps.idempotencyRepository
    )

  return idempotentSendRemittance
}
