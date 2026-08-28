import { Pool } from 'pg';
import { TREASURY_ACCOUNT_ID } from '../../../domain/wallet/treasury-account';
import { ValidationCheck } from './types';

const TREASURY_ID = TREASURY_ACCOUNT_ID.getValue();

/**
 * Independent, SQL-level re-verification of every financial invariant the
 * generators are supposed to uphold (AGENTS.md request section 16) — run
 * against the rows Postgres actually committed, not the in-memory bookkeeping
 * the generators used while building them. This is the check that would
 * catch a bug in the generators themselves; trusting only their own running
 * totals would just replay the same bug back as a "pass".
 */
export async function runFinancialChecks(pool: Pool): Promise<ValidationCheck[]> {
  return [
    await checkDebitsEqualCredits(pool),
    await checkEveryPostingBalances(pool),
    await checkWalletBalancesMatchLedger(pool),
    await checkNoNegativeBalances(pool),
    await checkTreasuryLiquidity(pool),
  ];
}

async function checkDebitsEqualCredits(pool: Pool): Promise<ValidationCheck> {
  const result = await pool.query<{ currency: string; net: string }>(`
    SELECT currency,
           SUM(CASE WHEN direction_id = 1 THEN amount_minor_units ELSE -amount_minor_units END)::text AS net
    FROM ledger_entries
    GROUP BY currency
    HAVING SUM(CASE WHEN direction_id = 1 THEN amount_minor_units ELSE -amount_minor_units END) <> 0
  `);
  return {
    name: 'Debits == Credits (global, per currency)',
    passed: result.rowCount === 0,
    detail:
      result.rowCount === 0
        ? 'every currency nets to zero across all ledger_entries'
        : result.rows.map((r) => `${r.currency}: net ${r.net}`).join('; '),
  };
}

async function checkEveryPostingBalances(pool: Pool): Promise<ValidationCheck> {
  // Same rule as LedgerService.postBalancedEntries (see docs/seed.md), but
  // per (transaction_id, currency) instead of globally — this is what
  // actually proves no single posting was left unbalanced, as opposed to
  // two unrelated unbalanced postings coincidentally canceling out globally.
  const result = await pool.query(`
    SELECT transaction_id, currency
    FROM ledger_entries
    GROUP BY transaction_id, currency
    HAVING SUM(CASE WHEN direction_id = 1 THEN amount_minor_units ELSE -amount_minor_units END) <> 0
  `);
  return {
    name: 'Every posting balances per currency (LedgerService invariant)',
    passed: result.rowCount === 0,
    detail:
      result.rowCount === 0 ? 'all postings balance' : `${result.rowCount} unbalanced posting(s)`,
  };
}

async function checkWalletBalancesMatchLedger(pool: Pool): Promise<ValidationCheck> {
  // Excludes the treasury account on purpose: its wallets start from the
  // fixed balance migrations/002_seed_treasury_wallets.sql inserts directly
  // (predating any seed run, with no LedgerEntry of its own — the same kind
  // of gap OpenWalletUseCase's initialBalanceMinorUnits has, just already
  // true before this seed exists — see docs/seed.md). Every *customer*
  // wallet this seed creates, by contrast, is 100% ledger-backed (see
  // funding-generator.ts), so this check still means something real for
  // every wallet it actually covers. Treasury's own health is checked
  // separately by checkTreasuryLiquidity below (non-negative), not by
  // ledger reconciliation.
  const result = await pool.query(
    `
    SELECT w.id
    FROM wallets w
    LEFT JOIN ledger_entries le ON le.wallet_id = w.id
    WHERE w.account_id <> $1
    GROUP BY w.id, w.balance_minor_units
    HAVING w.balance_minor_units <> COALESCE(
      SUM(CASE
            WHEN le.direction_id = 2 THEN le.amount_minor_units
            WHEN le.direction_id = 1 THEN -le.amount_minor_units
            ELSE 0
          END),
      0
    )
  `,
    [TREASURY_ID]
  );
  return {
    name: 'Wallet balances consistent with ledger',
    passed: result.rowCount === 0,
    detail:
      result.rowCount === 0
        ? 'every non-treasury wallet balance equals the sum of its own ledger_entries'
        : `${result.rowCount} wallet(s) whose balance disagrees with their ledger entries`,
  };
}

async function checkNoNegativeBalances(pool: Pool): Promise<ValidationCheck> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM wallets WHERE balance_minor_units < 0`
  );
  const count = Number(result.rows[0].count);
  return {
    name: 'No invalid negative balances',
    passed: count === 0,
    detail: count === 0 ? 'none found' : `${count} wallet(s) with a negative balance`,
  };
}

async function checkTreasuryLiquidity(pool: Pool): Promise<ValidationCheck> {
  const result = await pool.query<{ currency: string; balance_minor_units: string }>(
    `SELECT currency, balance_minor_units FROM wallets WHERE account_id = $1`,
    [TREASURY_ID]
  );
  const negative = result.rows.filter((r) => Number(r.balance_minor_units) < 0);
  return {
    name: 'Treasury liquidity sufficient',
    passed: negative.length === 0 && (result.rowCount ?? 0) > 0,
    detail:
      negative.length === 0
        ? result.rows.map((r) => `${r.currency}=${r.balance_minor_units}`).join(', ')
        : `negative treasury balance in: ${negative.map((r) => r.currency).join(', ')}`,
  };
}
