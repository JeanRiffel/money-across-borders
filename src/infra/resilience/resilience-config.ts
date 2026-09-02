import dotenv from 'dotenv';

// Self-contained on purpose, matching pg.ts/redisClient.ts/rabbitmq-connection.ts's
// exact rationale: this module must not assume its entrypoint already called
// dotenv.config() before importing it — account-created-consumer.ts (a
// separate `worker:*` process) is the one caller here that isn't guaranteed
// to have done so already. dotenv.config() is safe to call more than once
// (later calls don't override already-set vars).
dotenv.config();

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Read once at module load, same as every other *-connection.ts config
// module in this codebase — these are process-wide settings, not
// per-call options, so there's no reason to re-read process.env on every
// resilient call.
export const resilienceConfig = {
  http: {
    timeoutMs: readNumber('HTTP_TIMEOUT_MS', 2000),
    retryMaxAttempts: readNumber('RETRY_MAX_ATTEMPTS', 3),
    retryBaseDelayMs: readNumber('RETRY_BASE_DELAY_MS', 200),
    retryMaxDelayMs: readNumber('RETRY_MAX_DELAY_MS', 5000),
    retryJitterMs: readNumber('RETRY_JITTER_MS', 100),
    circuitBreakerFailureThreshold: readNumber('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
    circuitBreakerResetTimeoutMs: readNumber('CIRCUIT_BREAKER_RESET_TIMEOUT_MS', 10_000),
  },
  rabbitmq: {
    maxRetries: readNumber('RABBITMQ_MAX_RETRIES', 3),
    retryDelayMs: readNumber('RABBITMQ_RETRY_DELAY_MS', 5000),
  },
};

export type ResilienceConfig = typeof resilienceConfig;
