import { Wallet } from '../../../domain/wallet/entities/wallet';
import { WalletRepository } from '../../../domain/wallet/repository/wallet-repository';
import { WalletId } from '../../../domain/wallet/value-objects/wallet-id-value-object';
import { AccountId } from '../../../domain/account/value-objects/account-id-value-object';
import { Currency } from '../../../domain/shared/value-objects/currency-value-object';

export class InMemoryWalletRepository implements WalletRepository {
  private wallets: Wallet[] = [];

  // Unlike InMemoryAccountRepository (which only ever pushes new accounts),
  // wallets are mutated repeatedly by debits/credits, so save() must upsert
  // by id rather than append a new copy each time.
  async save(wallet: Wallet): Promise<void> {
    const index = this.wallets.findIndex((w) => w.getId().equals(wallet.getId()));
    if (index === -1) {
      this.wallets.push(wallet);
    } else {
      this.wallets[index] = wallet;
    }
  }

  async findById(walletId: WalletId): Promise<Wallet | null> {
    return this.wallets.find((w) => w.getId().equals(walletId)) ?? null;
  }

  async findByAccountIdAndCurrency(
    accountId: AccountId,
    currency: Currency
  ): Promise<Wallet | null> {
    return (
      this.wallets.find(
        (w) => w.getAccountId().equals(accountId) && w.getCurrency().equals(currency)
      ) ?? null
    );
  }
}
