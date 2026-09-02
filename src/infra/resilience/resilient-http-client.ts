import {
  circuitBreaker,
  ConsecutiveBreaker,
  BrokenCircuitError,
  CircuitBreakerPolicy,
  CircuitState,
  DelegateBackoff,
  handleWhen,
  retry,
  timeout,
  TimeoutStrategy,
  wrap,
  TaskCancelledError,
  IRetryBackoffContext,
} from 'cockatiel';
import { computeBackoffDelayMs } from './backoff';
import { isRetryableError } from './retry-classifier';
import { CircuitOpenError, ExternalCallTimeoutError, ExternalHttpError } from './errors';
import { resilienceConfig, ResilienceConfig } from './resilience-config';
import { logger } from '../observability/logger';
import {
  circuitBreakerState,
  resilienceRetryAttemptsTotal,
  resilienceTimeoutsTotal,
} from '../observability/metrics';

// This is the ONLY module in the codebase that imports cockatiel. Everything
// else — HttpExchangeRateProvider, and eventually any other resilient
// adapter — depends only on the plain `resilientFetchJson()` function and
// this project's own error types (errors.ts), never on a cockatiel type
// directly. That's what keeps the application layer's port
// (ExchangeRateProvider) ignorant of "does this call Axios, fetch, or which
// retry/circuit-breaker library" per the issue's architectural constraint.

// Maps cockatiel's CircuitState (which this happens to number identically)
// onto the Prometheus gauge's documented 0/1/2 values — kept as an explicit
// function rather than relying on the enum's numeric value staying stable
// across a future cockatiel upgrade.
function toGaugeValue(state: CircuitState): number {
  switch (state) {
    case CircuitState.Closed:
      return 0;
    case CircuitState.Open:
      return 1;
    case CircuitState.HalfOpen:
      return 2;
    default:
      return 0;
  }
}

export interface ResilientClientOptions {
  /** Metric/log label identifying which provider this client guards (e.g. "fx"). */
  provider: string;
  /**
   * Overrides resilienceConfig.http for this client. Production callers omit
   * this and get the process-wide env-driven config; tests pass small,
   * explicit values here instead of mutating process.env, so timeout/retry/
   * backoff behavior stays deterministic and fast (no multi-second waits)
   * without relying on module-load-time env parsing order.
   */
  config?: Partial<ResilienceConfig['http']>;
}

export interface ResilientHttpClient {
  fetchJson<T>(url: string, init?: RequestInit): Promise<T>;
  /** Exposed for tests and health checks — not used by application code. */
  breaker: CircuitBreakerPolicy;
}

// Builds one composed timeout+retry+circuit-breaker policy for a given
// provider. Per cockatiel's own contract ("share your circuit breaker
// between executions"), call this once per provider and reuse the returned
// client — constructing a new one per call would reset the breaker's state
// every time and defeat its purpose.
export function createResilientHttpClient(options: ResilientClientOptions): ResilientHttpClient {
  const { provider } = options;
  const config = { ...resilienceConfig.http, ...options.config };

  const timeoutPolicy = timeout(config.timeoutMs, TimeoutStrategy.Aggressive);
  timeoutPolicy.onTimeout(() => {
    resilienceTimeoutsTotal.inc({ provider });
    logger.warn({ provider, timeoutMs: config.timeoutMs }, 'External call timed out');
  });

  const backoff = new DelegateBackoff<IRetryBackoffContext<unknown>>((context) =>
    computeBackoffDelayMs(context.attempt, {
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
      jitterMs: config.retryJitterMs,
    })
  );

  // cockatiel's own `maxAttempts` counts RETRIES, not total attempts (i.e.
  // total calls = maxAttempts + 1 — see RetryPolicy.execute's `retries <
  // maxAttempts` loop condition). This project's RETRY_MAX_ATTEMPTS is
  // documented and tested as the total number of attempts (issue requirement
  // #8: "maximum attempts are respected"), so it's translated here rather
  // than passed straight through.
  const retryPolicy = retry(handleWhen(isRetryableError), {
    maxAttempts: Math.max(0, config.retryMaxAttempts - 1),
    backoff,
  });
  retryPolicy.onRetry((event) => {
    resilienceRetryAttemptsTotal.inc({ provider });
    logger.warn(
      { provider, attempt: event.attempt, delayMs: event.delay },
      'Retrying external call after a transient failure'
    );
  });

  const breakerPolicy = circuitBreaker(handleWhen(isRetryableError), {
    halfOpenAfter: config.circuitBreakerResetTimeoutMs,
    breaker: new ConsecutiveBreaker(config.circuitBreakerFailureThreshold),
  });
  breakerPolicy.onStateChange((state) => {
    circuitBreakerState.set({ provider }, toGaugeValue(state));
    logger.info({ provider, state: CircuitState[state] }, 'Circuit breaker state changed');
  });

  // Deliberately NOT wrap(breaker, retry, timeout): cockatiel's wrap() shares
  // one derived AbortSignal chain across every layer, including across
  // retry attempts, so a signal one attempt aborted (on timeout, or in its
  // own cleanup) can poison the *next* attempt's fetch call — a real, if
  // surprising, cross-attempt interaction observed in this file's own tests.
  // Instead, timeoutPolicy.execute() is invoked manually per attempt with no
  // parent signal at all (see attemptOnce below), so every attempt starts
  // from a fully independent AbortController; retry only wraps that
  // per-attempt call, and the breaker wraps the whole retrying sequence —
  // one "call" (win or lose after all retries) toward its failure threshold,
  // not one per attempt.
  const policy = wrap(breakerPolicy, retryPolicy);

  async function attemptOnce<T>(url: string, init: RequestInit | undefined): Promise<T> {
    try {
      return await timeoutPolicy.execute(async ({ signal }) => {
        const response = await fetch(url, { ...init, signal });
        if (!response.ok) {
          throw new ExternalHttpError(response.status);
        }
        return (await response.json()) as T;
      });
    } catch (error) {
      if (error instanceof TaskCancelledError) {
        throw new ExternalCallTimeoutError(config.timeoutMs);
      }
      // Duck-typed name check rather than `instanceof Error` — see
      // retry-classifier.ts's comment on why: fetch's AbortError can be
      // built by a different realm than this module's own Error/DOMException
      // under Jest's node test environment, which would make `instanceof`
      // silently miss it.
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { name?: unknown }).name === 'AbortError'
      ) {
        throw new ExternalCallTimeoutError(config.timeoutMs);
      }
      throw error;
    }
  }

  async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    try {
      return await policy.execute(() => attemptOnce<T>(url, init));
    } catch (error) {
      if (error instanceof BrokenCircuitError) {
        throw new CircuitOpenError();
      }
      throw error;
    }
  }

  return { fetchJson, breaker: breakerPolicy };
}
