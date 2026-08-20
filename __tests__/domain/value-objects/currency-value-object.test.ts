import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { UnsupportedCurrencyError } from '../../../src/domain/shared/errors'

describe('Currency', () => {
  it('should build a supported currency and normalize its code', () => {
    const currency = Currency.from('usd')
    expect(currency.getCode()).toEqual('USD')
    expect(currency.getMinorUnitExponent()).toEqual(2)
  })

  it('should reject an unsupported currency code', () => {
    expect(() => Currency.from('XYZ')).toThrow(UnsupportedCurrencyError)
  })

  it('should compare currencies by code', () => {
    expect(Currency.from('USD').equals(Currency.from('USD'))).toBe(true)
    expect(Currency.from('USD').equals(Currency.from('BRL'))).toBe(false)
  })
})
