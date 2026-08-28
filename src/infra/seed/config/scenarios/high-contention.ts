import { SeedConfig } from '../seed-config';

/**
 * Prepares a dataset for *later* concurrency tests (optimistic/pessimistic
 * locking, SELECT FOR UPDATE, SERIALIZABLE, transaction retries) — it does
 * NOT run anything concurrently itself (see docs/seed.md §11 / AGENTS.md
 * request section 11). Two things make that possible:
 *
 *  1. A small pool of "contended" accounts/wallets (contentionSharedAccounts)
 *     gets funded well above what any single generated remittance needs, so
 *     it stays usable as a shared target for many concurrent requests later.
 *  2. `contentionIntents` request tuples referencing only that pool are
 *     written to a JSON fixture (see output/write-high-contention-requests.ts)
 *     for an external load-test tool to fire concurrently against a running
 *     app — never executed by the seed process itself.
 *
 * Customer count defaults much lower than "normal": this scenario is about
 * concentration on a few shared resources, not overall volume.
 */
export const HIGH_CONTENTION_SCENARIO: Partial<SeedConfig> = {
  customers: 500,
  balanceTierRanges: {
    low: { min: 1_000, max: 50_000 },
    medium: { min: 50_000, max: 2_000_000 },
    // The shared pool draws its balance from contentionAmountRange
    // instead (see funding-generator.ts); "high" here just needs to comfortably
    // cover normal-population remittances, unchanged from the default.
    high: { min: 2_000_000, max: 50_000_000 },
  },
};
