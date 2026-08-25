import { IdempotentDecorator } from "src/application/shared/idempotency/idempotent-decorator"
import { CreateAccountUseCase } from "src/application/account/uses-cases/create-account-use-case"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { CreateAccountInput } from "src/application/account/dto/create-account-input"
import { CreateAccountOutput } from "src/application/account/dto/create-account-output"
import { AccountRepository } from "src/domain/account/repository/account-repository"
import { UserRepository } from "src/domain/user/repository/user-repository"
import { IdempotencyRepository } from "src/application/repositories/idempotency-repository"
import { BcryptPasswordHasher } from "src/infra/security/bycrypt-password-hasher"
import { EventPublisher } from "src/application/shared/events/event-publisher"

export type AccountModuleDependencies = {
  accountRepository: AccountRepository
  userRepository: UserRepository
  idempotencyRepository: IdempotencyRepository
  passwordHasher: BcryptPasswordHasher
  eventPublisher: EventPublisher
}

export function buildAccountModule(
  deps: AccountModuleDependencies
): UseCase<
  CreateAccountInput & { idempotencyKey: string },
  CreateAccountOutput
> {
  const createAccountUseCase =
    new CreateAccountUseCase(
      deps.accountRepository,
      deps.userRepository,
      deps.passwordHasher,
      deps.eventPublisher
    )

  const idempotentCreateAccount =
    new IdempotentDecorator(
      createAccountUseCase,
      deps.idempotencyRepository
    )

  return idempotentCreateAccount
}
