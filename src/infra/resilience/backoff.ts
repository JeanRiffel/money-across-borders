export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

// Pure exponential-backoff-with-jitter calculation, deliberately kept free
// of any timer/library dependency so it's testable as plain arithmetic
// (attempt 1 -> base, attempt 2 -> base*2, attempt 3 -> base*4, ... per the
// issue's spec) with an injectable `random` — tests pass a fixed function
// instead of Math.random so delay assertions stay deterministic.
//
// `attempt` is 1-based (the first retry is attempt 1). Jitter is added on
// top of the exponential delay (not subtracted/centered) so the minimum
// possible delay is never less than the pure exponential value — it only
// ever spreads retries further apart, which is all that's needed to avoid a
// thundering herd. The combined result is capped at maxDelayMs so jitter can
// never push a delay past the configured ceiling.
export function computeBackoffDelayMs(
  attempt: number,
  config: BackoffConfig,
  random: () => number = Math.random
): number {
  const exponentialDelay = config.baseDelayMs * 2 ** (attempt - 1);
  const jitter = config.jitterMs > 0 ? random() * config.jitterMs : 0;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}
