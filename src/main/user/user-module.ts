import { LoginUseCase } from "src/application/user/uses-cases/login-use-case"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { LoginInput } from "src/application/user/dto/login-input"
import { LoginOutput } from "src/application/user/dto/login-output"
import { UserRepository } from "src/domain/user/repository/user-repository"
import { AccountRepository } from "src/domain/account/repository/account-repository"
import { PasswordHasher } from "src/application/shared/security/password-hasher"
import { TokenGenerator } from "src/application/shared/authentication/token-authentication"

export type UserModuleDependencies = {
  userRepository: UserRepository
  accountRepository: AccountRepository
  passwordHasher: PasswordHasher
  tokenGenerator: TokenGenerator
}

// Deliberately NOT wrapped in IdempotentDecorator, unlike every other module
// builder in main/. Idempotency here (see idempotent-decorator.ts) means
// "replay the same key, get back the same cached response" — right for
// creating an account/wallet/remittance exactly once, wrong for login: two
// login calls (even with a caller-reused Idempotency-Key) should each mint
// their own fresh, independently-expiring token rather than one silently
// serving a previous, possibly-closer-to-expiry token from cache.
export function buildUserModule(
  deps: UserModuleDependencies
): UseCase<LoginInput, LoginOutput> {
  return new LoginUseCase(
    deps.userRepository,
    deps.accountRepository,
    deps.passwordHasher,
    deps.tokenGenerator
  )
}
