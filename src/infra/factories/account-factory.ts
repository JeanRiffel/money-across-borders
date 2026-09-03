import { buildAccountModule } from 'src/main/account/account-module';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { CreateAccountInput } from 'src/application/account/dto/create-account-input';
import { CreateAccountOutput } from 'src/application/account/dto/create-account-output';
import { BcryptPasswordHasher } from '../security/bycrypt-password-hasher';
import { postgresRegistry } from '../persistence/postgresql/postgres-registry';
import { redisRegistry } from '../persistence/redis/redis-registry';

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
    // Wraps the User + Account saves (and the outbox write below) in one
    // real Postgres transaction — see the UnitOfWork comment on
    // CreateAccountUseCase. Same shared instance remittance-factory.ts
    // wires SendRemittanceUseCase to.
    unitOfWork: postgresRegistry.unitOfWork,
    // Transactional Outbox: account.created is written here, inside the
    // same transaction as the User + Account saves, instead of being
    // published to RabbitMQ directly — see the constructor comment on
    // CreateAccountUseCase for why. worker:outbox-relay
    // (src/infra/events/consumers/rabbitmq-outbox-relay.ts) is the process that
    // actually delivers these to RabbitMQ.
    outboxRepository: postgresRegistry.outboxRepository,
  };

  return buildAccountModule(dependencies);
}
