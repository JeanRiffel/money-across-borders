// Needs a real, migrated Postgres (same POSTGRES_* as `npm run dev`) — run
// `npm run db:migrate` first. Invoke via `npm run test:seed`, not `npm test`
// (see jest.config.ts / jest.seed.config.ts). Mirrors how
// features/support/hooks.ts treats the Cucumber suite: real Postgres, no
// mocking, no in-memory fakes.
import { pool } from '../../../../src/infra/config/database/postgresql/pg';
import { generateDataset } from '../../../../src/infra/seed/generate-dataset';
import { resolveSeedConfig } from '../../../../src/infra/seed/config/seed-config';
import {
  assertDatabaseIsClean,
  DatabaseNotCleanError,
  loadTreasuryWallets,
  resetDatabase,
  writeSeedBatch,
} from '../../../../src/infra/seed/persistence/seed-database';
import { runReferentialChecks } from '../../../../src/infra/seed/validation/referential-invariants';
import { runFinancialChecks } from '../../../../src/infra/seed/validation/financial-invariants';
import { buildSeedReport } from '../../../../src/infra/seed/validation/report';
import { GenerationState, SeedWalletRef } from '../../../../src/infra/seed/types';

const NOW = new Date();

async function seed(overrides: Parameters<typeof resolveSeedConfig>[0]) {
  await resetDatabase(pool);
  const config = resolveSeedConfig(overrides);
  const treasuryWallets = [...(await loadTreasuryWallets(pool)).values()];
  const dataset = await generateDataset(config, NOW, treasuryWallets);

  await writeSeedBatch(pool, {
    users: dataset.users,
    accounts: dataset.accounts,
    kycProfiles: dataset.kycProfiles,
    wallets: dataset.wallets,
    ledgerEntries: dataset.ledgerEntries,
    remittances: dataset.remittances,
    idempotencyRecords: dataset.idempotencyRecords,
    treasuryWallets: [...dataset.treasuryByCurrency.values()],
  });

  return { config, dataset };
}

async function validate(dataset: Awaited<ReturnType<typeof generateDataset>>) {
  const checks = [...(await runReferentialChecks(pool)), ...(await runFinancialChecks(pool))];
  const walletsById = new Map<string, SeedWalletRef>(dataset.wallets.map((w) => [w.id, w]));
  const state: GenerationState = {
    customers: dataset.customers,
    walletsById,
    ledgerEntries: dataset.ledgerEntries,
    remittances: dataset.remittances,
    idempotencyRecords: dataset.idempotencyRecords,
  };
  return buildSeedReport(state, new Map(), checks, null);
}

describe('seed pipeline against a real Postgres', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('generates a small dataset (100 customers) and passes every financial/referential check', async () => {
    const { dataset } = await seed({ customers: 100, remittancesTarget: 500, seed: 42 });
    const report = await validate(dataset);

    expect(dataset.customers).toHaveLength(100);
    expect(report.passed).toBe(true);
    for (const check of report.text.split('\n')) {
      if (check.trim().startsWith('✗')) {
        throw new Error(`Unexpected failing check: ${check}`);
      }
    }
  }, 60_000);

  it('refuses to run against a non-clean database without --reset', async () => {
    await seed({ customers: 20, seed: 1 });
    await expect(assertDatabaseIsClean(pool)).rejects.toBeInstanceOf(DatabaseNotCleanError);
  }, 30_000);

  it('reproduces the same dataset counts when re-run with --reset and the same seed', async () => {
    const first = await seed({ customers: 150, seed: 42 });
    const second = await seed({ customers: 150, seed: 42 }); // seed() itself calls resetDatabase first

    expect(second.dataset.customers).toHaveLength(first.dataset.customers.length);
    expect(second.dataset.remittances.length).toBe(first.dataset.remittances.length);
    expect(second.dataset.ledgerEntries.length).toBe(first.dataset.ledgerEntries.length);
  }, 60_000);

  it('high-contention scenario seeds a shared pool that stays financially consistent', async () => {
    const { dataset } = await seed({ scenario: 'high-contention', customers: 60, seed: 42 });
    const report = await validate(dataset);

    expect(dataset.contentionIntents.length).toBeGreaterThan(0);
    expect(report.passed).toBe(true);
  }, 60_000);

  it('fails clearly when a financial invariant is violated directly in the database', async () => {
    const { dataset } = await seed({ customers: 30, seed: 42 });

    // Deliberately corrupt one wallet's balance so it disagrees with its
    // ledger entries — simulates the kind of bug the validators exist to
    // catch, without needing to break a generator on purpose.
    const wallet = dataset.wallets[0];
    await pool.query(
      `UPDATE wallets SET balance_minor_units = balance_minor_units + 999 WHERE id = $1`,
      [wallet.id]
    );

    const checks = await runFinancialChecks(pool);
    const walletCheck = checks.find((c) => c.name === 'Wallet balances consistent with ledger');
    expect(walletCheck?.passed).toBe(false);

    const report = await validate(dataset);
    expect(report.passed).toBe(false);
  }, 60_000);
});
