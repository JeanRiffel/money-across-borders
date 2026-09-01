import { SendRemittanceUseCase } from '../../../../src/application/remittance/uses-cases/send-remittance-use-case'
import { SendRemittanceInput } from '../../../../src/application/remittance/dto/send-remittance-input'
import { OpenWalletUseCase } from '../../../../src/application/wallet/uses-cases/open-wallet-use-case'
import { OpenWalletInput } from '../../../../src/application/wallet/dto/open-wallet-input'
import { IdempotentDecorator } from '../../../../src/application/shared/idempotency/idempotent-decorator'
import { InMemoryWalletRepository } from '../../../../src/infra/persistence/in-memory/in-memory-wallet-repository'
import { InMemoryLedgerRepository } from '../../../../src/infra/persistence/in-memory/in-memory-ledger-repository'
import { InMemoryRemittanceRepository } from '../../../../src/infra/persistence/in-memory/in-memory-remittance-repository'
import { InMemoryKycProfileRepository } from '../../../../src/infra/persistence/in-memory/in-memory-kyc-profile-repository'
import { InMemoryUnitOfWork } from '../../../../src/infra/persistence/in-memory/in-memory-unit-of-work'
import { InMemoryIdempotencyRepository } from '../../../../src/infra/persistence/in-memory/in-memory-idempotency-repository'
import { InMemoryEventPublisher } from '../../../../src/infra/events/in-memory-event-publisher'
import { seedTreasuryWallets } from '../../../../src/infra/persistence/in-memory/seed-treasury-wallets'
import { MockExchangeRateProvider } from '../../../../src/infra/exchange/mock-exchange-rate-provider'
import { InMemoryComplianceChecker } from '../../../../src/infra/compliance/in-memory-compliance-checker'
import { FlatPercentageFeeCalculator } from '../../../../src/infra/pricing/flat-percentage-fee-calculator'
import { LedgerService } from '../../../../src/domain/ledger/services/ledger-service'
import { SystemClock } from '../../../../src/infra/time/system-clock'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'
import { Currency } from '../../../../src/domain/shared/value-objects/currency-value-object'
import { IdempotencyKeyInFlightError } from '../../../../src/domain/shared/errors'

// Mirrors buildRemittanceModule (src/main/remittance/remittance-module.ts):
// SendRemittanceUseCase wrapped in IdempotentDecorator, exactly how
// POST /remittances wires it in production — just against the in-memory
// repos, like every other use-case test in this suite.
function buildScenario() {
  const clock = new SystemClock()
  const walletRepository = new InMemoryWalletRepository()
  const ledgerRepository = new InMemoryLedgerRepository()
  const remittanceRepository = new InMemoryRemittanceRepository()
  const kycProfileRepository = new InMemoryKycProfileRepository()
  const eventPublisher = new InMemoryEventPublisher()
  const idempotencyRepository = new InMemoryIdempotencyRepository()

  const sendRemittanceUseCase = new SendRemittanceUseCase(
    walletRepository,
    new LedgerService(ledgerRepository, clock),
    remittanceRepository,
    new MockExchangeRateProvider(),
    new InMemoryComplianceChecker(kycProfileRepository),
    new FlatPercentageFeeCalculator(),
    clock,
    new InMemoryUnitOfWork(),
    eventPublisher
  )

  const useCase = new IdempotentDecorator(sendRemittanceUseCase, idempotencyRepository)
  const openWallet = new OpenWalletUseCase(walletRepository, clock)

  return { walletRepository, ledgerRepository, useCase, openWallet, clock }
}

async function openAccountWithWallet(openWallet: OpenWalletUseCase, currency: string, initialBalanceMinorUnits = 0) {
  const accountId = AccountId.generate().getValue()
  await openWallet.execute(OpenWalletInput.from({ accountId, currency, initialBalanceMinorUnits }))
  return accountId
}

const usd = Currency.from('USD')
const brl = Currency.from('BRL')

