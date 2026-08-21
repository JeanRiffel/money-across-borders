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
