import { LoginUseCase } from '../../../../src/application/user/uses-cases/login-use-case'
import { CreateAccountUseCase } from '../../../../src/application/account/uses-cases/create-account-use-case'
import { InMemoryUserRepository } from '../../../../src/infra/persistence/in-memory/in-memory-user-repository'
import { InMemoryAccountRepository } from '../../../../src/infra/persistence/in-memory/in-memory-account-repository'
import { BcryptPasswordHasher } from '../../../../src/infra/security/bycrypt-password-hasher'
import { CreateAccountInput } from '../../../../src/application/account/dto/create-account-input'
import { LoginInput } from '../../../../src/application/user/dto/login-input'
import { InvalidCredentialsError } from '../../../../src/domain/shared/errors'
import { TokenGenerator } from '../../../../src/application/shared/authentication/token-authentication'
import { InMemoryEventPublisher } from '../../../../src/infra/events/in-memory-event-publisher'

const fakeTokenGenerator: TokenGenerator = {
  generate: (payload: object) => `fake-token.${JSON.stringify(payload)}`
}

describe('LoginUseCase', () => {

  async function signUp(userRepository: InMemoryUserRepository, accountRepository: InMemoryAccountRepository) {
    const passwordHasher = new BcryptPasswordHasher()
    const createAccount = new CreateAccountUseCase(accountRepository, userRepository, passwordHasher, new InMemoryEventPublisher())
    const input = CreateAccountInput.from({ email: 'jane@test.com', password: 'correct-password' })
    return createAccount.execute(input)
  }

  it('should log in with correct credentials and return a token for the signed-up account', async () => {
    const userRepository = new InMemoryUserRepository()
    const accountRepository = new InMemoryAccountRepository()
    await signUp(userRepository, accountRepository)

    const login = new LoginUseCase(userRepository, accountRepository, new BcryptPasswordHasher(), fakeTokenGenerator)
    const output = await login.execute(LoginInput.from({ email: 'jane@test.com', password: 'correct-password' }))

    expect(output.email).toEqual('jane@test.com')
    expect(output.token).toContain('fake-token.')
    expect(output.accountId).toBeDefined()
    expect(output.userId).toBeDefined()
  })

  it('should reject an unknown email', async () => {
    const userRepository = new InMemoryUserRepository()
    const accountRepository = new InMemoryAccountRepository()

    const login = new LoginUseCase(userRepository, accountRepository, new BcryptPasswordHasher(), fakeTokenGenerator)

    await expect(
      login.execute(LoginInput.from({ email: 'nobody@test.com', password: 'whatever' }))
    ).rejects.toThrow(InvalidCredentialsError)
  })

  it('should reject the wrong password', async () => {
    const userRepository = new InMemoryUserRepository()
    const accountRepository = new InMemoryAccountRepository()
    await signUp(userRepository, accountRepository)

    const login = new LoginUseCase(userRepository, accountRepository, new BcryptPasswordHasher(), fakeTokenGenerator)

    await expect(
      login.execute(LoginInput.from({ email: 'jane@test.com', password: 'wrong-password' }))
    ).rejects.toThrow(InvalidCredentialsError)
  })

})
