import { isRetryableError } from '../../../src/infra/resilience/retry-classifier';
import { ExternalCallTimeoutError, ExternalHttpError } from '../../../src/infra/resilience/errors';

describe('isRetryableError', () => {
  it('treats a timeout as retryable', () => {
    expect(isRetryableError(new ExternalCallTimeoutError(1000))).toBe(true);
  });

  it.each([408, 429, 500, 502, 503, 504])('treats HTTP %d as retryable', (status) => {
    expect(isRetryableError(new ExternalHttpError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not retry business/client error HTTP %d', (status) => {
    expect(isRetryableError(new ExternalHttpError(status))).toBe(false);
  });

  it('treats a connection-refused error as retryable', () => {
    const error = new TypeError('fetch failed');
    (error as { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
    expect(isRetryableError(error)).toBe(true);
  });

  it('treats a generic "fetch failed" TypeError with no cause code as retryable', () => {
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
  });

  it('does not retry an unrelated TypeError', () => {
    expect(isRetryableError(new TypeError('Cannot read properties of undefined'))).toBe(false);
  });

  it('does not retry a plain business error', () => {
    expect(isRetryableError(new Error('insufficient funds'))).toBe(false);
  });

  it('does not retry a non-error value', () => {
    expect(isRetryableError('boom')).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});
