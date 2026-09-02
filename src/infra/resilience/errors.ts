// Distinguishable, library-agnostic errors for the resilience layer.
// HttpExchangeRateProvider (and anything else built on
// resilient-http-client.ts) throws these instead of letting
// cockatiel-specific error classes (TaskCancelledError, BrokenCircuitError)
// leak past infra — the application layer only ever sees ExchangeRateProvider
// rejecting with a plain Error subtype, never a hint of which HTTP/retry/
// circuit-breaker library produced it.

// Thrown when a call is aborted for taking longer than the configured
// timeout (HTTP_TIMEOUT_MS). Distinguishable via `instanceof` from every
// other failure mode so retry classification (see retry-classifier.ts) and
// tests can each check for it directly.
export class ExternalCallTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`External call timed out after ${timeoutMs}ms`);
    this.name = 'ExternalCallTimeoutError';
  }
}

// Thrown when the provider is reachable but returns a non-2xx response.
// Carries the status code so retry-classifier.ts can decide retryable
// (408/429/5xx) vs non-retryable (other 4xx) without re-parsing anything.
export class ExternalHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message = `External call failed with status ${statusCode}`
  ) {
    super(message);
    this.name = 'ExternalHttpError';
  }
}

// Thrown when the circuit is OPEN and a call is rejected without ever
// reaching the network — wraps cockatiel's BrokenCircuitError so callers
// (and tests) only need to know about this project's own error type.
export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is open; call rejected without contacting the provider') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
