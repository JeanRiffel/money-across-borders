import { LoginInput } from '../../../../src/application/user/dto/login-input'
import { ValidationError } from '../../../../src/domain/shared/errors'

describe('LoginInput.from', () => {
  it('builds an input from a valid raw request body', () => {
    const input = LoginInput.from({ email: 'jane@test.com', password: 'correct-password' })

    expect(input.email).toEqual('jane@test.com')
    expect(input.password).toEqual('correct-password')
  })

  it('rejects a malformed email', () => {
    expect(() => LoginInput.from({ email: 'not-an-email', password: 'correct-password' }))
      .toThrow(ValidationError)
  })

  it('rejects a missing email', () => {
    expect(() => LoginInput.from({ password: 'correct-password' }))
      .toThrow(/email/)
  })
})
