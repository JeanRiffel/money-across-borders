import { z } from 'zod';
import { parseOrThrow } from '../../shared/validation/parse-or-throw';

// status/from/to are left as loose optional strings — the search index
// forwards them as-is (no enum/date-format enforcement exists downstream
// today), so this schema doesn't invent one. See
// docs/adr/0009-request-validation-with-zod.md.
const searchRemittancesInputSchema = z.object({
  accountId: z.string().uuid(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export class SearchRemittancesInput {
  constructor(
    // Required, not optional — see SearchRemittancesController: without an
    // accountId filter this would return every account's remittances, and
    // there's no per-resource authorization layer yet (see CLAUDE.md) to
    // otherwise stop that.
    public readonly accountId: string,
    public readonly status?: string,
    public readonly from?: string,
    public readonly to?: string,
    public readonly limit?: number
  ) {}

  static from(raw: unknown): SearchRemittancesInput {
    const parsed = parseOrThrow(searchRemittancesInputSchema, raw);
    return new SearchRemittancesInput(
      parsed.accountId,
      parsed.status,
      parsed.from,
      parsed.to,
      parsed.limit
    );
  }
}
