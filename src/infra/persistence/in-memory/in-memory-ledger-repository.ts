import { LedgerEntry } from "../../../domain/ledger/entities/ledger-entry"
import { LedgerRepository } from "../../../domain/ledger/repository/ledger-repository"
import { WalletId } from "../../../domain/wallet/value-objects/wallet-id-value-object"

export class InMemoryLedgerRepository implements LedgerRepository {
  private entries: LedgerEntry[] = []

  async saveMany(entries: LedgerEntry[]): Promise<void> {
    this.entries.push(...entries)
  }

  async findByWalletId(walletId: WalletId): Promise<LedgerEntry[]> {
    return this.entries.filter(e => e.getWalletId().equals(walletId))
  }

  async findByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    return this.entries.filter(e => e.getTransactionId() === transactionId)
  }
}
