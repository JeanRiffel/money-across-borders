import http from 'node:http';
import { computeRate } from './fx-rates-table';

// A deterministic, local, in-process stand-in for a real FX rate API — the
// issue explicitly asks for this instead of depending on a third-party
// service ("If the project does not currently have a real external
// provider, create a deterministic fake/mock provider or local test server
// so the behavior can be demonstrated without depending on a third-party
// API"). HttpExchangeRateProvider talks to this over real HTTP (so timeout/
// abort/connection-failure behavior is real, not simulated in-process),
// while every response it gives is scripted, so tests stay deterministic
// and offline.
export type SimulatedBehavior =
  | 'success'
  | '429'
  | '500'
  | '502'
  | '503'
  | '400'
  | '404'
  | 'timeout'
  | 'connection-failure';

export interface FakeFxServerHandle {
  readonly url: string;
  readonly port: number;
  /** Queue one scripted behavior for the next request; consumed in FIFO order. */
  enqueue(behavior: SimulatedBehavior): void;
  /** Queue several behaviors at once, e.g. two failures then a success. */
  enqueueMany(behaviors: SimulatedBehavior[]): void;
  /** Number of requests actually received — lets tests assert retries did/didn't happen. */
  readonly requestCount: number;
  close(): Promise<void>;
}

// How long a 'timeout' response is delayed before it would (if not aborted
// first by the caller's own HTTP_TIMEOUT_MS) actually complete. Callers in
// tests should configure a timeout shorter than this so the client-side
// abort is what's actually being exercised.
const TIMEOUT_BEHAVIOR_DELAY_MS = 2000;

const SIMULATED_BEHAVIORS: ReadonlySet<string> = new Set<SimulatedBehavior>([
  'success',
  '429',
  '500',
  '502',
  '503',
  '400',
  '404',
  'timeout',
  'connection-failure',
]);

function isSimulatedBehavior(value: string | undefined): value is SimulatedBehavior {
  return value !== undefined && SIMULATED_BEHAVIORS.has(value);
}

export function startFakeFxServer(port = 0): Promise<FakeFxServerHandle> {
  const queue: SimulatedBehavior[] = [];
  const pendingTimers = new Set<NodeJS.Timeout>();
  let requestCount = 0;

  const server = http.createServer((req, res) => {
    requestCount += 1;
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rawHeaderOverride = req.headers['x-simulate'];
    const headerOverride = Array.isArray(rawHeaderOverride)
      ? rawHeaderOverride[0]
      : rawHeaderOverride;
    const behavior: SimulatedBehavior = isSimulatedBehavior(headerOverride)
      ? headerOverride
      : (queue.shift() ?? 'success');

    const sendJson = (status: number, body: unknown): void => {
      const payload = JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(payload);
    };

    switch (behavior) {
      case 'connection-failure':
        // Destroys the socket without writing a response — the client sees
        // a connection-reset/network failure, not an HTTP error status.
        req.socket.destroy();
        return;
      case 'timeout': {
        const timer = setTimeout(() => {
          pendingTimers.delete(timer);
          sendJson(200, { ok: true });
        }, TIMEOUT_BEHAVIOR_DELAY_MS);
        pendingTimers.add(timer);
        return;
      }
      case '429':
        sendJson(429, { error: 'rate_limited' });
        return;
      case '500':
      case '502':
      case '503':
        sendJson(Number(behavior), { error: 'provider_unavailable' });
        return;
      case '400':
        sendJson(400, { error: 'bad_request' });
        return;
      case '404':
        sendJson(404, { error: 'not_found' });
        return;
      case 'success':
      default: {
        const base = url.searchParams.get('base') ?? '';
        const quote = url.searchParams.get('quote') ?? '';
        const rate = computeRate(base, quote);
        if (rate === undefined) {
          sendJson(404, { error: 'rate_not_available', base, quote });
          return;
        }
        sendJson(200, { base, quote, rate, asOf: new Date().toISOString() });
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Failed to determine fake FX server address'));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        get requestCount() {
          return requestCount;
        },
        enqueue: (behavior) => queue.push(behavior),
        enqueueMany: (behaviors) => queue.push(...behaviors),
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            for (const timer of pendingTimers) clearTimeout(timer);
            pendingTimers.clear();
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}
