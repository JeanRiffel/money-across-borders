import { CreateAccountInput } from '../../../../src/application/account/dto/create-account-input'
import { ValidationError } from '../../../../src/domain/shared/errors'

describe('CreateAccountInput.from', () => {
  it('builds an input from a valid raw request body', () => {
    const input = CreateAccountInput.from({ email: 'jane@test.com', password: 'correct-password' })

    expect(input.email).toEqual('jane@test.com')
    expect(input.password).toEqual('correct-password')
  })

  it('rejects a malformed email', () => {
    expect(() => CreateAccountInput.from({ email: 'not-an-email', password: 'correct-password' }))
      .toThrow(ValidationError)
  })

  it('rejects a missing password', () => {
    expect(() => CreateAccountInput.from({ email: 'jane@test.com' }))
      .toThrow(/password/)
  })
})
