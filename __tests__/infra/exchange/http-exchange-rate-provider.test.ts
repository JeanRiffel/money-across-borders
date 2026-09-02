import { HttpExchangeRateProvider } from '../../../src/infra/exchange/http-exchange-rate-provider';
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object';
import { ExchangeRateNotAvailableError } from '../../../src/domain/shared/errors';
import { CircuitOpenError } from '../../../src/infra/resilience/errors';
import { startFakeFxServer, FakeFxServerHandle } from '../../../src/infra/exchange/fake-fx-server';

describe('HttpExchangeRateProvider', () => {
  let server: FakeFxServerHandle;

  beforeEach(async () => {
    server = await startFakeFxServer();
  });

  afterEach(async () => {
    await server.close();
  });

  const smallConfig = {
    timeoutMs: 600,
    retryMaxAttempts: 3,
    retryBaseDelayMs: 30,
    retryMaxDelayMs: 600,
    retryJitterMs: 0,
    circuitBreakerFailureThreshold: 2,
    circuitBreakerResetTimeoutMs: 150,
  };

  it('quotes a rate fetched over real HTTP from the fake FX server', async () => {
    server.enqueue('success');
    const provider = new HttpExchangeRateProvider(server.url, smallConfig);

    const rate = await provider.getRate(Currency.from('USD'), Currency.from('BRL'));

    expect(rate.getBaseCurrency().getCode()).toEqual('USD');
    expect(rate.getQuoteCurrency().getCode()).toEqual('BRL');
    expect(rate.getRate()).toEqual(5.2);
  });

  it('recovers from a transient failure via the retry layer', async () => {
    server.enqueueMany(['503', 'success']);
    const provider = new HttpExchangeRateProvider(server.url, smallConfig);

    const rate = await provider.getRate(Currency.from('USD'), Currency.from('EUR'));

    expect(rate.getRate()).toBeCloseTo(0.92 / 1, 5);
    expect(server.requestCount).toBe(2);
  });

  it('translates a 404 (unknown pair) into ExchangeRateNotAvailableError', async () => {
    server.enqueue('404');
    const provider = new HttpExchangeRateProvider(server.url, smallConfig);

    await expect(provider.getRate(Currency.from('USD'), Currency.from('GBP'))).rejects.toBeInstanceOf(
      ExchangeRateNotAvailableError
    );
  });

  it('lets a circuit-open rejection propagate once the breaker has tripped', async () => {
    const provider = new HttpExchangeRateProvider(server.url, {
      ...smallConfig,
      retryMaxAttempts: 1,
    });
    server.enqueueMany(['500', '500']);

    await expect(provider.getRate(Currency.from('USD'), Currency.from('BRL'))).rejects.toThrow();
    await expect(provider.getRate(Currency.from('USD'), Currency.from('BRL'))).rejects.toThrow();

    const requestsBeforeRejection = server.requestCount;
    await expect(provider.getRate(Currency.from('USD'), Currency.from('BRL'))).rejects.toBeInstanceOf(
      CircuitOpenError
    );
    expect(server.requestCount).toBe(requestsBeforeRejection);
  });
});
