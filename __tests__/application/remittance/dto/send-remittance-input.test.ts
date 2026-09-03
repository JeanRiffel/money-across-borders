import { SendRemittanceInput } from '../../../../src/application/remittance/dto/send-remittance-input'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'
import { ValidationError } from '../../../../src/domain/shared/errors'

describe('SendRemittanceInput.from', () => {
  it('builds an input from a valid raw request body', () => {
    const senderAccountId = AccountId.generate().getValue()
    const recipientAccountId = AccountId.generate().getValue()

    const input = SendRemittanceInput.from({
      senderAccountId,
      recipientAccountId,
      sourceCurrency: 'USD',
      destinationCurrency: 'BRL',
      amountMinorUnits: 5000,
    })

    expect(input.senderAccountId).toEqual(senderAccountId)
    expect(input.recipientAccountId).toEqual(recipientAccountId)
    expect(input.amountMinorUnits).toEqual(5000)
  })

  it('rejects a non-UUID senderAccountId', () => {
    expect(() => SendRemittanceInput.from({
      senderAccountId: 'not-a-uuid',
      recipientAccountId: AccountId.generate().getValue(),
      sourceCurrency: 'USD',
      destinationCurrency: 'BRL',
      amountMinorUnits: 5000,
    })).toThrow(ValidationError)
  })

  it('rejects a non-integer amountMinorUnits', () => {
    expect(() => SendRemittanceInput.from({
      senderAccountId: AccountId.generate().getValue(),
      recipientAccountId: AccountId.generate().getValue(),
      sourceCurrency: 'USD',
      destinationCurrency: 'BRL',
      amountMinorUnits: 50.5,
    })).toThrow(/amountMinorUnits/)
  })

  // Shape only — an unsupported-but-well-formed currency code is left to
  // UnsupportedCurrencyError downstream, not rejected here. See
  // docs/adr/0009-request-validation-with-zod.md.
  it('accepts a well-formed but unsupported currency code', () => {
    expect(() => SendRemittanceInput.from({
      senderAccountId: AccountId.generate().getValue(),
      recipientAccountId: AccountId.generate().getValue(),
      sourceCurrency: 'XXX',
      destinationCurrency: 'BRL',
      amountMinorUnits: 5000,
    })).not.toThrow()
  })
})
