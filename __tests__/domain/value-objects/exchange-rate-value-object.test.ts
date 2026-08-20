import { ExchangeRate } from '../../../src/domain/exchange/value-objects/exchange-rate-value-object'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { Money } from '../../../src/domain/shared/value-objects/money-value-object'
import { CurrencyMismatchError } from '../../../src/domain/shared/errors'

describe('ExchangeRate', () => {
  const usd = Currency.from('USD')
  const brl = Currency.from('BRL')

  it('should convert an amount from base to quote currency', () => {
    const rate = new ExchangeRate(usd, brl, 5.2, new Date())
    const converted = rate.convert(Money.fromMinorUnits(1000, usd)) // $10.00

    expect(converted.getCurrency().equals(brl)).toBe(true)
    expect(converted.getAmountMinorUnits()).toEqual(5200) // R$52.00
  })

  it('should reject converting an amount not in the base currency', () => {
    const rate = new ExchangeRate(usd, brl, 5.2, new Date())
    expect(() => rate.convert(Money.fromMinorUnits(1000, brl))).toThrow(CurrencyMismatchError)
  })

  it('should reject a non-positive rate', () => {
    expect(() => new ExchangeRate(usd, brl, 0, new Date())).toThrow()
    expect(() => new ExchangeRate(usd, brl, -1, new Date())).toThrow()
  })
})
