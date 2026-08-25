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
import { EventPublisher } from "src/application/shared/events/event-publisher"
import { UnitOfWork } from "src/application/shared/transaction/unit-of-work"


export class CreateAccountUseCase implements UseCase<CreateAccountInput, CreateAccountOutput> {

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    // Required and explicit, same as SendRemittanceUseCase's UnitOfWork:
    // the User + Account saves below are two separate aggregates that must
    // commit together — without this, a failure between the two saves
    // leaves an orphaned User with no matching Account (see doExecute).
    private readonly unitOfWork: UnitOfWork,
    // No default (unlike, say, letting this silently fall back to a no-op
    // infra adapter) — required and explicit, the same way SendRemittanceUseCase
    // takes its UnitOfWork: the application layer depends on the
    // EventPublisher port only, never on which infra adapter satisfies it.
    private readonly eventPublisher: EventPublisher
  ){}

  // The User + Account saves run inside a single DB transaction (see
  // UnitOfWork): a failure after the User save but before the Account save
  // now rolls both back instead of leaving an orphaned User with no
  // Account — which used to lock that email out permanently (the
  // pre-check below would find the User and throw EmailAlreadyExistsError
  // on every retry, forever). The in-memory implementation is a no-op
  // passthrough, so this changes nothing about how tests exercise this
  // use case.
  async execute(input: CreateAccountInput): Promise<CreateAccountOutput>{
    const { account, user } = await this.unitOfWork.runInTransaction(() => this.doExecute(input))

    // Published only after runInTransaction resolves — i.e. only once the
    // transaction has actually committed. Publishing from inside
    // doExecute() instead would risk announcing account.created for a
    // signup that still rolls back afterward (e.g. a COMMIT-time
    // failure) — EventPublisher's own "never throws" contract guards the
    // other direction (a down RabbitMQ can't fail an already-committed
    // signup), but can't undo a wrong ordering here.
    await this.eventPublisher.publish('account.created', {
      accountId: account.getId().getValue(),
      userId: user.getId().getValue(),
      email: user.getEmail(),
      createdAt: user.getCreatedAt().toISOString(),
    })

    return CreateAccountOutput.from(account, user)
  }

  private async doExecute(input: CreateAccountInput): Promise<{ account: Account; user: User }> {
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

    return { account, user }
  }

}
