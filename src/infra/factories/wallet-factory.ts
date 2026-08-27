import { buildWalletModule } from 'src/main/wallet/wallet-module';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { OpenWalletInput } from 'src/application/wallet/dto/open-wallet-input';
import { OpenWalletOutput } from 'src/application/wallet/dto/open-wallet-output';
import { SystemClock } from '../time/system-clock';
import { postgresRegistry } from '../persistence/postgresql/postgres-registry';
import { redisRegistry } from '../persistence/redis/redis-registry';

export function createOpenWalletUseCase(): UseCase<OpenWalletInput, OpenWalletOutput> {
  const dependencies = {
    walletRepository: postgresRegistry.walletRepository,
    // See the equivalent comment in account-factory.ts.
    idempotencyRepository: redisRegistry.idempotencyRepository,
    clock: new SystemClock(),
  };

  return buildWalletModule(dependencies);
}
