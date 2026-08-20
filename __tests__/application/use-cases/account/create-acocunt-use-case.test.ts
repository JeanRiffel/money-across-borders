import { CreateAccountUseCase } from '../../../../src/application/account/uses-cases/create-account-use-case'
import { InMemoryAccountRepository } from '../../../../src/infra/persistence/in-memory/in-memory-account-repository'
import { InMemoryUserRepository } from '../../../../src/infra/persistence/in-memory/in-memory-user-repository'
import { BcryptPasswordHasher } from '../../../../src/infra/security/bycrypt-password-hasher'
import { CreateAccountInput } from '../../../../src/application/account/dto/create-account-input'

describe('CreateAccountUseCase', () => {
  it('should create an account', async () => {

    const createUseCase = new CreateAccountUseCase(
      new InMemoryAccountRepository,
      new InMemoryUserRepository,
      new BcryptPasswordHasher
    )

    const input = CreateAccountInput.from({
      email: 'john@test.com,',
      password: '1234'
    })

    const useCase = await createUseCase.execute(input)

    expect(useCase.status).toEqual('OPEN')
    expect(useCase.email).toEqual('john@test.com,')

  })
})
