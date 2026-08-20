import { WalletId } from '../../wallet/value-objects/wallet-id-value-object'
import { Money } from '../../shared/value-objects/money-value-object'
import { LedgerEntryId } from '../value-objects/ledger-entry-id-value-object'
import { EntryDirection } from '../value-objects/entry-direction-value-object'

/**
 * A LedgerEntry is one immutable leg of a double-entry posting. Entries are
 * never updated or deleted — corrections are made by posting new, offsetting
 * entries. Legs sharing the same transactionId are meant to be posted
 * together as one atomic, balanced unit (see LedgerService).
 */
export class LedgerEntry {

  constructor(
    private readonly id: LedgerEntryId,
    private readonly walletId: WalletId,
    private readonly direction: EntryDirection,
    private readonly money: Money,
    private readonly transactionId: string,
    private readonly description: string,
    private readonly createdAt: Date
  ) {}

  getId(): LedgerEntryId {
    return this.id
  }

  getWalletId(): WalletId {
    return this.walletId
  }

  getDirection(): EntryDirection {
    return this.direction
  }

  getMoney(): Money {
    return this.money
  }

  getTransactionId(): string {
    return this.transactionId
  }

  getDescription(): string {
    return this.description
  }

  getCreatedAt(): Date {
    return this.createdAt
  }

}
