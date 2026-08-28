import { SeedConfig } from './config/seed-config';
import { DeterministicRng } from './rng/deterministic-rng';
import { generateCustomers } from './generators/customer-generator';
import { generateKycProfiles } from './generators/kyc-generator';
import { generateWallets } from './generators/wallet-generator';
import { generateFunding } from './generators/funding-generator';
import { generateRemittances } from './generators/remittance-generator';
import { buildContentionPool } from './generators/contention-generator';
import { generateIdempotencyDemoRecords } from './generators/idempotency-demo-generator';
import {
  ContentionIntent,
  SeedAccountRow,
  SeedCustomer,
  SeedIdempotencyRecordRow,
  SeedKycProfileRow,
  SeedLedgerEntryRow,
  SeedRemittanceRow,
  SeedUserRow,
  SeedWalletRef,
} from './types';

export interface GeneratedDataset {
  users: SeedUserRow[];
  accounts: SeedAccountRow[];
  customers: SeedCustomer[];
  kycProfiles: SeedKycProfileRow[];
  wallets: SeedWalletRef[];
  ledgerEntries: SeedLedgerEntryRow[];
  remittances: SeedRemittanceRow[];
  idempotencyRecords: SeedIdempotencyRecordRow[];
  contentionIntents: ContentionIntent[];
  contentionSharedAccountIds: string[];
  /** Final per-currency treasury balances after every generated posting. */
  treasuryByCurrency: Map<string, SeedWalletRef>;
}

/**
 * The whole seed pipeline's pure core: (config, now, starting treasury
 * balances) -> every generated row, with no I/O. Pulled out of run-seed.ts
 * specifically so determinism/distribution/invariant tests
 * (__tests__/infra/seed/unit/**) can exercise the real generation logic
 * without a Postgres connection — only the final `writeSeedBatch` call in
 * run-seed.ts, and the __tests__/infra/seed/integration/** suite that
 * exercises it, need a real database.
 *
 * `treasuryWallets` is never mutated — this clones it internally — so
 * calling this twice with the same arguments (including the same
 * `treasuryWallets` snapshot) is guaranteed to observe the same starting
 * point, which is what makes "same seed + same config -> same dataset"
 * something a test can actually assert.
 */
export async function generateDataset(
  config: SeedConfig,
  now: Date,
  treasuryWallets: readonly SeedWalletRef[]
): Promise<GeneratedDataset> {
  const treasuryByCurrency = new Map<string, SeedWalletRef>(
    treasuryWallets.map((wallet) => [wallet.currency, { ...wallet }])
  );

  const rng = new DeterministicRng(config.seed);

  const { users, accounts, customers } = await generateCustomers(config, rng, now);
  const kycProfiles = generateKycProfiles(config, rng, customers, now);
  const wallets = generateWallets(config, rng, customers, now);
  const walletsByAccountId = groupWalletsByAccountId(wallets);

  const fundingLedgerEntries = generateFunding(config, rng, wallets, treasuryByCurrency);

  const { remittances, ledgerEntries: remittanceLedgerEntries } = await generateRemittances(
    config,
    rng,
    customers,
    walletsByAccountId,
    treasuryByCurrency,
    now
  );

  let contentionTopUpEntries: SeedLedgerEntryRow[] = [];
  let contentionIntents: ContentionIntent[] = [];
  let contentionSharedAccountIds: string[] = [];
  if (config.scenario === 'high-contention') {
    const contentionResult = buildContentionPool(
      config,
      rng,
      customers,
      walletsByAccountId,
      treasuryByCurrency,
      now
    );
    contentionTopUpEntries = contentionResult.topUpLedgerEntries;
    contentionIntents = contentionResult.intents;
    contentionSharedAccountIds = contentionResult.sharedAccountIds;
  }

  const completedRemittances = remittances.filter((r) => r.status_id === 1);
  const idempotencyRecords = generateIdempotencyDemoRecords(config, rng, completedRemittances);

  const ledgerEntries = [
    ...fundingLedgerEntries,
    ...remittanceLedgerEntries,
    ...contentionTopUpEntries,
  ];

  return {
    users,
    accounts,
    customers,
    kycProfiles,
    wallets,
    ledgerEntries,
    remittances,
    idempotencyRecords,
    contentionIntents,
    contentionSharedAccountIds,
    treasuryByCurrency,
  };
}

export function groupWalletsByAccountId(
  wallets: readonly SeedWalletRef[]
): Map<string, SeedWalletRef[]> {
  const map = new Map<string, SeedWalletRef[]>();
  for (const wallet of wallets) {
    const group = map.get(wallet.accountId);
    if (group) {
      group.push(wallet);
    } else {
      map.set(wallet.accountId, [wallet]);
    }
  }
  return map;
}