describe('POST /remittances idempotency (IdempotentDecorator + SendRemittanceUseCase)', () => {
  it('a retried request with the same idempotency key returns the same result and does not debit the wallet twice', async () => {
    const { walletRepository, useCase, openWallet } = buildScenario()
    await seedTreasuryWallets(walletRepository, new SystemClock())

    const senderAccountId = await openAccountWithWallet(openWallet, 'USD', 100_000)
    const recipientAccountId = await openAccountWithWallet(openWallet, 'BRL', 0)

    const input = {
      ...SendRemittanceInput.from({
        senderAccountId,
        recipientAccountId,
        sourceCurrency: 'USD',
        destinationCurrency: 'BRL',
        amountMinorUnits: 10_000,
      }),
      idempotencyKey: 'retry-key-1',
    }

    const first = await useCase.execute(input)
    const second = await useCase.execute(input) // same key, client retrying after e.g. a timed-out response

    expect(second).toEqual(first) // same remittanceId, same amounts — a replay, not a new remittance

    const senderWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(senderAccountId), usd)
    // Debited once (principal + fee), not twice — proves the second call never
    // re-ran SendRemittanceUseCase.
    expect(senderWallet!.getBalance().getAmountMinorUnits()).toEqual(100_000 - 10_050)
  })

  it('of N concurrent requests sharing an idempotency key, only one remittance is ever settled', async () => {
    const { walletRepository, useCase, openWallet } = buildScenario()
    await seedTreasuryWallets(walletRepository, new SystemClock())

    const senderAccountId = await openAccountWithWallet(openWallet, 'USD', 100_000)
    const recipientAccountId = await openAccountWithWallet(openWallet, 'BRL', 0)

    const input = {
      ...SendRemittanceInput.from({
        senderAccountId,
        recipientAccountId,
        sourceCurrency: 'USD',
        destinationCurrency: 'BRL',
        amountMinorUnits: 10_000,
      }),
      idempotencyKey: 'concurrent-key-1',
    }

    const attempts = 8
    const settled = await Promise.allSettled(Array.from({ length: attempts }, () => useCase.execute(input)))

    const fulfilled = settled.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof useCase.execute>>> => r.status === 'fulfilled'
    )
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

    // Every non-winning caller fails closed with IdempotencyKeyInFlightError
    // rather than re-running the transfer — never a second committed remittance.
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(IdempotencyKeyInFlightError)
    }
    // Whoever did get a result all see the exact same one.
    const remittanceIds = new Set(fulfilled.map(r => r.value.remittanceId))
    expect(remittanceIds.size).toEqual(1)

    const senderWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(senderAccountId), usd)
    // Debited exactly once across all N attempts, regardless of how many
    // callers raced for the claim.
    expect(senderWallet!.getBalance().getAmountMinorUnits()).toEqual(100_000 - 10_050)

    const recipientWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(recipientAccountId), brl)
    expect(recipientWallet!.getBalance().getAmountMinorUnits()).toEqual(52_000)
  })

  it('requests with different idempotency keys are independent transfers, each settled', async () => {
    const { walletRepository, useCase, openWallet } = buildScenario()
    await seedTreasuryWallets(walletRepository, new SystemClock())

    const senderAccountId = await openAccountWithWallet(openWallet, 'USD', 100_000)
    const recipientAccountId = await openAccountWithWallet(openWallet, 'BRL', 0)

    const baseInput = SendRemittanceInput.from({
      senderAccountId,
      recipientAccountId,
      sourceCurrency: 'USD',
      destinationCurrency: 'BRL',
      amountMinorUnits: 10_000,
    })

    const first = await useCase.execute({ ...baseInput, idempotencyKey: 'key-a' })
    const second = await useCase.execute({ ...baseInput, idempotencyKey: 'key-b' })

    expect(second.remittanceId).not.toEqual(first.remittanceId)

    const senderWallet = await walletRepository.findByAccountIdAndCurrency(AccountId.from(senderAccountId), usd)
    // Two genuinely distinct transfers, so the sender is debited twice.
    expect(senderWallet!.getBalance().getAmountMinorUnits()).toEqual(100_000 - 2 * 10_050)
  })
})
