import { LedgerEntry } from '../entities/ledger-entry'
import { WalletId } from '../../wallet/value-objects/wallet-id-value-object'

export interface LedgerRepository {
  saveMany(entries: LedgerEntry[]): Promise<void>
  findByWalletId(walletId: WalletId): Promise<LedgerEntry[]>
  findByTransactionId(transactionId: string): Promise<LedgerEntry[]>
}
