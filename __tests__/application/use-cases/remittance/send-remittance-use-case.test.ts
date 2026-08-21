import { SendRemittanceUseCase } from '../../../../src/application/remittance/uses-cases/send-remittance-use-case'
import { SendRemittanceInput } from '../../../../src/application/remittance/dto/send-remittance-input'
import { OpenWalletUseCase } from '../../../../src/application/wallet/uses-cases/open-wallet-use-case'
import { OpenWalletInput } from '../../../../src/application/wallet/dto/open-wallet-input'
import { InMemoryWalletRepository } from '../../../../src/infra/persistence/in-memory/in-memory-wallet-repository'
import { InMemoryLedgerRepository } from '../../../../src/infra/persistence/in-memory/in-memory-ledger-repository'
import { InMemoryRemittanceRepository } from '../../../../src/infra/persistence/in-memory/in-memory-remittance-repository'
import { InMemoryKycProfileRepository } from '../../../../src/infra/persistence/in-memory/in-memory-kyc-profile-repository'
import { InMemoryUnitOfWork } from '../../../../src/infra/persistence/in-memory/in-memory-unit-of-work'
import { seedTreasuryWallets } from '../../../../src/infra/persistence/in-memory/seed-treasury-wallets'
import { MockExchangeRateProvider } from '../../../../src/infra/exchange/mock-exchange-rate-provider'
import { InMemoryComplianceChecker } from '../../../../src/infra/compliance/in-memory-compliance-checker'
import { FlatPercentageFeeCalculator } from '../../../../src/infra/pricing/flat-percentage-fee-calculator'
import { LedgerService } from '../../../../src/domain/ledger/services/ledger-service'
import { SystemClock } from '../../../../src/infra/time/system-clock'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'
import { Currency } from '../../../../src/domain/shared/value-objects/currency-value-object'
import {
  ComplianceRejectedError,
  InsufficientFundsError,
} from '../../../../src/domain/shared/errors'

const usd = Currency.from('USD')
const brl = Currency.from('BRL')

function buildScenario() {
  const clock = new SystemClock()
  const walletRepository = new InMemoryWalletRepository()
  const ledgerRepository = new InMemoryLedgerRepository()
  const remittanceRepository = new InMemoryRemittanceRepository()
  const kycProfileRepository = new InMemoryKycProfileRepository()

  const useCase = new SendRemittanceUseCase(
    walletRepository,
    new LedgerService(ledgerRepository, clock),
    remittanceRepository,
    new MockExchangeRateProvider(),
    new InMemoryComplianceChecker(kycProfileRepository),
    new FlatPercentageFeeCalculator(),
    clock,
    new InMemoryUnitOfWork()
  )

  const openWallet = new OpenWalletUseCase(walletRepository, clock)

  return { walletRepository, ledgerRepository, remittanceRepository, useCase, openWallet, clock }
}

async function openAccountWithWallet(openWallet: OpenWalletUseCase, currency: string, initialBalanceMinorUnits = 0) {
  const accountId = AccountId.generate().getValue()
  await openWallet.execute(OpenWalletInput.from({ accountId, currency, initialBalanceMinorUnits }))
  return accountId
}

