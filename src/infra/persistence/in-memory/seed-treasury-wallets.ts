import { Wallet } from '../../../domain/wallet/entities/wallet';
import { WalletId } from '../../../domain/wallet/value-objects/wallet-id-value-object';
import { WalletStatus } from '../../../domain/wallet/value-objects/wallet-status-value-object';
import { WalletRepository } from '../../../domain/wallet/repository/wallet-repository';
import { TREASURY_ACCOUNT_ID } from '../../../domain/wallet/treasury-account';
import { Currency } from '../../../domain/shared/value-objects/currency-value-object';
import { Money } from '../../../domain/shared/value-objects/money-value-object';
import { Clock } from '../../../domain/shared/clock';

// Large fixed starting balance per currency, standing in for continuous
// nostro/vostro rebalancing a real FX desk would perform — out of scope here.
const TREASURY_SEED_BALANCE_MINOR_UNITS = 1_000_000_000;

export async function seedTreasuryWallets(
  walletRepository: WalletRepository,
  clock: Clock
): Promise<void> {
  for (const code of Currency.supportedCodes()) {
    const currency = Currency.from(code);
    const existing = await walletRepository.findByAccountIdAndCurrency(
      TREASURY_ACCOUNT_ID,
      currency
    );
    if (existing) continue;

    const treasuryWallet = new Wallet(
      WalletId.generate(),
      TREASURY_ACCOUNT_ID,
      currency,
      Money.fromMinorUnits(TREASURY_SEED_BALANCE_MINOR_UNITS, currency),
      WalletStatus.active(),
      clock.now()
    );
    await walletRepository.save(treasuryWallet);
  }
}
