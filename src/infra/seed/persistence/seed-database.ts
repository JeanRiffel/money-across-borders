import fs from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';
import { TREASURY_ACCOUNT_ID } from '../../../domain/wallet/treasury-account';
import {
  SeedAccountRow,
  SeedIdempotencyRecordRow,
  SeedKycProfileRow,
  SeedLedgerEntryRow,
  SeedRemittanceRow,
  SeedUserRow,
  SeedWalletRef,
} from '../types';
import {
  insertAccounts,
  insertIdempotencyRecords,
  insertKycProfiles,
  insertLedgerEntries,
  insertRemittances,
  insertUsers,
  insertWallets,
} from './batch-writer';

const TREASURY_ID = TREASURY_ACCOUNT_ID.getValue();
// The migration that (idempotently) seeds the treasury account + its
// per-currency wallets — re-run verbatim after a --reset truncation so the
// fixed anchor id/wallets this whole seed depends on always exist.
const TREASURY_MIGRATION_PATH = path.join(
  __dirname,
  '../../persistence/postgresql/migrations/002_seed_treasury_wallets.sql'
);

export class DatabaseNotCleanError extends Error {
  constructor(businessRowCount: number) {
    super(
      `Found ${businessRowCount} pre-existing business account(s) besides the treasury account. ` +
        `The seed expects a freshly migrated, empty database — pass --reset to truncate business ` +
        `tables first (refused when NODE_ENV=production), or point at a clean database.`
    );
    this.name = 'DatabaseNotCleanError';
  }
}

/** Throws DatabaseNotCleanError unless the only account present is the treasury's. */
export async function assertDatabaseIsClean(pool: Pool): Promise<void> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM accounts WHERE id <> $1`,
    [TREASURY_ID]
  );
  const count = Number(result.rows[0].count);
  if (count > 0) {
    throw new DatabaseNotCleanError(count);
  }
}

/**
 * Truncates every business table (never touching Postgres's own catalog of
 * *what tables exist*, just their rows) and re-seeds the treasury — guarded
 * against ever running with NODE_ENV=production, since this is a
 * destructive, irreversible operation meant for local/CI iteration only.
 */
export async function resetDatabase(pool: Pool): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('--reset refused: NODE_ENV=production. Point at a non-production database.');
  }

  await pool.query(`
    TRUNCATE TABLE
      idempotency_records,
      ledger_entries,
      remittances,
      kyc_profiles,
      wallets,
      accounts,
      users
    RESTART IDENTITY CASCADE
  `);

  const treasurySql = fs.readFileSync(TREASURY_MIGRATION_PATH, 'utf8');
  await pool.query(treasurySql);
}

/** account_id/currency -> wallet, for the treasury account only. */
export async function loadTreasuryWallets(pool: Pool): Promise<Map<string, SeedWalletRef>> {
  const result = await pool.query<{ id: string; currency: string; balance_minor_units: string }>(
    `SELECT id, currency, balance_minor_units FROM wallets WHERE account_id = $1`,
    [TREASURY_ID]
  );

  if (result.rows.length === 0) {
    throw new Error(
      'No treasury wallets found. Run "npm run db:migrate" first ' +
        '(migrations/002_seed_treasury_wallets.sql seeds the treasury account + its wallets).'
    );
  }

  const byCurrency = new Map<string, SeedWalletRef>();
  for (const row of result.rows) {
    byCurrency.set(row.currency, {
      id: row.id,
      accountId: TREASURY_ID,
      currency: row.currency,
      balance: Number(row.balance_minor_units),
      createdAt: new Date(0), // irrelevant for the treasury; never read
    });
  }
  return byCurrency;
}

export interface SeedWriteBatch {
  users: SeedUserRow[];
  accounts: SeedAccountRow[];
  kycProfiles: SeedKycProfileRow[];
  wallets: SeedWalletRef[];
  ledgerEntries: SeedLedgerEntryRow[];
  remittances: SeedRemittanceRow[];
  idempotencyRecords: SeedIdempotencyRecordRow[];
  /** Final treasury wallet balances after generation, to persist alongside customer wallets. */
  treasuryWallets: SeedWalletRef[];
}

/**
 * Writes every generated table in one transaction, in FK-dependency order —
 * same idiom PostgresUnitOfWork uses for a single use case's writes (BEGIN /
 * COMMIT, ROLLBACK + rethrow on any failure), applied here across the whole
 * seed run: a failure on, say, the last ledger_entries batch rolls back
 * every user/account/wallet/kyc row inserted before it too, so a botched
 * run never leaves a half-seeded database behind.
 */
export async function writeSeedBatch(pool: Pool, batch: SeedWriteBatch): Promise<void> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    await insertUsers(client, batch.users);
    await insertAccounts(client, batch.accounts);
    await insertKycProfiles(client, batch.kycProfiles);
    await insertWallets(
      client,
      batch.wallets.map((w) => ({
        id: w.id,
        account_id: w.accountId,
        currency: w.currency,
        balance_minor_units: w.balance,
        status_id: 1, // WalletStatus.ACTIVE — the seed never generates a CLOSED wallet
        created_at: w.createdAt,
      }))
    );
    // Treasury wallets already exist (from migration 002) — this updates
    // their balance to reflect everything the seed funded/settled through
    // them, rather than inserting new rows.
    for (const treasuryWallet of batch.treasuryWallets) {
      await client.query(`UPDATE wallets SET balance_minor_units = $1 WHERE id = $2`, [
        treasuryWallet.balance,
        treasuryWallet.id,
      ]);
    }
    await insertLedgerEntries(client, batch.ledgerEntries);
    await insertRemittances(client, batch.remittances);
    await insertIdempotencyRecords(client, batch.idempotencyRecords);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
