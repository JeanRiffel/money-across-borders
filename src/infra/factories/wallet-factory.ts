import { buildWalletModule } from "src/main/wallet/wallet-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { OpenWalletInput } from "src/application/wallet/dto/open-wallet-input";
import { OpenWalletOutput } from "src/application/wallet/dto/open-wallet-output";
import { SystemClock } from "../time/system-clock";
import { inMemoryRegistry } from "../persistence/in-memory/in-memory-registry";

export function createOpenWalletUseCase(): UseCase<OpenWalletInput, OpenWalletOutput> {
  const dependencies = {
    walletRepository: inMemoryRegistry.walletRepository,
    idempotencyRepository: inMemoryRegistry.idempotencyRepository,
    clock: new SystemClock()
  }

  return buildWalletModule(dependencies)
}
