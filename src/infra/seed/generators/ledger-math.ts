/**
 * Row-level mirror of LedgerService.postBalancedEntries's core rule (see
 * src/domain/ledger/services/ledger-service.ts): within one posting, every
 * currency's debits must equal its credits. Reimplemented here — rather than
 * calling LedgerService itself — because that service is repository-backed
 * and issues one write per posting; the seed pipeline builds tens/hundreds
 * of thousands of postings in memory before a single bulk write (see
 * docs/seed.md's "Performance" section). This is the *same* rule, just
 * evaluated against plain rows instead of domain entities — if
 * LedgerService's invariant ever changes, this needs to change with it.
 */
export interface LegDraft {
  walletId: string;
  currency: string;
  direction: 1 | 2; // EntryDirection: 1=DEBIT, 2=CREDIT
  amountMinorUnits: number;
}

export function assertBalancedPerCurrency(legs: readonly LegDraft[]): void {
  const netByCurrency = new Map<string, number>();

  for (const leg of legs) {
    const signed = leg.direction === 1 ? leg.amountMinorUnits : -leg.amountMinorUnits;
    netByCurrency.set(leg.currency, (netByCurrency.get(leg.currency) ?? 0) + signed);
  }

  for (const [currency, net] of netByCurrency) {
    if (net !== 0) {
      throw new Error(
        `Seed generator produced unbalanced legs for ${currency}: net ${net} minor units, expected 0`
      );
    }
  }
}
