import { LedgerEntry } from '../../../src/domain/ledger/entities/ledger-entry'
import { LedgerEntryId } from '../../../src/domain/ledger/value-objects/ledger-entry-id-value-object'
import { EntryDirection } from '../../../src/domain/ledger/value-objects/entry-direction-value-object'
import { WalletId } from '../../../src/domain/wallet/value-objects/wallet-id-value-object'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { Money } from '../../../src/domain/shared/value-objects/money-value-object'

describe('LedgerEntry', () => {
  it('should carry its leg data immutably', () => {
    const walletId = WalletId.generate()
    const money = Money.fromMinorUnits(500, Currency.from('USD'))
    const createdAt = new Date()

    const entry = new LedgerEntry(
      LedgerEntryId.generate(),
      walletId,
      EntryDirection.debit(),
      money,
      'txn-123',
      'test leg',
      createdAt
    )

    expect(entry.getWalletId().equals(walletId)).toBe(true)
    expect(entry.getDirection().isDebit()).toBe(true)
    expect(entry.getMoney().getAmountMinorUnits()).toEqual(500)
    expect(entry.getTransactionId()).toEqual('txn-123')
    expect(entry.getDescription()).toEqual('test leg')
    expect(entry.getCreatedAt()).toEqual(createdAt)
  })
})
