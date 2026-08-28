// Entry point for `npm run seed -- [options]` — see docs/seed.md for the
// full write-up (usage, distributions, determinism, limitations) and
// cli/parse-args.ts's SEED_HELP_TEXT for `--help`. Deliberately standalone,
// same idiom as migrations/run-migrations.ts and the worker:* scripts: a
// plain ts-node entrypoint that connects to the same POSTGRES_* Postgres as
// the app, does its work, and exits — no Express, no use cases, no other
// infra (Redis/Kafka/RabbitMQ/Elasticsearch/Mongo) touched. The actual
// generation logic lives in generate-dataset.ts (pure, DB-free, unit
// tested) — this file is only I/O: guard/reset, generate, write, validate,
// report.
import { pool } from '../config/database/postgresql/pg';
import { logger } from '../observability/logger';
import { parseSeedArgs } from './cli/parse-args';
import { resolveSeedConfig } from './config/seed-config';
import { generateDataset } from './generate-dataset';
import { writeHighContentionRequests } from './output/write-high-contention-requests';
import {
  assertDatabaseIsClean,
  loadTreasuryWallets,
  resetDatabase,
  writeSeedBatch,
} from './persistence/seed-database';
import { runReferentialChecks } from './validation/referential-invariants';
import { runFinancialChecks } from './validation/financial-invariants';
import { buildSeedReport } from './validation/report';
import { GenerationState, SeedWalletRef } from './types';

async function run(): Promise<void> {
  const overrides = parseSeedArgs(process.argv.slice(2));
  const config = resolveSeedConfig(overrides);
  const now = new Date();

  logger.info(
    { scenario: config.scenario, customers: config.customers, seed: config.seed },
    'Starting seed run'
  );

  if (config.reset) {
    logger.info('--reset passed: truncating business tables and re-seeding treasury...');
    await resetDatabase(pool);
  } else {
    await assertDatabaseIsClean(pool);
  }

  const treasuryByCurrency = await loadTreasuryWallets(pool);

  logger.info('Generating dataset in memory...');
  const dataset = await generateDataset(config, now, [...treasuryByCurrency.values()]);

  let contentionRequestsFile: string | null = null;
  if (config.scenario === 'high-contention') {
    contentionRequestsFile = writeHighContentionRequests(
      dataset.contentionIntents,
      dataset.contentionSharedAccountIds
    );
  }

  logger.info(
    {
      users: dataset.users.length,
      wallets: dataset.wallets.length,
      remittances: dataset.remittances.length,
      ledgerEntries: dataset.ledgerEntries.length,
    },
    'Writing seed batch to Postgres...'
  );
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

  logger.info('Running post-seed validation...');
  const checks = [...(await runReferentialChecks(pool)), ...(await runFinancialChecks(pool))];

  const walletsById = new Map<string, SeedWalletRef>(dataset.wallets.map((w) => [w.id, w]));
  const kycStatusCounts = countBy(dataset.kycProfiles, (r) => r.status_id);
  const state: GenerationState = {
    customers: dataset.customers,
    walletsById,
    ledgerEntries: dataset.ledgerEntries,
    remittances: dataset.remittances,
    idempotencyRecords: dataset.idempotencyRecords,
  };
  const report = buildSeedReport(state, kycStatusCounts, checks, contentionRequestsFile);

  logger.info(`\n${report.text}`);
  await pool.end();

  if (!report.passed) {
    process.exit(1);
  }
}

function countBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

run().catch(async (error) => {
  logger.error({ error }, '✗ Seed run failed');
  await pool.end().catch(() => undefined);
  process.exit(1);
});
