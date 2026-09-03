import { OpenWalletInput } from '../../../../src/application/wallet/dto/open-wallet-input'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'
import { ValidationError } from '../../../../src/domain/shared/errors'

describe('OpenWalletInput.from', () => {
  it('builds an input from a valid raw request body', () => {
    const accountId = AccountId.generate().getValue()

    const input = OpenWalletInput.from({ accountId, currency: 'USD', initialBalanceMinorUnits: 5000 })

    expect(input.accountId).toEqual(accountId)
    expect(input.currency).toEqual('USD')
    expect(input.initialBalanceMinorUnits).toEqual(5000)
  })

  it('defaults initialBalanceMinorUnits to zero when omitted', () => {
    const input = OpenWalletInput.from({ accountId: AccountId.generate().getValue(), currency: 'EUR' })

    expect(input.initialBalanceMinorUnits).toEqual(0)
  })

  it('rejects a non-UUID accountId', () => {
    expect(() => OpenWalletInput.from({ accountId: 'not-a-uuid', currency: 'USD' }))
      .toThrow(ValidationError)
  })

  it('rejects a negative initialBalanceMinorUnits', () => {
    expect(() => OpenWalletInput.from({
      accountId: AccountId.generate().getValue(),
      currency: 'USD',
      initialBalanceMinorUnits: -100,
    })).toThrow(ValidationError)
  })
})
