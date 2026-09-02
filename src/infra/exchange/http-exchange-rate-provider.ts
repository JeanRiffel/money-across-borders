import { ExchangeRateProvider } from '../../application/shared/exchange/exchange-rate-provider';
import { ExchangeRate } from '../../domain/exchange/value-objects/exchange-rate-value-object';
import { Currency } from '../../domain/shared/value-objects/currency-value-object';
import { ExchangeRateNotAvailableError } from '../../domain/shared/errors';
import {
  createResilientHttpClient,
  ResilientHttpClient,
} from '../resilience/resilient-http-client';
import { ExternalHttpError } from '../resilience/errors';
import { ResilienceConfig } from '../resilience/resilience-config';

interface FxRateResponse {
  base: string;
  quote: string;
  rate: number;
  asOf: string;
}

// Real HTTP-backed ExchangeRateProvider — the "infrastructure implementation
// that performs an HTTP request" the issue asks for, guarded by
// resilient-http-client.ts (timeout + retry + backoff/jitter + circuit
// breaker). Talks to fake-fx-server.ts in tests and local demos; the issue's
// non-goals explicitly rule out adding a real paid FX dependency, so this
// intentionally has no other real backend to point at today. Opt-in via
// FX_PROVIDER=http (see remittance-factory.ts) — MockExchangeRateProvider
// stays the default so existing behavior is unchanged unless a caller asks
// for this one.
export class HttpExchangeRateProvider implements ExchangeRateProvider {
  private readonly client: ResilientHttpClient;

  // resilienceConfigOverride lets tests exercise real (but tiny) timeouts/
  // delays against fake-fx-server.ts without touching process.env —
  // production call sites omit it and get the process-wide config.
  constructor(
    private readonly baseUrl: string,
    resilienceConfigOverride?: Partial<ResilienceConfig['http']>
  ) {
    this.client = createResilientHttpClient({ provider: 'fx', config: resilienceConfigOverride });
  }

  async getRate(base: Currency, quote: Currency): Promise<ExchangeRate> {
    const baseCode = base.getCode();
    const quoteCode = quote.getCode();
    const url = `${this.baseUrl}/rates?base=${encodeURIComponent(baseCode)}&quote=${encodeURIComponent(quoteCode)}`;

    try {
      const response = await this.client.fetchJson<FxRateResponse>(url);
      return new ExchangeRate(base, quote, response.rate, new Date(response.asOf));
    } catch (error) {
      // A 404 from the fake/real provider means "this pair isn't quoted" —
      // translate it to the same domain error MockExchangeRateProvider
      // throws for an unknown pair, rather than leaking an HTTP-shaped
      // error into the application layer. Every other failure (timeout,
      // 5xx/429 after retries exhausted, open circuit, connection failure)
      // is left to propagate as-is; SendRemittanceUseCase treats any
      // getRate() rejection the same way today.
      if (error instanceof ExternalHttpError && error.statusCode === 404) {
        throw new ExchangeRateNotAvailableError(baseCode, quoteCode);
      }
      throw error;
    }
  }
}
