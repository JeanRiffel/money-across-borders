import { AccountId } from '../../account/value-objects/account-id-value-object';
import { WalletId } from '../../wallet/value-objects/wallet-id-value-object';
import { Money } from '../../shared/value-objects/money-value-object';
import { RemittanceId } from '../value-objects/remittance-id-value-object';
import { RemittanceStatus } from '../value-objects/remittance-status-value-object';

/**
 * Remittance is the business-facing record of one cross-border transfer.
 * It's a snapshot of the deal (rate, fee, amounts) alongside the outcome —
 * the actual accounting substrate is the set of LedgerEntry legs sharing its
 * transactionId (see LedgerService).
 */
export class Remittance {
  constructor(
    private readonly id: RemittanceId,
    private readonly senderAccountId: AccountId,
    private readonly recipientAccountId: AccountId,
    private readonly sourceWalletId: WalletId,
    private readonly destinationWalletId: WalletId,
    private readonly sourceAmount: Money,
    private readonly fee: Money,
    private readonly convertedAmount: Money,
    private readonly exchangeRate: number,
    private readonly status: RemittanceStatus,
    private readonly createdAt: Date
  ) {}

  getId(): RemittanceId {
    return this.id;
  }

  getSenderAccountId(): AccountId {
    return this.senderAccountId;
  }

  getRecipientAccountId(): AccountId {
    return this.recipientAccountId;
  }

  getSourceWalletId(): WalletId {
    return this.sourceWalletId;
  }

  getDestinationWalletId(): WalletId {
    return this.destinationWalletId;
  }

  getSourceAmount(): Money {
    return this.sourceAmount;
  }

  getFee(): Money {
    return this.fee;
  }

  getConvertedAmount(): Money {
    return this.convertedAmount;
  }

  getExchangeRate(): number {
    return this.exchangeRate;
  }

  getStatus(): RemittanceStatus {
    return this.status;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  // The remittance id doubles as the grouping id for its ledger legs, so the
  // business record and its accounting substrate are always linkable by the
  // same identifier.
  getTransactionId(): string {
    return this.id.getValue();
  }
}
