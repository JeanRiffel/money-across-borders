import { LedgerEntry } from "../../../domain/ledger/entities/ledger-entry";
import { LedgerRepository } from "../../../domain/ledger/repository/ledger-repository";
import { LedgerEntryId } from "../../../domain/ledger/value-objects/ledger-entry-id-value-object";
import { EntryDirection } from "../../../domain/ledger/value-objects/entry-direction-value-object";
import { WalletId } from "../../../domain/wallet/value-objects/wallet-id-value-object";
import { Currency } from "../../../domain/shared/value-objects/currency-value-object";
import { Money } from "../../../domain/shared/value-objects/money-value-object";
import { getExecutor } from "../../config/database/postgresql/pg";

type LedgerEntryRow = {
  id: string
  wallet_id: string
  direction_id: number
  amount_minor_units: string // BIGINT comes back as a string from `pg`
  currency: string
  transaction_id: string
  description: string
  created_at: Date
}

function toLedgerEntry(row: LedgerEntryRow): LedgerEntry {
  const currency = Currency.from(row.currency)
  return new LedgerEntry(
    LedgerEntryId.from(row.id),
    WalletId.from(row.wallet_id),
    new EntryDirection(row.direction_id),
    Money.fromMinorUnits(Number(row.amount_minor_units), currency),
    row.transaction_id,
    row.description,
    row.created_at
  )
}

export class PostgresLedgerRepository implements LedgerRepository {

  // Append-only — LedgerEntry has no mutation path, so this is always a
  // plain multi-row insert, never an upsert. One INSERT with $-placeholders
  // for every leg keeps all entries of one posting in a single round trip
  // (they're expected to be posted together — see LedgerService).
  async saveMany(entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return

    const values: string[] = []
    const params: unknown[] = []
    entries.forEach((entry, index) => {
      const base = index * 7
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      )
      params.push(
        entry.getId().getValue(),
        entry.getWalletId().getValue(),
        entry.getDirection().getId(),
        entry.getMoney().getAmountMinorUnits(),
        entry.getMoney().getCurrency().getCode(),
        entry.getTransactionId(),
        entry.getDescription(),
      )
    })

    await getExecutor().query(
      `INSERT INTO ledger_entries (id, wallet_id, direction_id, amount_minor_units, currency, transaction_id, description)
       VALUES ${values.join(", ")}`,
      params
    )
  }

  async findByWalletId(walletId: WalletId): Promise<LedgerEntry[]> {
    const result = await getExecutor().query<LedgerEntryRow>(
      `SELECT id, wallet_id, direction_id, amount_minor_units, currency, transaction_id, description, created_at
       FROM ledger_entries WHERE wallet_id = $1`,
      [walletId.getValue()]
    )
    return result.rows.map(toLedgerEntry)
  }

  async findByTransactionId(transactionId: string): Promise<LedgerEntry[]> {
    const result = await getExecutor().query<LedgerEntryRow>(
      `SELECT id, wallet_id, direction_id, amount_minor_units, currency, transaction_id, description, created_at
       FROM ledger_entries WHERE transaction_id = $1`,
      [transactionId]
    )
    return result.rows.map(toLedgerEntry)
  }
}
