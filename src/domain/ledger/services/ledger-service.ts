import { LedgerRepository } from '../repository/ledger-repository';
import { LedgerEntry } from '../entities/ledger-entry';
import { LedgerEntryId } from '../value-objects/ledger-entry-id-value-object';
import { EntryDirection } from '../value-objects/entry-direction-value-object';
import { WalletId } from '../../wallet/value-objects/wallet-id-value-object';
import { Money } from '../../shared/value-objects/money-value-object';
import { Clock } from '../../shared/clock';
import { UnbalancedLedgerError } from '../../shared/errors';

export type LedgerLegDraft = {
  walletId: WalletId;
  direction: EntryDirection;
  money: Money;
  description: string;
};

/**
 * Enforces the double-entry invariant in one place: within a single posting,
 * every currency's debits must equal its credits. A posting may legitimately
 * span more than one currency (e.g. a remittance) as long as each currency
 * nets to zero on its own — see the treasury-wallet design in the remittance
 * use case for how cross-currency legs stay balanced.
 */
export class LedgerService {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly clock: Clock
  ) {}

  async postBalancedEntries(legs: LedgerLegDraft[], transactionId: string): Promise<LedgerEntry[]> {
    this.assertBalancedPerCurrency(legs);

    const now = this.clock.now();
    const entries = legs.map(
      (leg) =>
        new LedgerEntry(
          LedgerEntryId.generate(),
          leg.walletId,
          leg.direction,
          leg.money,
          transactionId,
          leg.description,
          now
        )
    );

    await this.ledgerRepository.saveMany(entries);
    return entries;
  }

  private assertBalancedPerCurrency(legs: LedgerLegDraft[]): void {
    const netByCurrency = new Map<string, number>();

    for (const leg of legs) {
      const code = leg.money.getCurrency().getCode();
      const signed = leg.direction.isDebit()
        ? leg.money.getAmountMinorUnits()
        : -leg.money.getAmountMinorUnits();
      netByCurrency.set(code, (netByCurrency.get(code) ?? 0) + signed);
    }

    for (const [code, net] of netByCurrency) {
      if (net !== 0) {
        throw new UnbalancedLedgerError(`${code} legs net to ${net} minor units, expected 0`);
      }
    }
  }
}
