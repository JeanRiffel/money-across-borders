import { buildUserModule } from "src/main/user/user-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { LoginInput } from "src/application/user/dto/login-input";
import { LoginOutput } from "src/application/user/dto/login-output";
import { TokenGenerator } from "src/application/shared/authentication/token-authentication";
import { BcryptPasswordHasher } from "../security/bycrypt-password-hasher";
import { inMemoryRegistry } from "../persistence/in-memory/in-memory-registry";

// Takes the already-constructed JWTService (server.ts's single instance,
// also used as the TokenVerifier for authMiddleware) rather than building
// its own — generation and verification must share the same secret/instance
// role for tokens minted here to actually pass authMiddleware later.
export function createLoginUseCase(tokenGenerator: TokenGenerator): UseCase<LoginInput, LoginOutput> {
  const dependencies = {
    userRepository: inMemoryRegistry.userRepository,
    accountRepository: inMemoryRegistry.accountRepository,
    passwordHasher: new BcryptPasswordHasher(),
    tokenGenerator
  }

  return buildUserModule(dependencies)
}