describe('SendRemittanceUseCase', () => {
  it('should send a cross-currency remittance, keeping every currency balanced in the ledger', async () => {
    const { walletRepository, ledgerRepository, useCase, openWallet } = buildScenario()
    await seedTreasuryWallets(walletRepository, new SystemClock())

    const senderAccountId = await openAccountWithWallet(openWallet, 'USD', 100_000)
    const recipientAccountId = await openAccountWithWallet(openWallet, 'BRL', 0)

    const output = await useCase.execute(SendRemittanceInput.from({
      senderAccountId,
      recipientAccountId,
      sourceCurrency: 'USD',
      destinationCurrency: 'BRL',
      amountMinorUnits: 10_000, // $100.00, well under the unverified compliance threshold
    }))

    expect(output.status).toEqual('COMPLETED')
    expect(output.sourceAmountMinorUnits).toEqual(10_000)
    expect(output.feeMinorUnits).toEqual(50) // 0.5% of 10,000
    expect(output.convertedAmountMinorUnits).toEqual(52_000) // 10,000 * 5.2
    expect(output.exchangeRate).toEqual(5.2)

    const senderWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(senderAccountId), usd)
    const recipientWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(recipientAccountId), brl)
    expect(senderWallet!.getBalance().getAmountMinorUnits()).toEqual(100_000 - 10_050) // principal + fee debited
    expect(recipientWallet!.getBalance().getAmountMinorUnits()).toEqual(52_000)

    const legs = await ledgerRepository.findByTransactionId(output.remittanceId)
    expect(legs).toHaveLength(6)

    const netByCurrency = new Map<string, number>()
    for (const leg of legs) {
      const code = leg.getMoney().getCurrency().getCode()
      const signed = leg.getDirection().isDebit() ? leg.getMoney().getAmountMinorUnits() : -leg.getMoney().getAmountMinorUnits()
      netByCurrency.set(code, (netByCurrency.get(code) ?? 0) + signed)
    }
    expect(netByCurrency.get('USD')).toEqual(0)
    expect(netByCurrency.get('BRL')).toEqual(0)
  })

  it('should take the same-currency shortcut and leave the destination-side treasury principal untouched', async () => {
    const { walletRepository, ledgerRepository, useCase, openWallet } = buildScenario()
    await seedTreasuryWallets(walletRepository, new SystemClock())

    const senderAccountId = await openAccountWithWallet(openWallet, 'USD', 100_000)
    const recipientAccountId = await openAccountWithWallet(openWallet, 'USD', 0)

    const output = await useCase.execute(SendRemittanceInput.from({
      senderAccountId,
      recipientAccountId,
      sourceCurrency: 'USD',
      destinationCurrency: 'USD',
      amountMinorUnits: 10_000,
    }))

    expect(output.exchangeRate).toEqual(1)
    expect(output.convertedAmountMinorUnits).toEqual(10_000)

    const recipientWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(recipientAccountId), usd)
    expect(recipientWallet!.getBalance().getAmountMinorUnits()).toEqual(10_000) // principal only, no fee

    // Only 4 legs (principal x2 + fee x2) since the principal never touches treasury.
    const legs = await ledgerRepository.findByTransactionId(output.remittanceId)
    expect(legs).toHaveLength(4)
  })

  it('should reject with InsufficientFundsError and persist nothing when the sender cannot cover principal + fee', async () => {
    const { walletRepository, ledgerRepository, useCase, openWallet } = buildScenario()
    await seedTreasuryWallets(walletRepository, new SystemClock())

    const senderAccountId = await openAccountWithWallet(openWallet, 'USD', 100)
    const recipientAccountId = await openAccountWithWallet(openWallet, 'BRL', 0)

    await expect(useCase.execute(SendRemittanceInput.from({
      senderAccountId,
      recipientAccountId,
      sourceCurrency: 'USD',
      destinationCurrency: 'BRL',
      amountMinorUnits: 10_000,
    }))).rejects.toThrow(InsufficientFundsError)

    const senderWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(senderAccountId), usd)
    expect(senderWallet!.getBalance().getAmountMinorUnits()).toEqual(100) // unchanged
    expect(await ledgerRepository.findByWalletId(senderWallet!.getId())).toHaveLength(0)
  })

  it('should reject with ComplianceRejectedError for an unverified sender above the threshold, persisting nothing', async () => {
    const { walletRepository, ledgerRepository, useCase, openWallet } = buildScenario()
    await seedTreasuryWallets(walletRepository, new SystemClock())

    const senderAccountId = await openAccountWithWallet(openWallet, 'USD', 1_000_000)
    const recipientAccountId = await openAccountWithWallet(openWallet, 'BRL', 0)

    await expect(useCase.execute(SendRemittanceInput.from({
      senderAccountId,
      recipientAccountId,
      sourceCurrency: 'USD',
      destinationCurrency: 'BRL',
      amountMinorUnits: 200_000, // above the 100,000 unverified-sender limit
    }))).rejects.toThrow(ComplianceRejectedError)

    const senderWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(senderAccountId), usd)
    expect(senderWallet!.getBalance().getAmountMinorUnits()).toEqual(1_000_000) // unchanged

    const allLedgerEntries = await ledgerRepository.findByWalletId(senderWallet!.getId())
    expect(allLedgerEntries).toHaveLength(0)
  })
})
