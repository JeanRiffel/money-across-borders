import { CreateAccountUseCase } from '../../../../src/application/account/uses-cases/create-account-use-case'
import { InMemoryAccountRepository } from '../../../../src/infra/persistence/in-memory/in-memory-account-repository'
import { InMemoryUserRepository } from '../../../../src/infra/persistence/in-memory/in-memory-user-repository'
import { BcryptPasswordHasher } from '../../../../src/infra/security/bycrypt-password-hasher'
import { InMemoryEventPublisher } from '../../../../src/infra/events/in-memory-event-publisher'
import { InMemoryUnitOfWork } from '../../../../src/infra/persistence/in-memory/in-memory-unit-of-work'
import { CreateAccountInput } from '../../../../src/application/account/dto/create-account-input'

describe('CreateAccountUseCase', () => {
  it('should create an account', async () => {

    const createUseCase = new CreateAccountUseCase(
      new InMemoryAccountRepository,
      new InMemoryUserRepository,
      new BcryptPasswordHasher,
      new InMemoryUnitOfWork,
      new InMemoryEventPublisher
    )

    const input = CreateAccountInput.from({
      email: 'john@test.com,',
      password: '1234'
    })

    const useCase = await createUseCase.execute(input)

    expect(useCase.status).toEqual('OPEN')
    expect(useCase.email).toEqual('john@test.com,')

  })

  it('publishes an account.created event after signup, simulating a confirmation email trigger', async () => {

    const eventPublisher = new InMemoryEventPublisher()

    const createUseCase = new CreateAccountUseCase(
      new InMemoryAccountRepository,
      new InMemoryUserRepository,
      new BcryptPasswordHasher,
      new InMemoryUnitOfWork,
      eventPublisher
    )

    const input = CreateAccountInput.from({
      email: 'jane@test.com',
      password: '1234'
    })

    const output = await createUseCase.execute(input)

    const publishedEvents = eventPublisher.getPublishedEvents()
    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0].topic).toEqual('account.created')
    expect(publishedEvents[0].payload).toMatchObject({
      accountId: output.accountId,
      email: 'jane@test.com',
    })
  })
})
