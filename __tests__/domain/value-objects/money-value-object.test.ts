import { Money } from '../../../src/domain/shared/value-objects/money-value-object'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { CurrencyMismatchError } from '../../../src/domain/shared/errors'

describe('Money', () => {
  const usd = Currency.from('USD')
  const brl = Currency.from('BRL')

  it('should add and subtract amounts in the same currency', () => {
    const ten = Money.fromMinorUnits(1000, usd)
    const five = Money.fromMinorUnits(500, usd)

    expect(ten.add(five).getAmountMinorUnits()).toEqual(1500)
    expect(ten.subtract(five).getAmountMinorUnits()).toEqual(500)
  })

  it('should reject arithmetic across different currencies', () => {
    const ten = Money.fromMinorUnits(1000, usd)
    const five = Money.fromMinorUnits(500, brl)

    expect(() => ten.add(five)).toThrow(CurrencyMismatchError)
    expect(() => ten.subtract(five)).toThrow(CurrencyMismatchError)
  })

  it('should never allow a negative amount', () => {
    expect(() => Money.fromMinorUnits(-1, usd)).toThrow()
    const five = Money.fromMinorUnits(500, usd)
    const ten = Money.fromMinorUnits(1000, usd)
    expect(() => five.subtract(ten)).toThrow()
  })

  it('should require an integer number of minor units', () => {
    expect(() => Money.fromMinorUnits(10.5, usd)).toThrow()
  })

  it('should multiply and round to the nearest minor unit', () => {
    const amount = Money.fromMinorUnits(1000, usd)
    expect(amount.multiply(0.005).getAmountMinorUnits()).toEqual(5)
  })

  it('should compare greater-than-or-equal correctly', () => {
    const ten = Money.fromMinorUnits(1000, usd)
    const five = Money.fromMinorUnits(500, usd)
    expect(ten.isGreaterThanOrEqual(five)).toBe(true)
    expect(five.isGreaterThanOrEqual(ten)).toBe(false)
    expect(ten.isGreaterThanOrEqual(ten)).toBe(true)
  })
})
