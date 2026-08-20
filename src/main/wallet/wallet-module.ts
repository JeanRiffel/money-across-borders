import { IdempotentDecorator } from "src/application/shared/idempotency/idempotent-decorator"
import { OpenWalletUseCase } from "src/application/wallet/uses-cases/open-wallet-use-case"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { OpenWalletInput } from "src/application/wallet/dto/open-wallet-input"
import { OpenWalletOutput } from "src/application/wallet/dto/open-wallet-output"
import { WalletRepository } from "src/domain/wallet/repository/wallet-repository"
import { IdempotencyRepository } from "src/application/repositories/idempotency-repository"
import { Clock } from "src/domain/shared/clock"

export type WalletModuleDependencies = {
  walletRepository: WalletRepository
  idempotencyRepository: IdempotencyRepository
  clock: Clock
}

export function buildWalletModule(
  deps: WalletModuleDependencies
): UseCase<
  OpenWalletInput & { idempotencyKey: string },
  OpenWalletOutput
> {
  const openWalletUseCase =
    new OpenWalletUseCase(
      deps.walletRepository,
      deps.clock
    )

  const idempotentOpenWallet =
    new IdempotentDecorator(
      openWalletUseCase,
      deps.idempotencyRepository
    )

  return idempotentOpenWallet
}
