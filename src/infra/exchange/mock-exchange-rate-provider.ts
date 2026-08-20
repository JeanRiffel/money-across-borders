import { ExchangeRateProvider } from "../../application/shared/exchange/exchange-rate-provider"
import { ExchangeRate } from "../../domain/exchange/value-objects/exchange-rate-value-object"
import { Currency } from "../../domain/shared/value-objects/currency-value-object"
import { ExchangeRateNotAvailableError } from "../../domain/shared/errors"

// Simulated market rates, quoted as "units of currency per 1 USD". Mocked and
// static for this showcase — a real adapter would call a live FX rate API.
const RATES_PER_USD: Record<string, number> = {
  USD: 1,
  BRL: 5.2,
  EUR: 0.92,
  GBP: 0.79,
}

export class MockExchangeRateProvider implements ExchangeRateProvider {

  async getRate(base: Currency, quote: Currency): Promise<ExchangeRate> {
    const baseRatePerUsd = RATES_PER_USD[base.getCode()]
    const quoteRatePerUsd = RATES_PER_USD[quote.getCode()]

    if (baseRatePerUsd === undefined || quoteRatePerUsd === undefined) {
      throw new ExchangeRateNotAvailableError(base.getCode(), quote.getCode())
    }

    const rate = quoteRatePerUsd / baseRatePerUsd
    return new ExchangeRate(base, quote, rate, new Date())
  }

}
