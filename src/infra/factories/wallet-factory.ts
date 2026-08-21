import { buildWalletModule } from "src/main/wallet/wallet-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { OpenWalletInput } from "src/application/wallet/dto/open-wallet-input";
import { OpenWalletOutput } from "src/application/wallet/dto/open-wallet-output";
import { SystemClock } from "../time/system-clock";
import { postgresRegistry } from "../persistence/postgresql/postgres-registry";

export function createOpenWalletUseCase(): UseCase<OpenWalletInput, OpenWalletOutput> {
  const dependencies = {
    walletRepository: postgresRegistry.walletRepository,
    idempotencyRepository: postgresRegistry.idempotencyRepository,
    clock: new SystemClock()
  }

  return buildWalletModule(dependencies)
}
