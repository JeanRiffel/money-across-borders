import { GenerationState } from '../types';
import { ValidationCheck } from './types';

export interface SeedReport {
  text: string;
  passed: boolean;
}

const KYC_STATUS_LABEL: Record<number, string> = { 1: 'PENDING', 2: 'VERIFIED', 3: 'REJECTED' };
const REMITTANCE_STATUS_LABEL: Record<number, string> = {
  1: 'COMPLETED',
  2: 'REJECTED_COMPLIANCE',
  3: 'REJECTED_INSUFFICIENT_FUNDS',
  4: 'FAILED',
};

/**
 * Builds the human-readable summary AGENTS.md request section 16 asks for.
 * Row counts come from the generation state itself (what was actually built
 * and handed to writeSeedBatch in this run); the ✓/✗ lines come from
 * validation/financial-invariants.ts + referential-invariants.ts, which
 * re-derive everything independently from Postgres — see those files' doc
 * comments for why both matter.
 */
export function buildSeedReport(
  state: GenerationState,
  kycStatusCounts: Map<number, number>,
  checks: readonly ValidationCheck[],
  contentionRequestsFile: string | null
): SeedReport {
  const currencyWalletCounts = countBy([...state.walletsById.values()], (w) => w.currency);
  const remittanceStatusCounts = countBy(state.remittances, (r) => r.status_id);
  const passed = checks.every((c) => c.passed);

  const lines: string[] = [];
  lines.push(passed ? 'Seed completed' : 'Seed completed WITH FAILED VALIDATIONS');
  lines.push('');
  lines.push(`Customers:       ${format(state.customers.length)}`);
  lines.push(`Accounts:        ${format(state.customers.length)}`); // 1 Account per customer (see customer-generator.ts)
  lines.push(`Wallets:         ${format(state.walletsById.size)}`);
  lines.push(`Remittances:     ${format(state.remittances.length)}`);
  lines.push(`Ledger entries:  ${format(state.ledgerEntries.length)}`);
  lines.push(`Idempotency demo rows: ${format(state.idempotencyRecords.length)}`);
  lines.push('');

  lines.push('Currencies (wallets):');
  for (const [currency, count] of currencyWalletCounts) {
    lines.push(`  ${currency}: ${format(count)}`);
  }
  lines.push('');

  lines.push('KYC:');
  for (const [statusId, count] of kycStatusCounts) {
    lines.push(`  ${KYC_STATUS_LABEL[statusId] ?? statusId}: ${format(count)}`);
  }
  lines.push('');

  lines.push('Remittances:');
  for (const [statusId, count] of remittanceStatusCounts) {
    lines.push(`  ${REMITTANCE_STATUS_LABEL[statusId] ?? statusId}: ${format(count)}`);
  }
  lines.push('');

  lines.push('Financial checks:');
  for (const check of checks) {
    lines.push(
      `  ${check.passed ? '✓' : '✗'} ${check.name}${check.passed ? '' : ` — ${check.detail}`}`
    );
  }

  if (contentionRequestsFile) {
    lines.push('');
    lines.push(`High-contention requests written to: ${contentionRequestsFile}`);
  }

  return { text: lines.join('\n'), passed };
}

function countBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function format(n: number): string {
  return n.toLocaleString('en-US');
}
