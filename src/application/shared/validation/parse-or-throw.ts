import { ZodType } from 'zod';
import { ValidationError } from '../../../domain/shared/errors';

// Shared glue between zod and this codebase's own error taxonomy — every
// input DTO's .from() calls this instead of schema.parse() directly, so the
// zod dependency (and its error shape) stays confined to this one file and
// each DTO's own schema definition. Validates request *shape* only (types,
// presence, basic format) — business rules the domain already owns (e.g.
// "is this currency supported") are deliberately left to it, not
// re-implemented in a schema. See docs/adr/0009-request-validation-with-zod.md.
export function parseOrThrow<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map(
        (issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`
      )
      .join('; ');
    throw new ValidationError(message);
  }
  return result.data;
}
