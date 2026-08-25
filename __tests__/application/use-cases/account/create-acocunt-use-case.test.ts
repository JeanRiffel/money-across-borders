import { CreateAccountUseCase } from '../../../../src/application/account/uses-cases/create-account-use-case'
import { InMemoryAccountRepository } from '../../../../src/infra/persistence/in-memory/in-memory-account-repository'
import { InMemoryUserRepository } from '../../../../src/infra/persistence/in-memory/in-memory-user-repository'
import { BcryptPasswordHasher } from '../../../../src/infra/security/bycrypt-password-hasher'
import { InMemoryOutboxRepository } from '../../../../src/infra/persistence/in-memory/in-memory-outbox-repository'
import { InMemoryUnitOfWork } from '../../../../src/infra/persistence/in-memory/in-memory-unit-of-work'
import { CreateAccountInput } from '../../../../src/application/account/dto/create-account-input'

describe('CreateAccountUseCase', () => {
  it('should create an account', async () => {

    const createUseCase = new CreateAccountUseCase(
      new InMemoryAccountRepository,
      new InMemoryUserRepository,
      new BcryptPasswordHasher,
      new InMemoryUnitOfWork,
      new InMemoryOutboxRepository
    )

    const input = CreateAccountInput.from({
      email: 'john@test.com,',
      password: '1234'
    })

    const useCase = await createUseCase.execute(input)

    expect(useCase.status).toEqual('OPEN')
    expect(useCase.email).toEqual('john@test.com,')

  })

  it('records an account.created event in the outbox after signup, so the relay can deliver a confirmation email trigger later', async () => {

    const outboxRepository = new InMemoryOutboxRepository()

    const createUseCase = new CreateAccountUseCase(
      new InMemoryAccountRepository,
      new InMemoryUserRepository,
      new BcryptPasswordHasher,
      new InMemoryUnitOfWork,
      outboxRepository
    )

    const input = CreateAccountInput.from({
      email: 'jane@test.com',
      password: '1234'
    })

    const output = await createUseCase.execute(input)

    const outboxEvents = outboxRepository.getEvents()
    expect(outboxEvents).toHaveLength(1)
    expect(outboxEvents[0].topic).toEqual('account.created')
    expect(outboxEvents[0].payload).toMatchObject({
      accountId: output.accountId,
      email: 'jane@test.com',
    })

    // Recorded, but not yet relayed — that's the outbox relay's job
    // (src/infra/events/consumers/outbox-relay.ts), not this use case's.
    const unpublished = await outboxRepository.findUnpublished(10)
    expect(unpublished).toHaveLength(1)
  })
})
