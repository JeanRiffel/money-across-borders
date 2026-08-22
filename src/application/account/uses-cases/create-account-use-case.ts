import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { Account } from "../../../domain/account/entities/account"
import { AccountRepository } from "../../../domain/account/repository/account-repository"
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object"
import { AccountStatus } from "../../../domain/account/value-objects/account-status-value-object"
import { User } from "../../../domain/user/entities/user"
import { UserRepository } from "../../../domain/user/repository/user-repository"
import { UserId } from "../../../domain/user/value-objects/user-id-value-object"
import { UserStatus } from "../../../domain/user/value-objects/user-status-value-object"
import { SystemClock } from "../../../infra/time/system-clock"
import { CreateAccountOutput } from "../dto/create-account-output"
import { CreateAccountInput } from "../dto/create-account-input"
import { PasswordHasher } from "src/application/shared/security/password-hasher"
import { EmailAlreadyExistsError } from "../../../domain/shared/errors"


export class CreateAccountUseCase implements UseCase<CreateAccountInput, CreateAccountOutput> {

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher
  ){}

  async execute(input: CreateAccountInput): Promise<CreateAccountOutput>{
    // Pre-check against the natural key. This isn't itself concurrency-safe
    // (two signups for the same email racing here can both pass it) — the
    // real guarantee is users.email's UNIQUE constraint; this just turns the
    // common, non-racing case into a clean domain error instead of a raw
    // Postgres unique-violation reaching the controller. See
    // CreateAccountController for the fallback that catches the race.
    const existingUser = await this.userRepository.findByEmail(input.email)
    if (existingUser) {
      throw new EmailAlreadyExistsError(input.email)
    }

    const hashedPassword = await this.passwordHasher.hash(input.password)
    const createdAt = new SystemClock().now()

    // Signup is one action from the caller's point of view (POST /account),
    // but provisions two separate aggregates: a User for identity/login,
    // and an Account for the financial relationship that Wallet/Remittance/
    // KycProfile reference. See domain/user/entities/user.ts and
    // domain/account/entities/account.ts for why they're split.
    const user = new User(
      UserId.generate(),
      input.email,
      hashedPassword,
      UserStatus.active(),
      createdAt
    )
    await this.userRepository.save(user)

    const account = new Account(
      AccountId.generate(),
      user.getId(),
      new AccountStatus(1),
      createdAt
    )
    await this.accountRepository.save(account)

    return CreateAccountOutput.from(account, user)
  }

}
