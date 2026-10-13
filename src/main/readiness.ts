// Backs GET /health/ready. GET /health is a pure liveness check — it answers
// 200 as long as the event loop runs, which is exactly why it kept reporting
// "ok" for a process whose Postgres pool and Redis client had already been
// closed by a half-finished shutdown (see graceful-shutdown.ts). This one
// actually exercises the load-bearing dependencies, so a monitor or load
// balancer pointed at it would have flagged that process instead.
//
// Only the dependencies whose failure makes the core flows fail belong here
// (Postgres, Redis) — not Mongo/Elasticsearch/RabbitMQ, which server.ts
// deliberately treats as degradable.

export type ReadinessCheck = {
  name: string;
  check: () => Promise<unknown>;
};

export type ReadinessResult = {
  ready: boolean;
  checks: Record<string, 'ok' | 'fail'>;
  // Failure reasons per check, for logging only — the HTTP route doesn't
  // return them, since /health/ready is unauthenticated. Stringified because
  // pino only serializes Error instances under its `err` key.
  errors: Record<string, string>;
};

class ReadinessTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`${name} readiness check timed out after ${timeoutMs}ms`);
    this.name = 'ReadinessTimeoutError';
  }
}

// Bounded per check: e.g. node-redis queues commands while reconnecting, so
// an unbounded ping() would hang the probe instead of failing it.
function withTimeout(name: string, check: () => Promise<unknown>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReadinessTimeoutError(name, timeoutMs)), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(check), timeout]).finally(() => clearTimeout(timer));
}

export async function runReadinessChecks(
  checks: ReadinessCheck[],
  timeoutMs: number
): Promise<ReadinessResult> {
  const settled = await Promise.allSettled(
    checks.map(({ name, check }) => withTimeout(name, check, timeoutMs))
  );

  const result: ReadinessResult = { ready: true, checks: {}, errors: {} };
  settled.forEach((outcome, i) => {
    const { name } = checks[i];
    if (outcome.status === 'fulfilled') {
      result.checks[name] = 'ok';
    } else {
      result.ready = false;
      result.checks[name] = 'fail';
      result.errors[name] = String(outcome.reason);
    }
  });
  return result;
}
