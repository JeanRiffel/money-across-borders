import { BcryptPasswordHasher } from '../../security/bycrypt-password-hasher';
import { DeterministicRng } from '../rng/deterministic-rng';
import { FIRST_NAMES, LAST_NAMES, EMAIL_DOMAINS } from '../rng/fixtures/names';
import { SeedConfig } from '../config/seed-config';
import { SeedUserRow, SeedAccountRow, SeedCustomer } from '../types';
import { randomTimestampInRange } from './temporal-distribution';

/**
 * Obviously-fake, fixed password shared by every seeded user (see
 * docs/seed.md's "Segurança" section for why: AGENTS.md request section 15
 * requires the real hashing mechanism, but hashing a distinct password per
 * customer at bcrypt's real cost factor doesn't scale to 10k+ rows). Anyone
 * with this file can log in as any seeded customer — that's the point, it's
 * a fixture, not a credential.
 */
export const SEED_DEFAULT_PASSWORD = 'Seed@12345!';

export interface CustomerGenerationResult {
  users: SeedUserRow[];
  accounts: SeedAccountRow[];
  customers: SeedCustomer[];
}

/**
 * One customer = one User + one Account, matching what CreateAccountUseCase
 * provisions per signup (see AGENTS.md's "user vs account" note) — generated
 * directly via repositories/batch insert rather than by calling the use case
 * itself (see docs/seed.md's "Use case vs. inserção direta" section: the use
 * case's per-row bcrypt hash + individual transaction don't scale here, and
 * its behavior — one OPEN account, no KYC, empty wallets — is exactly what
 * this reproduces anyway).
 */
export async function generateCustomers(
  config: SeedConfig,
  rng: DeterministicRng,
  now: Date
): Promise<CustomerGenerationResult> {
  const passwordHash = await new BcryptPasswordHasher().hash(SEED_DEFAULT_PASSWORD);

  const users: SeedUserRow[] = [];
  const accounts: SeedAccountRow[] = [];
  const customers: SeedCustomer[] = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < config.customers; i++) {
    const createdAt = randomTimestampInRange(rng, now, config.dateRangeDays);
    const userId = rng.uuid();
    const accountId = rng.uuid();
    const email = uniqueFakeEmail(rng, usedEmails);
    const activityProfile = rng.weightedPick(config.activityDistribution);

    users.push({
      id: userId,
      email,
      password_hash: passwordHash,
      status_id: 1, // UserStatus.ACTIVE — CreateAccountUseCase never produces SUSPENDED
      created_at: createdAt,
    });
    accounts.push({
      id: accountId,
      user_id: userId,
      status_id: 1, // AccountStatus.OPEN — the only status CreateAccountUseCase ever persists
      created_at: createdAt,
    });
    customers.push({
      accountId,
      userId,
      activityProfile,
      kycVerified: false, // filled in by generateKycProfiles()
      createdAt,
    });
  }

  return { users, accounts, customers };
}

function uniqueFakeEmail(rng: DeterministicRng, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const first = rng.pick(FIRST_NAMES).toLowerCase();
    const last = rng.pick(LAST_NAMES).toLowerCase();
    const domain = rng.pick(EMAIL_DOMAINS);
    const suffix = rng.nextInt(0, 999_999);
    const email = `${first}.${last}.${suffix}@${domain}`;
    if (!used.has(email)) {
      used.add(email);
      return email;
    }
  }
  // Astronomically unlikely given the suffix space, but keeps this total.
  const fallback = `seed.${rng.uuid()}@${EMAIL_DOMAINS[0]}`;
  used.add(fallback);
  return fallback;
}
