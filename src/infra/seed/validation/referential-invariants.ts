import { Pool } from 'pg';
import { ValidationCheck } from './types';

/**
 * Explicit re-check of every FK relationship the seed writes (AGENTS.md
 * request section 16's "Foreign keys valid" line). Postgres's own REFERENCES
 * constraints already make an orphan row impossible to insert in the first
 * place — this is a defense-in-depth confirmation, and the thing that would
 * catch a batch-writer bug that inserted into the wrong column.
 */
export async function runReferentialChecks(pool: Pool): Promise<ValidationCheck[]> {
  return [
    await checkOrphans(
      pool,
      'wallets -> accounts',
      `
      SELECT count(*)::text AS count FROM wallets w
      LEFT JOIN accounts a ON a.id = w.account_id WHERE a.id IS NULL
    `
    ),
    await checkOrphans(
      pool,
      'ledger_entries -> wallets',
      `
      SELECT count(*)::text AS count FROM ledger_entries le
      LEFT JOIN wallets w ON w.id = le.wallet_id WHERE w.id IS NULL
    `
    ),
    await checkOrphans(
      pool,
      'kyc_profiles -> accounts',
      `
      SELECT count(*)::text AS count FROM kyc_profiles k
      LEFT JOIN accounts a ON a.id = k.account_id WHERE a.id IS NULL
    `
    ),
    await checkOrphans(
      pool,
      'remittances -> sender accounts',
      `
      SELECT count(*)::text AS count FROM remittances r
      LEFT JOIN accounts a ON a.id = r.sender_account_id WHERE a.id IS NULL
    `
    ),
    await checkOrphans(
      pool,
      'remittances -> recipient accounts',
      `
      SELECT count(*)::text AS count FROM remittances r
      LEFT JOIN accounts a ON a.id = r.recipient_account_id WHERE a.id IS NULL
    `
    ),
    await checkOrphans(
      pool,
      'remittances -> source wallets',
      `
      SELECT count(*)::text AS count FROM remittances r
      LEFT JOIN wallets w ON w.id = r.source_wallet_id WHERE w.id IS NULL
    `
    ),
    await checkOrphans(
      pool,
      'remittances -> destination wallets',
      `
      SELECT count(*)::text AS count FROM remittances r
      LEFT JOIN wallets w ON w.id = r.destination_wallet_id WHERE w.id IS NULL
    `
    ),
  ];
}

async function checkOrphans(pool: Pool, label: string, sql: string): Promise<ValidationCheck> {
  const result = await pool.query<{ count: string }>(sql);
  const count = Number(result.rows[0].count);
  return {
    name: `Foreign keys valid (${label})`,
    passed: count === 0,
    detail: count === 0 ? 'no orphan rows' : `${count} orphan row(s)`,
  };
}
