import { Wallet } from "../../../domain/wallet/entities/wallet";
import { WalletRepository } from "../../../domain/wallet/repository/wallet-repository";
import { WalletId } from "../../../domain/wallet/value-objects/wallet-id-value-object";
import { WalletStatus } from "../../../domain/wallet/value-objects/wallet-status-value-object";
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object";
import { Currency } from "../../../domain/shared/value-objects/currency-value-object";
import { Money } from "../../../domain/shared/value-objects/money-value-object";
import { getExecutor } from "../../config/database/postgresql/pg";

type WalletRow = {
  id: string
  account_id: string
  currency: string
  balance_minor_units: string // BIGINT comes back as a string from `pg`
  status_id: number
  created_at: Date
}

function toWallet(row: WalletRow): Wallet {
  const currency = Currency.from(row.currency)
  return new Wallet(
    WalletId.from(row.id),
    AccountId.from(row.account_id),
    currency,
    Money.fromMinorUnits(Number(row.balance_minor_units), currency),
    new WalletStatus(row.status_id),
    row.created_at
  )
}

export class PostgresWalletRepository implements WalletRepository {

  // Unlike account/user, wallets are saved repeatedly after credit()/debit()
  // — this must be a real upsert (matches InMemoryWalletRepository's
  // upsert-by-id behavior), not an insert-and-ignore.
  async save(wallet: Wallet): Promise<void> {
    await getExecutor().query(
      `INSERT INTO wallets (id, account_id, currency, balance_minor_units, status_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         balance_minor_units = EXCLUDED.balance_minor_units,
         status_id = EXCLUDED.status_id`,
      [
        wallet.getId().getValue(),
        wallet.getAccountId().getValue(),
        wallet.getCurrency().getCode(),
        wallet.getBalance().getAmountMinorUnits(),
        wallet.getStatus().getId(),
        wallet.getCreatedAt(),
      ]
    )
  }

  async findById(walletId: WalletId): Promise<Wallet | null> {
    const result = await getExecutor().query<WalletRow>(
      `SELECT id, account_id, currency, balance_minor_units, status_id, created_at
       FROM wallets WHERE id = $1`,
      [walletId.getValue()]
    )
    return result.rows[0] ? toWallet(result.rows[0]) : null
  }

  async findByAccountIdAndCurrency(accountId: AccountId, currency: Currency): Promise<Wallet | null> {
    const result = await getExecutor().query<WalletRow>(
      `SELECT id, account_id, currency, balance_minor_units, status_id, created_at
       FROM wallets WHERE account_id = $1 AND currency = $2`,
      [accountId.getValue(), currency.getCode()]
    )
    return result.rows[0] ? toWallet(result.rows[0]) : null
  }
}
