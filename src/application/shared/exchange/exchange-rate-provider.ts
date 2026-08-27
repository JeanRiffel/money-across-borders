import { Currency } from '../../../domain/shared/value-objects/currency-value-object';
import { ExchangeRate } from '../../../domain/exchange/value-objects/exchange-rate-value-object';

export interface ExchangeRateProvider {
  getRate(base: Currency, quote: Currency): Promise<ExchangeRate>;
}
