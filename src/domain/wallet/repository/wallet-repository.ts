import { Wallet } from '../entities/wallet';
import { WalletId } from '../value-objects/wallet-id-value-object';
import { AccountId } from '../../account/value-objects/account-id-value-object';
import { Currency } from '../../shared/value-objects/currency-value-object';

export interface WalletRepository {
  save(wallet: Wallet): Promise<void>;
  findById(walletId: WalletId): Promise<Wallet | null>;
  findByAccountIdAndCurrency(accountId: AccountId, currency: Currency): Promise<Wallet | null>;
}
