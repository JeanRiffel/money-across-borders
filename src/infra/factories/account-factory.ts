import { buildAccountModule } from "src/main/account/account-module";
import { UseCase } from "src/application/shared/idempotency/common-use-case.";
import { CreateAccountInput } from "src/application/account/dto/create-account-input";
import { CreateAccountOutput } from "src/application/account/dto/create-account-output";
import { BcryptPasswordHasher } from "../security/bycrypt-password-hasher";
import { postgresRegistry } from "../persistence/postgresql/postgres-registry";
import { redisRegistry } from "../persistence/redis/redis-registry";
import { RabbitMQEventPublisher } from "../events/rabbitmq-event-publisher";

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
    passwordHasher: new BcryptPasswordHasher(),
    // Wraps the User + Account saves in one real Postgres transaction —
    // see the UnitOfWork comment on CreateAccountUseCase. Same shared
    // instance remittance-factory.ts wires SendRemittanceUseCase to.
    unitOfWork: postgresRegistry.unitOfWork,
    // Publishes account.created to RabbitMQ (see account-created-consumer.ts
    // for the "simulated confirmation email" side) — unlike Redis above,
    // an unreachable broker here is non-fatal: RabbitMQEventPublisher
    // swallows its own connection/publish failures (see its comment), so
    // this factory doesn't need to await any connection check.
    eventPublisher: new RabbitMQEventPublisher()
  }

  return buildAccountModule(dependencies)
}
