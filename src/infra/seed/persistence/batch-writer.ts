import { PoolClient } from 'pg';
import {
  SeedAccountRow,
  SeedIdempotencyRecordRow,
  SeedKycProfileRow,
  SeedLedgerEntryRow,
  SeedRemittanceRow,
  SeedUserRow,
  SeedWalletRow,
} from '../types';

/**
 * Bulk inserts via `INSERT ... SELECT * FROM UNNEST(...)` — one round trip
 * per chunk of rows instead of one per row (see docs/seed.md's
 * "Performance" section for why: at ~850k ledger_entries, one INSERT per
 * row is the difference between minutes and hours). This reaches
 * COPY-like throughput without adding `pg-copy-streams` as a new dependency
 * — `pg` already knows how to bind a JS array to a typed Postgres array
 * parameter, which is all UNNEST needs.
 *
 * Every function here takes a `PoolClient` already inside the seed's one
 * transaction (see persistence/seed-database.ts) — never `pool` directly —
 * so a failure partway through rolls back everything already inserted in
 * this run, same guarantee `PostgresUnitOfWork` gives the real app.
 */
const DEFAULT_BATCH_SIZE = 5_000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function insertUsers(
  client: PoolClient,
  rows: readonly SeedUserRow[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await client.query(
      `INSERT INTO users (id, email, password_hash, status_id, created_at)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::smallint[], $5::timestamptz[])`,
      [
        batch.map((r) => r.id),
        batch.map((r) => r.email),
        batch.map((r) => r.password_hash),
        batch.map((r) => r.status_id),
        batch.map((r) => r.created_at),
      ]
    );
  }
}

export async function insertAccounts(
  client: PoolClient,
  rows: readonly SeedAccountRow[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await client.query(
      `INSERT INTO accounts (id, user_id, status_id, created_at)
       SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::smallint[], $4::timestamptz[])`,
      [
        batch.map((r) => r.id),
        batch.map((r) => r.user_id),
        batch.map((r) => r.status_id),
        batch.map((r) => r.created_at),
      ]
    );
  }
}

export async function insertWallets(
  client: PoolClient,
  rows: readonly SeedWalletRow[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await client.query(
      `INSERT INTO wallets (id, account_id, currency, balance_minor_units, status_id, created_at)
       SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::char(3)[], $4::bigint[], $5::smallint[], $6::timestamptz[])`,
      [
        batch.map((r) => r.id),
        batch.map((r) => r.account_id),
        batch.map((r) => r.currency),
        batch.map((r) => r.balance_minor_units),
        batch.map((r) => r.status_id),
        batch.map((r) => r.created_at),
      ]
    );
  }
}

export async function insertKycProfiles(
  client: PoolClient,
  rows: readonly SeedKycProfileRow[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await client.query(
      `INSERT INTO kyc_profiles (id, account_id, status_id, full_name, document_id, verified_at, created_at)
       SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::smallint[], $4::text[], $5::text[], $6::timestamptz[], $7::timestamptz[])`,
      [
        batch.map((r) => r.id),
        batch.map((r) => r.account_id),
        batch.map((r) => r.status_id),
        batch.map((r) => r.full_name),
        batch.map((r) => r.document_id),
        batch.map((r) => r.verified_at),
        batch.map((r) => r.created_at),
      ]
    );
  }
}

export async function insertLedgerEntries(
  client: PoolClient,
  rows: readonly SeedLedgerEntryRow[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await client.query(
      `INSERT INTO ledger_entries
         (id, wallet_id, direction_id, amount_minor_units, currency, transaction_id, description, created_at)
       SELECT * FROM UNNEST(
         $1::uuid[], $2::uuid[], $3::smallint[], $4::bigint[], $5::char(3)[],
         $6::uuid[], $7::text[], $8::timestamptz[]
       )`,
      [
        batch.map((r) => r.id),
        batch.map((r) => r.wallet_id),
        batch.map((r) => r.direction_id),
        batch.map((r) => r.amount_minor_units),
        batch.map((r) => r.currency),
        batch.map((r) => r.transaction_id),
        batch.map((r) => r.description),
        batch.map((r) => r.created_at),
      ]
    );
  }
}

export async function insertRemittances(
  client: PoolClient,
  rows: readonly SeedRemittanceRow[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await client.query(
      `INSERT INTO remittances
         (id, sender_account_id, recipient_account_id, source_wallet_id, destination_wallet_id,
          source_amount_minor_units, source_currency, fee_minor_units, fee_currency,
          converted_amount_minor_units, destination_currency, exchange_rate, status_id, created_at)
       SELECT * FROM UNNEST(
         $1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[],
         $6::bigint[], $7::char(3)[], $8::bigint[], $9::char(3)[],
         $10::bigint[], $11::char(3)[], $12::numeric[], $13::smallint[], $14::timestamptz[]
       )`,
      [
        batch.map((r) => r.id),
        batch.map((r) => r.sender_account_id),
        batch.map((r) => r.recipient_account_id),
        batch.map((r) => r.source_wallet_id),
        batch.map((r) => r.destination_wallet_id),
        batch.map((r) => r.source_amount_minor_units),
        batch.map((r) => r.source_currency),
        batch.map((r) => r.fee_minor_units),
        batch.map((r) => r.fee_currency),
        batch.map((r) => r.converted_amount_minor_units),
        batch.map((r) => r.destination_currency),
        batch.map((r) => r.exchange_rate),
        batch.map((r) => r.status_id),
        batch.map((r) => r.created_at),
      ]
    );
  }
}

export async function insertIdempotencyRecords(
  client: PoolClient,
  rows: readonly SeedIdempotencyRecordRow[],
  batchSize = DEFAULT_BATCH_SIZE
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await client.query(
      `INSERT INTO idempotency_records (key, request_hash, response_body, status_code, created_at)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::jsonb[], $4::smallint[], $5::timestamptz[])
       ON CONFLICT (key) DO NOTHING`,
      [
        batch.map((r) => r.key),
        batch.map((r) => r.request_hash),
        batch.map((r) => JSON.stringify(r.response_body)),
        batch.map((r) => r.status_code),
        batch.map((r) => r.created_at),
      ]
    );
  }
}

/** Exposed for tests that want to exercise chunking without a real Pool. */
export function forTesting_chunk<T>(items: readonly T[], size: number): T[][] {
  return chunk(items, size);
}
