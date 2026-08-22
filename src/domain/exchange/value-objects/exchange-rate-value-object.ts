import { Currency } from '../../shared/value-objects/currency-value-object'
import { Money } from '../../shared/value-objects/money-value-object'
import { CurrencyMismatchError } from '../../shared/errors'

/**
 * An ExchangeRate converts one unit of baseCurrency into `rate` units of
 * quoteCurrency (e.g. base=USD, quote=BRL, rate=5.20 means 1 USD = 5.20 BRL).
 */
export class ExchangeRate {

  constructor(
    private readonly baseCurrency: Currency,
    private readonly quoteCurrency: Currency,
    private readonly rate: number,
    private readonly quotedAt: Date
  ) {
    if (rate <= 0) {
      throw new Error('Exchange rate must be positive')
    }
  }

  getBaseCurrency(): Currency {
    return this.baseCurrency
  }

  getQuoteCurrency(): Currency {
    return this.quoteCurrency
  }

  getRate(): number {
    return this.rate
  }

  getQuotedAt(): Date {
    return this.quotedAt
  }

  convert(amount: Money): Money {
    if (!amount.getCurrency().equals(this.baseCurrency)) {
      throw new CurrencyMismatchError(this.baseCurrency.getCode(), amount.getCurrency().getCode())
    }
    // Money.multiply() preserves the operand's currency, which is wrong here —
    // the result is denominated in quoteCurrency, not baseCurrency — so the
    // minor-units math is done directly instead of reusing that helper.
    //
    // `rate` is defined in major units (see class doc comment: "1 USD =
    // 5.20 BRL"), but amount is in minor units — multiplying minor units by
    // rate directly is only correct when base and quote share the same
    // minor-unit exponent (true for all of USD/BRL/EUR/GBP today, which is
    // why this was previously unnoticed). The exponent difference has to be
    // applied explicitly so this stays correct if a currency with a
    // different exponent (e.g. a 0-decimal currency) is ever added.
    const exponentAdjustment = this.quoteCurrency.getMinorUnitExponent() - this.baseCurrency.getMinorUnitExponent()
    const convertedMinorUnits = amount.getAmountMinorUnits() * this.rate * 10 ** exponentAdjustment
    return Money.fromMinorUnits(
      Math.round(convertedMinorUnits),
      this.quoteCurrency
    )
  }

}
