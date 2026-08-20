import { Wallet } from '../../../domain/wallet/entities/wallet'

export class OpenWalletOutput {
  constructor(
    public readonly walletId: string,
    public readonly accountId: string,
    public readonly currency: string,
    public readonly balanceMinorUnits: number,
    public readonly status: string,
    public readonly createdAt: string
  ) {}

  static from(wallet: Wallet): OpenWalletOutput {
    return new OpenWalletOutput(
      wallet.getId().getValue(),
      wallet.getAccountId().getValue(),
      wallet.getCurrency().getCode(),
      wallet.getBalance().getAmountMinorUnits(),
      wallet.getStatus().getDescription(),
      wallet.getCreatedAt().toISOString()
    )
  }
}
