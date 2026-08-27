import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { Wallet } from '../../../domain/wallet/entities/wallet';
import { WalletId } from '../../../domain/wallet/value-objects/wallet-id-value-object';
import { WalletStatus } from '../../../domain/wallet/value-objects/wallet-status-value-object';
import { WalletRepository } from '../../../domain/wallet/repository/wallet-repository';
import { AccountId } from '../../../domain/account/value-objects/account-id-value-object';
import { Currency } from '../../../domain/shared/value-objects/currency-value-object';
import { Money } from '../../../domain/shared/value-objects/money-value-object';
import { WalletAlreadyExistsError } from '../../../domain/shared/errors';
import { Clock } from '../../../domain/shared/clock';
import { OpenWalletInput } from '../dto/open-wallet-input';
import { OpenWalletOutput } from '../dto/open-wallet-output';

export class OpenWalletUseCase implements UseCase<OpenWalletInput, OpenWalletOutput> {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly clock: Clock
  ) {}

  async execute(input: OpenWalletInput): Promise<OpenWalletOutput> {
    const accountId = AccountId.from(input.accountId);
    const currency = Currency.from(input.currency);

    const existing = await this.walletRepository.findByAccountIdAndCurrency(accountId, currency);
    if (existing) {
      throw new WalletAlreadyExistsError(input.accountId, input.currency);
    }

    const wallet = new Wallet(
      WalletId.generate(),
      accountId,
      currency,
      Money.fromMinorUnits(input.initialBalanceMinorUnits, currency),
      WalletStatus.active(),
      this.clock.now()
    );

    await this.walletRepository.save(wallet);
    return OpenWalletOutput.from(wallet);
  }
}
