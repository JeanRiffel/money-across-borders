import { DeterministicRng } from '../rng/deterministic-rng';
import { SeedConfig, WeightedEntry } from '../config/seed-config';
import { SeedCustomer, SeedWalletRef } from '../types';
import { randomTimestampBetween } from './temporal-distribution';

/**
 * Assigns each customer between `walletsPerCustomer.min` and `.max` distinct
 * currencies (never more than the configured currencies with weight > 0),
 * so "some customers hold multiple currencies" (AGENTS.md request section 5)
 * without ever violating wallets' UNIQUE(account_id, currency) constraint.
 * Balances start at 0 here — generateFunding() (funding-generator.ts) is
 * what actually credits them, ledger-backed, so this file only decides
 * *which* wallets exist, not how much money is in them.
 */
export function generateWallets(
  config: SeedConfig,
  rng: DeterministicRng,
  customers: readonly SeedCustomer[],
  now: Date
): SeedWalletRef[] {
  const activeCurrencies = config.currencyDistribution.filter((entry) => entry.weight > 0);
  if (activeCurrencies.length === 0) {
    throw new Error('currencyDistribution has no currency with weight > 0');
  }

  const refs: SeedWalletRef[] = [];

  for (const customer of customers) {
    const maxWallets = Math.min(config.walletsPerCustomer.max, activeCurrencies.length);
    const minWallets = Math.min(config.walletsPerCustomer.min, maxWallets);
    const count = rng.nextInt(minWallets, maxWallets);
    const currencies = pickDistinctWeighted(rng, activeCurrencies, count);

    for (const currency of currencies) {
      // A wallet is opened shortly after the account itself, never before it
      // and never in the future.
      const windowEnd = new Date(
        Math.min(customer.createdAt.getTime() + 2 * 86_400_000, now.getTime())
      );
      refs.push({
        id: rng.uuid(),
        accountId: customer.accountId,
        currency,
        balance: 0,
        createdAt: randomTimestampBetween(rng, customer.createdAt, windowEnd),
      });
    }
  }

  return refs;
}

/** Weighted sampling *without* replacement — picks up to `count` distinct values. */
function pickDistinctWeighted(
  rng: DeterministicRng,
  entries: readonly WeightedEntry<string>[],
  count: number
): string[] {
  const pool = entries.slice();
  const chosen: string[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = rng.weightedPick(
      pool.map((entry, idx) => ({ value: idx, weight: entry.weight }))
    );
    chosen.push(pool[index].value);
    pool.splice(index, 1);
  }

  return chosen;
}
