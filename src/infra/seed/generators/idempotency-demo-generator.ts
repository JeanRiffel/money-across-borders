import { DeterministicRng } from '../rng/deterministic-rng';
import { SeedConfig } from '../config/seed-config';
import { SeedIdempotencyRecordRow, SeedRemittanceRow } from '../types';

/**
 * Populates `idempotency_records` — the schema `PostgresIdempotencyRepository`
 * targets — with a small, deliberate fraction of completed remittances
 * mirrored in as a cached response (AGENTS.md request section 10). This
 * table exists in the schema but isn't wired to any factory today (Redis is
 * — see AGENTS.md's Idempotency bullet), so nothing in production reads
 * these rows; they're fixture data for a future test that exercises
 * `PostgresIdempotencyRepository`/`IdempotentDecorator` directly against
 * seeded data, not a claim that this is how idempotency is enforced live.
 * See docs/seed.md's "Idempotência" section for the full rationale,
 * including why Redis itself isn't populated by default.
 */
export function generateIdempotencyDemoRecords(
  config: SeedConfig,
  rng: DeterministicRng,
  completedRemittances: readonly SeedRemittanceRow[]
): SeedIdempotencyRecordRow[] {
  const rows: SeedIdempotencyRecordRow[] = [];

  for (const remittance of completedRemittances) {
    if (!rng.chance(config.idempotencyDemoRatio)) continue;

    rows.push({
      key: `seed-demo:${remittance.id}`,
      request_hash: null,
      response_body: {
        remittanceId: remittance.id,
        senderAccountId: remittance.sender_account_id,
        recipientAccountId: remittance.recipient_account_id,
        sourceAmountMinorUnits: remittance.source_amount_minor_units,
        sourceCurrency: remittance.source_currency,
        status: 'COMPLETED',
        note:
          'Synthetic fixture: represents the response IdempotentDecorator would have cached ' +
          'had this remittance been submitted twice with the same Idempotency-Key. Not read ' +
          'by production code today — see docs/seed.md.',
      },
      status_code: 201,
      created_at: remittance.created_at,
    });
  }

  return rows;
}
