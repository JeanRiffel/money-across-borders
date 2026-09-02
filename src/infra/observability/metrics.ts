// Prometheus metrics: default Node/process metrics plus generic RED
// (rate/errors/duration) metrics for every HTTP request, exposed on
// GET /metrics (wired in server.ts) for Prometheus to scrape.
import client from 'prom-client';
import { NextFunction, Request, Response } from 'express';

export const register = new client.Registry();
register.setDefaultLabels({
  service_name: process.env.OTEL_SERVICE_NAME || 'money-across-borders',
});
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

// Resilience-layer metrics (see src/infra/resilience/), all labeled by
// `provider` (e.g. "fx") so more resilient clients can share these same
// series later without adding new metric names.
export const resilienceRetryAttemptsTotal = new client.Counter({
  name: 'resilience_retry_attempts_total',
  help: 'Total number of retry attempts made by resilient external calls',
  labelNames: ['provider'] as const,
  registers: [register],
});

export const resilienceTimeoutsTotal = new client.Counter({
  name: 'resilience_timeouts_total',
  help: 'Total number of external calls that were aborted for exceeding their timeout',
  labelNames: ['provider'] as const,
  registers: [register],
});

// 0 = closed, 1 = open, 2 = half_open — mirrors cockatiel's own CircuitState
// enum ordering so the mapping in resilient-http-client.ts is a direct pass-
// through, not a re-numbering.
export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Current circuit breaker state (0=closed, 1=open, 2=half_open)',
  labelNames: ['provider'] as const,
  registers: [register],
});

// RabbitMQ retry/DLQ metrics (see infra/events/consumers/account-created-consumer.ts),
// labeled by `queue` (the main queue name, e.g. "account.created") so the
// same series covers any future consumer that adopts the same topology.
export const rabbitmqMessageRetriesTotal = new client.Counter({
  name: 'rabbitmq_message_retries_total',
  help: 'Total number of messages re-queued for retry after a processing failure',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const rabbitmqDlqMessagesTotal = new client.Counter({
  name: 'rabbitmq_dlq_messages_total',
  help: 'Total number of messages moved to a dead-letter queue after exhausting retries',
  labelNames: ['queue'] as const,
  registers: [register],
});

// Routes in this app are all static (no /wallets/:id-style params), so
// req.path is safe to use as a label directly without risking unbounded
// cardinality from path parameters.
export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const labels = { method: req.method, route: req.path, status_code: String(res.statusCode) };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
};
