import { SearchRemittancesInput } from '../../../../src/application/remittance/dto/search-remittances-input'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'
import { ValidationError } from '../../../../src/domain/shared/errors'

describe('SearchRemittancesInput.from', () => {
  it('builds an input from a valid raw request (query params arrive as strings)', () => {
    const accountId = AccountId.generate().getValue()

    const input = SearchRemittancesInput.from({
      accountId,
      status: 'COMPLETED',
      from: '2026-01-01',
      to: '2026-02-01',
      limit: '10',
    })

    expect(input.accountId).toEqual(accountId)
    expect(input.status).toEqual('COMPLETED')
    expect(input.limit).toEqual(10)
  })

  it('rejects a missing accountId — see SearchRemittancesController', () => {
    expect(() => SearchRemittancesInput.from({ status: 'COMPLETED' }))
      .toThrow(ValidationError)
  })

  it('rejects a non-numeric limit', () => {
    expect(() => SearchRemittancesInput.from({
      accountId: AccountId.generate().getValue(),
      limit: 'not-a-number',
    })).toThrow(/limit/)
  })
})
