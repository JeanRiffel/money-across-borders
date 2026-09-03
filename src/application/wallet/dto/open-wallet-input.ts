import { z } from 'zod';
import { parseOrThrow } from '../../shared/validation/parse-or-throw';

// Currency shape only (3-letter code) — whether it's actually a *supported*
// currency stays UnsupportedCurrencyError's job (Currency.from()), not
// duplicated here. See docs/adr/0009-request-validation-with-zod.md.
const openWalletInputSchema = z.object({
  accountId: z.string().uuid(),
  currency: z.string().length(3),
  initialBalanceMinorUnits: z.number().int().nonnegative().optional(),
});

export class OpenWalletInput {
  constructor(
    public readonly accountId: string,
    public readonly currency: string,
    public readonly initialBalanceMinorUnits: number
  ) {}

  // No funding/deposit rail exists in this MVP — initialBalanceMinorUnits is
  // a deliberate stand-in for "money already in this wallet" so the
  // remittance flow can be demoed without one. Defaults to 0.
  static from(raw: unknown): OpenWalletInput {
    const parsed = parseOrThrow(openWalletInputSchema, raw);
    return new OpenWalletInput(
      parsed.accountId,
      parsed.currency,
      parsed.initialBalanceMinorUnits ?? 0
    );
  }
}
