import { ExternalCallTimeoutError, ExternalHttpError } from './errors';

// HTTP statuses worth retrying: request timeout, rate-limited, and the
// transient 5xx family. Deliberately excludes every other 4xx (400/401/403/
//404/...) — those are normal business/client errors per the issue, not
// transient conditions a retry could fix.
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// Node/undici's fetch throws a TypeError (with a `cause`) for connection-
// level failures — refused/reset/DNS — rather than a distinct error class.
// These `cause.code` values are the ones worth retrying; anything else
// wrapped in a TypeError (e.g. a malformed URL) is a programming error, not
// a transient one, so it's deliberately not included here.
const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

// Pure, dependency-free classification — kept isolated from cockatiel (per
// the issue's "retry decision isolated from the use case" requirement) so
// it's trivially unit-testable and reusable by both the HTTP resilient
// client and the RabbitMQ consumer's retry-vs-DLQ decision.
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ExternalCallTimeoutError) return true;
  if (error instanceof ExternalHttpError) return RETRYABLE_STATUS_CODES.has(error.statusCode);

  // Duck-typed rather than `error instanceof TypeError`: Node's global
  // fetch() throws a TypeError built by its own (potentially different)
  // realm — under Jest's node test environment specifically, that's a
  // different `TypeError` constructor than this module's, so `instanceof`
  // silently returns false there even though the object plainly is one.
  // `.name`/`.message`/`.cause` are plain data properties, unaffected by
  // which realm's class built the object, so they classify correctly in
  // every environment this has actually been observed to run in (a plain
  // Node process and Jest's node environment).
  if (isObjectWithName(error, 'TypeError')) {
    const code = (error.cause as { code?: string } | undefined)?.code;
    if (code && RETRYABLE_NETWORK_ERROR_CODES.has(code)) return true;
    // fetch's generic "fetch failed" TypeError with no recognized cause code
    // still means "never reached the server" — treat as a connection
    // failure, same as an explicit code above.
    if (error.message === 'fetch failed') return true;
  }

  return false;
}

function isObjectWithName(
  error: unknown,
  name: string
): error is { name: string; message: string; cause?: unknown } {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === name;
}
