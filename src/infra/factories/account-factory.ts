import { buildAccountModule } from "src/main/account/account-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { CreateAccountInput } from "src/application/account/dto/create-account-input";
import { CreateAccountOutput } from "src/application/account/dto/create-account-output";
import { BcryptPasswordHasher } from "../security/bycrypt-password-hasher";
import { postgresRegistry } from "../persistence/postgresql/postgres-registry";

export function createAccountUseCase(): UseCase<CreateAccountInput, CreateAccountOutput> {
  const dependencies = {
    accountRepository: postgresRegistry.accountRepository,
    userRepository: postgresRegistry.userRepository,
    idempotencyRepository: postgresRegistry.idempotencyRepository,
    passwordHasher: new BcryptPasswordHasher()
  }

  return buildAccountModule(dependencies)
}
