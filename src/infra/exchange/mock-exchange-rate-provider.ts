import { ExchangeRateProvider } from '../../application/shared/exchange/exchange-rate-provider';
import { ExchangeRate } from '../../domain/exchange/value-objects/exchange-rate-value-object';
import { Currency } from '../../domain/shared/value-objects/currency-value-object';
import { ExchangeRateNotAvailableError } from '../../domain/shared/errors';
import { computeRate } from './fx-rates-table';

export class MockExchangeRateProvider implements ExchangeRateProvider {
  async getRate(base: Currency, quote: Currency): Promise<ExchangeRate> {
    const rate = computeRate(base.getCode(), quote.getCode());

    if (rate === undefined) {
      throw new ExchangeRateNotAvailableError(base.getCode(), quote.getCode());
    }

    return new ExchangeRate(base, quote, rate, new Date());
  }
}
