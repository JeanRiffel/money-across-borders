import { DeterministicRng } from '../rng/deterministic-rng';
import { FIRST_NAMES, LAST_NAMES, fakeDocumentId } from '../rng/fixtures/names';
import { SeedConfig } from '../config/seed-config';
import { SeedCustomer, SeedKycProfileRow } from '../types';
import { randomTimestampBetween } from './temporal-distribution';

const KYC_STATUS_ID: Record<'verified' | 'pending' | 'rejected', number> = {
  pending: 1,
  verified: 2,
  rejected: 3,
};

/**
 * One KycProfile per customer, distributed VERIFIED/PENDING/REJECTED per
 * config (AGENTS.md request section 1/3). Inserted directly, not through
 * SubmitKycUseCase: that use case always auto-verifies synchronously (see
 * its own comment) — it never produces PENDING or REJECTED in this MVP, so
 * there's no real flow to reproduce for those two statuses. Mutates
 * `customer.kycVerified` in place — the remittance generator (and its
 * compliance-limit mirror) reads that flag.
 */
export function generateKycProfiles(
  config: SeedConfig,
  rng: DeterministicRng,
  customers: SeedCustomer[],
  now: Date
): SeedKycProfileRow[] {
  const rows: SeedKycProfileRow[] = [];

  for (const customer of customers) {
    const status = rng.weightedPick(config.kycDistribution);
    customer.kycVerified = status === 'verified';

    const createdAt = randomTimestampBetween(rng, customer.createdAt, now);
    rows.push({
      id: rng.uuid(),
      account_id: customer.accountId,
      status_id: KYC_STATUS_ID[status],
      full_name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      document_id: fakeDocumentId(rng.uuid()),
      // SubmitKycUseCase sets verifiedAt = the submission time itself
      // (synchronous auto-verify) — mirrored here only for the VERIFIED
      // case; PENDING/REJECTED never get a verifiedAt in the real schema.
      verified_at: status === 'verified' ? createdAt : null,
      created_at: createdAt,
    });
  }

  return rows;
}
