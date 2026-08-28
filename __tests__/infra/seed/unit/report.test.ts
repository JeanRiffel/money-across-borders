import { buildSeedReport } from '../../../../src/infra/seed/validation/report';
import { GenerationState } from '../../../../src/infra/seed/types';

function emptyState(): GenerationState {
  return {
    customers: [
      {
        accountId: 'acc-1',
        userId: 'user-1',
        activityProfile: 'normal',
        kycVerified: true,
        createdAt: new Date(),
      },
    ],
    walletsById: new Map(),
    ledgerEntries: [],
    remittances: [],
    idempotencyRecords: [],
  };
}

describe('buildSeedReport', () => {
  it('reports success when every check passes', () => {
    const report = buildSeedReport(
      emptyState(),
      new Map([[2, 1]]),
      [{ name: 'Debits == Credits', passed: true, detail: 'ok' }],
      null
    );

    expect(report.passed).toBe(true);
    expect(report.text).toContain('Seed completed');
    expect(report.text).toContain('✓ Debits == Credits');
    expect(report.text).not.toContain('✗');
  });

  it('reports failure and surfaces the failing check detail when any check fails', () => {
    const report = buildSeedReport(
      emptyState(),
      new Map([[2, 1]]),
      [
        { name: 'Debits == Credits', passed: true, detail: 'ok' },
        {
          name: 'Wallet balances consistent with ledger',
          passed: false,
          detail: '3 mismatched wallet(s)',
        },
      ],
      null
    );

    expect(report.passed).toBe(false);
    expect(report.text).toContain('FAILED VALIDATIONS');
    expect(report.text).toContain(
      '✗ Wallet balances consistent with ledger — 3 mismatched wallet(s)'
    );
  });

  it('includes the high-contention requests file path when provided', () => {
    const report = buildSeedReport(
      emptyState(),
      new Map(),
      [],
      '/tmp/seed-output/high-contention-requests.json'
    );
    expect(report.text).toContain('/tmp/seed-output/high-contention-requests.json');
  });
});
