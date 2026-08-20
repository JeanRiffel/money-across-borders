import { LedgerService, LedgerLegDraft } from '../../../src/domain/ledger/services/ledger-service'
import { InMemoryLedgerRepository } from '../../../src/infra/persistence/in-memory/in-memory-ledger-repository'
import { EntryDirection } from '../../../src/domain/ledger/value-objects/entry-direction-value-object'
import { WalletId } from '../../../src/domain/wallet/value-objects/wallet-id-value-object'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { Money } from '../../../src/domain/shared/value-objects/money-value-object'
import { UnbalancedLedgerError } from '../../../src/domain/shared/errors'
import { Clock } from '../../../src/domain/shared/clock'

class FixedClock implements Clock {
  now(): Date {
    return new Date('2026-01-01T00:00:00.000Z')
  }
}

describe('LedgerService', () => {
  const usd = Currency.from('USD')

  it('should persist legs that balance to zero per currency', async () => {
    const repository = new InMemoryLedgerRepository()
    const service = new LedgerService(repository, new FixedClock())

    const walletA = WalletId.generate()
    const walletB = WalletId.generate()

    const legs: LedgerLegDraft[] = [
      { walletId: walletA, direction: EntryDirection.debit(), money: Money.fromMinorUnits(1000, usd), description: 'debit' },
      { walletId: walletB, direction: EntryDirection.credit(), money: Money.fromMinorUnits(1000, usd), description: 'credit' },
    ]

    const entries = await service.postBalancedEntries(legs, 'txn-1')

    expect(entries).toHaveLength(2)
    expect(await repository.findByTransactionId('txn-1')).toHaveLength(2)
  })

  it('should reject legs that do not balance to zero', async () => {
    const repository = new InMemoryLedgerRepository()
    const service = new LedgerService(repository, new FixedClock())

    const legs: LedgerLegDraft[] = [
      { walletId: WalletId.generate(), direction: EntryDirection.debit(), money: Money.fromMinorUnits(1000, usd), description: 'debit' },
      { walletId: WalletId.generate(), direction: EntryDirection.credit(), money: Money.fromMinorUnits(900, usd), description: 'credit' },
    ]

    await expect(service.postBalancedEntries(legs, 'txn-2')).rejects.toThrow(UnbalancedLedgerError)
    expect(await repository.findByTransactionId('txn-2')).toHaveLength(0)
  })
})
