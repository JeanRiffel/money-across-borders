import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { UserRepository } from '../../../domain/user/repository/user-repository';
import { AccountRepository } from '../../../domain/account/repository/account-repository';
import { PasswordHasher } from 'src/application/shared/security/password-hasher';
import { TokenGenerator } from 'src/application/shared/authentication/token-authentication';
import { InvalidCredentialsError } from '../../../domain/shared/errors';
import { LoginInput } from '../dto/login-input';
import { LoginOutput } from '../dto/login-output';

export class LoginUseCase implements UseCase<LoginInput, LoginOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly accountRepository: AccountRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenGenerator: TokenGenerator
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.compare(
      input.password,
      user.getPasswordHash()
    );
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    if (!user.getStatus().isActive()) {
      throw new InvalidCredentialsError();
    }

    // Every User provisioned through CreateAccountUseCase gets exactly one
    // Account in the same request (see create-account-use-case.ts). This
    // would only be null if that invariant were ever broken elsewhere —
    // there's no unit-of-work across the two saves (a known, documented
    // simplification in this codebase), so failing loudly here beats
    // silently issuing a token with no usable accountId.
    const account = await this.accountRepository.findByUserId(user.getId());
    if (!account) {
      throw new Error(`No account found for user ${user.getId().getValue()}`);
    }

    const token = this.tokenGenerator.generate({
      userId: user.getId().getValue(),
      accountId: account.getId().getValue(),
    });

    return LoginOutput.from(token, user, account);
  }
}
