import { Remittance } from "../../../domain/remittance/entities/remittance";
import { RemittanceRepository } from "../../../domain/remittance/repository/remittance-repository";
import { RemittanceId } from "../../../domain/remittance/value-objects/remittance-id-value-object";
import { RemittanceStatus } from "../../../domain/remittance/value-objects/remittance-status-value-object";
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object";
import { WalletId } from "../../../domain/wallet/value-objects/wallet-id-value-object";
import { Currency } from "../../../domain/shared/value-objects/currency-value-object";
import { Money } from "../../../domain/shared/value-objects/money-value-object";
import { getExecutor } from "../../config/database/postgresql/pg";

type RemittanceRow = {
  id: string
  sender_account_id: string
  recipient_account_id: string
  source_wallet_id: string
  destination_wallet_id: string
  source_amount_minor_units: string // BIGINT -> string
  source_currency: string
  fee_minor_units: string
  fee_currency: string
  converted_amount_minor_units: string
  destination_currency: string
  exchange_rate: string // NUMERIC -> string
  status_id: number
  created_at: Date
}

function toRemittance(row: RemittanceRow): Remittance {
  return new Remittance(
    RemittanceId.from(row.id),
    AccountId.from(row.sender_account_id),
    AccountId.from(row.recipient_account_id),
    WalletId.from(row.source_wallet_id),
    WalletId.from(row.destination_wallet_id),
    Money.fromMinorUnits(Number(row.source_amount_minor_units), Currency.from(row.source_currency)),
    Money.fromMinorUnits(Number(row.fee_minor_units), Currency.from(row.fee_currency)),
    Money.fromMinorUnits(Number(row.converted_amount_minor_units), Currency.from(row.destination_currency)),
    Number(row.exchange_rate),
    new RemittanceStatus(row.status_id),
    row.created_at
  )
}

export class PostgresRemittanceRepository implements RemittanceRepository {

  // Never mutated after creation in this codebase — plain insert, ON
  // CONFLICT DO NOTHING makes an accidental replay safe.
  async save(remittance: Remittance): Promise<void> {
    await getExecutor().query(
      `INSERT INTO remittances (
         id, sender_account_id, recipient_account_id, source_wallet_id, destination_wallet_id,
         source_amount_minor_units, source_currency, fee_minor_units, fee_currency,
         converted_amount_minor_units, destination_currency, exchange_rate, status_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING`,
      [
        remittance.getId().getValue(),
        remittance.getSenderAccountId().getValue(),
        remittance.getRecipientAccountId().getValue(),
        remittance.getSourceWalletId().getValue(),
        remittance.getDestinationWalletId().getValue(),
        remittance.getSourceAmount().getAmountMinorUnits(),
        remittance.getSourceAmount().getCurrency().getCode(),
        remittance.getFee().getAmountMinorUnits(),
        remittance.getFee().getCurrency().getCode(),
        remittance.getConvertedAmount().getAmountMinorUnits(),
        remittance.getConvertedAmount().getCurrency().getCode(),
        remittance.getExchangeRate(),
        remittance.getStatus().getId(),
        remittance.getCreatedAt(),
      ]
    )
  }

  async findById(remittanceId: RemittanceId): Promise<Remittance | null> {
    const result = await getExecutor().query<RemittanceRow>(
      `SELECT id, sender_account_id, recipient_account_id, source_wallet_id, destination_wallet_id,
              source_amount_minor_units, source_currency, fee_minor_units, fee_currency,
              converted_amount_minor_units, destination_currency, exchange_rate, status_id, created_at
       FROM remittances WHERE id = $1`,
      [remittanceId.getValue()]
    )
    return result.rows[0] ? toRemittance(result.rows[0]) : null
  }
}
