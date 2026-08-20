import { buildAccountModule } from "src/main/account/account-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { CreateAccountInput } from "src/application/account/dto/create-account-input";
import { CreateAccountOutput } from "src/application/account/dto/create-account-output";
import { BcryptPasswordHasher } from "../security/bycrypt-password-hasher";
import { inMemoryRegistry } from "../persistence/in-memory/in-memory-registry";

// Wired to the shared in-memory registry rather than Postgres*Repository:
// the Postgres adapters (account + user) are still stubs (throw "Method not
// implemented."), so pointing here is what actually makes account creation
// work end-to-end. Also means every factory sees the same accounts/users
// (see in-memory-registry.ts).
export function createAccountUseCase(): UseCase<CreateAccountInput, CreateAccountOutput> {
  const dependencies = {
    accountRepository: inMemoryRegistry.accountRepository,
    userRepository: inMemoryRegistry.userRepository,
    idempotencyRepository: inMemoryRegistry.idempotencyRepository,
    passwordHasher: new BcryptPasswordHasher()
  }

  return buildAccountModule(dependencies)
}
