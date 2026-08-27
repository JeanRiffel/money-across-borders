import { AccountId } from '../../account/value-objects/account-id-value-object';
import { Currency } from '../../shared/value-objects/currency-value-object';
import { Money } from '../../shared/value-objects/money-value-object';
import { CurrencyMismatchError, InsufficientFundsError } from '../../shared/errors';
import { WalletId } from '../value-objects/wallet-id-value-object';
import { WalletStatus } from '../value-objects/wallet-status-value-object';

export class Wallet {
  constructor(
    private readonly id: WalletId,
    private readonly accountId: AccountId,
    private readonly currency: Currency,
    private readonly balance: Money,
    private readonly status: WalletStatus,
    private readonly createdAt: Date
  ) {}

  getId(): WalletId {
    return this.id;
  }

  getAccountId(): AccountId {
    return this.accountId;
  }

  getCurrency(): Currency {
    return this.currency;
  }

  getBalance(): Money {
    return this.balance;
  }

  getStatus(): WalletStatus {
    return this.status;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  // Returns a new Wallet instance rather than mutating in place, keeping the
  // entity immutable-style like Account — callers persist the returned copy.
  credit(amount: Money): Wallet {
    this.assertSameCurrency(amount);
    return new Wallet(
      this.id,
      this.accountId,
      this.currency,
      this.balance.add(amount),
      this.status,
      this.createdAt
    );
  }

  debit(amount: Money): Wallet {
    this.assertSameCurrency(amount);
    if (!this.balance.isGreaterThanOrEqual(amount)) {
      throw new InsufficientFundsError(this.id.getValue());
    }
    return new Wallet(
      this.id,
      this.accountId,
      this.currency,
      this.balance.subtract(amount),
      this.status,
      this.createdAt
    );
  }

  private assertSameCurrency(amount: Money): void {
    if (!amount.getCurrency().equals(this.currency)) {
      throw new CurrencyMismatchError(this.currency.getCode(), amount.getCurrency().getCode());
    }
  }
}
