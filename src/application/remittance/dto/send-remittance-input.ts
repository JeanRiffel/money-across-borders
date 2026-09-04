import { z } from 'zod';
import { parseOrThrow } from '../../shared/validation/parse-or-throw';

// Currency shape only (3-letter code) — support is checked downstream by
// UnsupportedCurrencyError, not duplicated here. amountMinorUnits is
// stricter than Money.fromMinorUnits's own bound (integer, non-negative):
// zero is rejected here deliberately — a zero-value remittance has no
// financial effect at all, yet without this it would still post a
// "COMPLETED" Remittance row and search-index document. See
// docs/adr/0009-request-validation-with-zod.md.
const sendRemittanceInputSchema = z.object({
  senderAccountId: z.string().uuid(),
  recipientAccountId: z.string().uuid(),
  sourceCurrency: z.string().length(3),
  destinationCurrency: z.string().length(3),
  amountMinorUnits: z.number().int().positive(),
});

export class SendRemittanceInput {
  constructor(
    public readonly senderAccountId: string,
    public readonly recipientAccountId: string,
    public readonly sourceCurrency: string,
    public readonly destinationCurrency: string,
    public readonly amountMinorUnits: number
  ) {}

  static from(raw: unknown): SendRemittanceInput {
    const parsed = parseOrThrow(sendRemittanceInputSchema, raw);
    return new SendRemittanceInput(
      parsed.senderAccountId,
      parsed.recipientAccountId,
      parsed.sourceCurrency,
      parsed.destinationCurrency,
      parsed.amountMinorUnits
    );
  }
}
