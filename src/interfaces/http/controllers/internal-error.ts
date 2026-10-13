import { logger } from 'src/infra/observability/logger';

// Shared fallback for every controller's catch-all branch. Controllers used
// to return `Error on <UseCase>: ${error}` as the 500 body, leaking raw
// infrastructure errors (e.g. node-redis's "The client is closed", pg's
// "Cannot use a pool after calling end on the pool") to API clients — and
// through the Next.js BFF, straight into the signup form. The real error is
// logged here instead (it lands in Loki with the request's trace), and the
// client only gets a generic message.
export const INTERNAL_ERROR_MESSAGE = 'Internal server error';

export function internalErrorResponse(
  useCase: string,
  error: unknown
): { statusCode: 500; result: string } {
  logger.error({ err: error, useCase }, `Unhandled error in ${useCase}`);
  return { statusCode: 500, result: INTERNAL_ERROR_MESSAGE };
}
