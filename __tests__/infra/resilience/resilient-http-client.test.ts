import { CircuitState } from 'cockatiel';
import { createResilientHttpClient, ResilientHttpClient } from '../../../src/infra/resilience/resilient-http-client';
import { CircuitOpenError, ExternalCallTimeoutError, ExternalHttpError } from '../../../src/infra/resilience/errors';
import { startFakeFxServer, FakeFxServerHandle } from '../../../src/infra/exchange/fake-fx-server';
import { resilienceConfig } from '../../../src/infra/resilience/resilience-config';

// These scenarios use small, explicit millisecond values — never the several
// real seconds the issue explicitly says tests shouldn't wait — but they
// still go over a real loopback HTTP connection, so the *ceilings* below are
// deliberately generous to absorb this environment's own scheduling jitter
// (an idle Node process's very first fetch()/AbortController use can itself
// take a couple hundred ms) without the test flaking. The *floors* (backoff
// actually elapsed at least this long) aren't loosened the same way: a real
// setTimeout-based delay only ever adds time, so a floor assertion is immune
// to that jitter — only a ceiling needs the slack.
function client(overrides: Partial<typeof resilienceConfig.http> = {}, provider = 'fx-test'): ResilientHttpClient {
  return createResilientHttpClient({
    provider,
    config: {
      timeoutMs: 600,
      retryMaxAttempts: 3,
      retryBaseDelayMs: 30,
      retryMaxDelayMs: 600,
      retryJitterMs: 0,
      circuitBreakerFailureThreshold: 2,
      circuitBreakerResetTimeoutMs: 150,
      ...overrides,
    },
  });
}

describe('createResilientHttpClient', () => {
  let server: FakeFxServerHandle;

  beforeEach(async () => {
    server = await startFakeFxServer();
  });

  afterEach(async () => {
    await server.close();
  });

  const rateUrl = () => `${server.url}/rates?base=USD&quote=BRL`;

  it('1. does not retry a successful request', async () => {
    server.enqueue('success');
    const result = await client().fetchJson<{ rate: number }>(rateUrl());
    expect(result.rate).toBe(5.2);
    expect(server.requestCount).toBe(1);
  });

  it('2. retries after a timeout', async () => {
    server.enqueueMany(['timeout', 'success']);
    const result = await client().fetchJson<{ rate: number }>(rateUrl());
    expect(result.rate).toBe(5.2);
    expect(server.requestCount).toBe(2);
  });

  it('3. retries a transient 5xx', async () => {
    server.enqueueMany(['500', 'success']);
    const result = await client().fetchJson<{ rate: number }>(rateUrl());
    expect(result.rate).toBe(5.2);
    expect(server.requestCount).toBe(2);
  });

  it('4. retries a 429', async () => {
    server.enqueueMany(['429', 'success']);
    const result = await client().fetchJson<{ rate: number }>(rateUrl());
    expect(result.rate).toBe(5.2);
    expect(server.requestCount).toBe(2);
  });

  it('5. does not retry a non-transient 4xx', async () => {
    server.enqueue('400');
    await expect(client().fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    expect(server.requestCount).toBe(1);
  });

  it('6. retries use exponential backoff', async () => {
    server.enqueueMany(['500', '500', 'success']);
    const startedAt = Date.now();
    await client({ retryBaseDelayMs: 50, retryMaxDelayMs: 5000, retryJitterMs: 0 }).fetchJson(rateUrl());
    const elapsedMs = Date.now() - startedAt;
    // attempt 1 -> 50ms, attempt 2 -> 100ms before the 3rd (successful) try:
    // a real floor, since setTimeout delays only ever add wall-clock time.
    expect(elapsedMs).toBeGreaterThanOrEqual(150);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('7. jitter is applied and stays bounded', async () => {
    server.enqueueMany(['500', 'success']);
    const startedAt = Date.now();
    await client({ retryBaseDelayMs: 50, retryMaxDelayMs: 5000, retryJitterMs: 40 }).fetchJson(rateUrl());
    const elapsedMs = Date.now() - startedAt;
    // Base delay (50ms) is a real floor; the 40ms jitter ceiling plus
    // scheduling slack bounds the top end far short of "several seconds".
    expect(elapsedMs).toBeGreaterThanOrEqual(50);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('8. respects the maximum attempt count', async () => {
    server.enqueueMany(['500', '500', '500', '500', '500']);
    await expect(client({ retryMaxAttempts: 3 }).fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    expect(server.requestCount).toBe(3);
  });

  it('9. opens the circuit after the configured number of failures', async () => {
    const c = client({ retryMaxAttempts: 1, circuitBreakerFailureThreshold: 2 });
    server.enqueueMany(['500', '500']);

    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);

    expect(c.breaker.state).toBe(CircuitState.Open);
  });

  it('10. rejects calls immediately while OPEN, without calling the provider', async () => {
    const c = client({ retryMaxAttempts: 1, circuitBreakerFailureThreshold: 2 });
    server.enqueueMany(['500', '500']);
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    expect(c.breaker.state).toBe(CircuitState.Open);

    const requestsBeforeRejection = server.requestCount;
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(CircuitOpenError);
    expect(server.requestCount).toBe(requestsBeforeRejection);
  });

  it('11. a successful HALF_OPEN probe closes the circuit', async () => {
    const c = client({
      retryMaxAttempts: 1,
      circuitBreakerFailureThreshold: 2,
      circuitBreakerResetTimeoutMs: 100,
    });
    server.enqueueMany(['500', '500']);
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    expect(c.breaker.state).toBe(CircuitState.Open);

    await new Promise((resolve) => setTimeout(resolve, 150));
    server.enqueue('success');
    const result = await c.fetchJson<{ rate: number }>(rateUrl());

    expect(result.rate).toBe(5.2);
    expect(c.breaker.state).toBe(CircuitState.Closed);
  });

  it('12. a failed HALF_OPEN probe reopens the circuit', async () => {
    const c = client({
      retryMaxAttempts: 1,
      circuitBreakerFailureThreshold: 2,
      circuitBreakerResetTimeoutMs: 100,
    });
    server.enqueueMany(['500', '500']);
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);
    expect(c.breaker.state).toBe(CircuitState.Open);

    await new Promise((resolve) => setTimeout(resolve, 150));
    server.enqueue('500');
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(ExternalHttpError);

    expect(c.breaker.state).toBe(CircuitState.Open);
    const requestsAfterReopen = server.requestCount;
    await expect(c.fetchJson(rateUrl())).rejects.toBeInstanceOf(CircuitOpenError);
    expect(server.requestCount).toBe(requestsAfterReopen);
  });

  it('produces a distinguishable timeout error when the provider never responds in time', async () => {
    server.enqueue('timeout');
    await expect(client({ retryMaxAttempts: 1 }).fetchJson(rateUrl())).rejects.toBeInstanceOf(
      ExternalCallTimeoutError
    );
  });

  it('treats a connection failure as retryable', async () => {
    server.enqueueMany(['connection-failure', 'success']);
    const result = await client().fetchJson<{ rate: number }>(rateUrl());
    expect(result.rate).toBe(5.2);
    expect(server.requestCount).toBe(2);
  });
});
