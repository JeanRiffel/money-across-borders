import { buildAccountModule } from "src/main/account/account-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { CreateAccountInput } from "src/application/account/dto/create-account-input";
import { CreateAccountOutput } from "src/application/account/dto/create-account-output";
import { BcryptPasswordHasher } from "../security/bycrypt-password-hasher";
import { postgresRegistry } from "../persistence/postgresql/postgres-registry";
import { redisRegistry } from "../persistence/redis/redis-registry";

export function createAccountUseCase(): UseCase<CreateAccountInput, CreateAccountOutput> {
  const dependencies = {
    accountRepository: postgresRegistry.accountRepository,
    userRepository: postgresRegistry.userRepository,
    // Idempotency now lives in Redis, not Postgres — see redis-registry.ts.
    // connectRedis() has already resolved by the time this use case is
    // invoked (buildApp() awaits it before wiring any router), so the
    // shared client this wraps is connected despite this factory itself
    // staying synchronous.
    idempotencyRepository: redisRegistry.idempotencyRepository,
    passwordHasher: new BcryptPasswordHasher()
  }

  return buildAccountModule(dependencies)
}
