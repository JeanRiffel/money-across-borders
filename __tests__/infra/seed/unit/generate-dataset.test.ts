import bcrypt from 'bcrypt';
import { generateDataset } from '../../../../src/infra/seed/generate-dataset';
import { resolveSeedConfig } from '../../../../src/infra/seed/config/seed-config';
import { SeedUserRow, SeedWalletRef } from '../../../../src/infra/seed/types';
import { SEED_DEFAULT_PASSWORD } from '../../../../src/infra/seed/generators/customer-generator';

const NOW = new Date('2024-06-01T12:00:00Z');
const TREASURY_STARTING_BALANCE = 1_000_000_000;

function buildFakeTreasury(): SeedWalletRef[] {
  return ['BRL', 'USD', 'EUR', 'GBP'].map((currency) => ({
    id: `treasury-${currency}`,
    accountId: 'treasury-account',
    currency,
    balance: TREASURY_STARTING_BALANCE,
    createdAt: new Date(0),
  }));
}

// BcryptPasswordHasher salts with real randomness (as it should — see
// docs/seed.md's "Determinism" section for why this is the one field NOT
// byte-identical across two runs of the same seed). Every other field is
// compared as-is; password hashes are compared "modulo being a valid bcrypt
// hash of the known seed password" instead of by string equality.
function withoutPasswordHash(users: readonly SeedUserRow[]): Omit<SeedUserRow, 'password_hash'>[] {
  return users.map((u) => ({ id: u.id, email: u.email, status_id: u.status_id, created_at: u.created_at }));
}

describe('generateDataset (pure, no DB)', () => {
  it('is deterministic: same seed + same config + same treasury snapshot -> identical dataset', async () => {
    const config = resolveSeedConfig({ customers: 100, seed: 42 });

    const a = await generateDataset(config, NOW, buildFakeTreasury());
    const b = await generateDataset(config, NOW, buildFakeTreasury());

    expect(withoutPasswordHash(a.users)).toEqual(withoutPasswordHash(b.users));
    expect(a.accounts).toEqual(b.accounts);
    expect(a.wallets).toEqual(b.wallets);
    expect(a.kycProfiles).toEqual(b.kycProfiles);
    expect(a.remittances).toEqual(b.remittances);
    expect(a.ledgerEntries).toEqual(b.ledgerEntries);

    // password_hash itself is a real bcrypt hash of the same known seed
    // password every time, even though the hash string differs per run —
    // hashed once per generateDataset() call and reused for every customer
    // in that run (see customer-generator.ts), so checking one user from
    // each run is representative of the whole array.
    expect(await bcrypt.compare(SEED_DEFAULT_PASSWORD, a.users[0].password_hash)).toBe(true);
    expect(await bcrypt.compare(SEED_DEFAULT_PASSWORD, b.users[0].password_hash)).toBe(true);
  }, 15_000);

  it('produces a different dataset for a different seed', async () => {
    const configA = resolveSeedConfig({ customers: 100, seed: 42 });
    const configB = resolveSeedConfig({ customers: 100, seed: 43 });

    const a = await generateDataset(configA, NOW, buildFakeTreasury());
    const b = await generateDataset(configB, NOW, buildFakeTreasury());

    expect(a.users).not.toEqual(b.users);
  });

  it('honors --customers exactly (1 User + 1 Account per customer)', async () => {
    const config = resolveSeedConfig({ customers: 250, seed: 1 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());

    expect(dataset.users).toHaveLength(250);
    expect(dataset.accounts).toHaveLength(250);
    expect(dataset.customers).toHaveLength(250);
  });

  it('every wallet/remittance/kyc row references a real, generated account', async () => {
    const config = resolveSeedConfig({ customers: 200, seed: 5 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());
    const accountIds = new Set(dataset.accounts.map((a) => a.id));
    const walletIds = new Set(dataset.wallets.map((w) => w.id));

    for (const wallet of dataset.wallets) {
      expect(accountIds.has(wallet.accountId)).toBe(true);
    }
    for (const kyc of dataset.kycProfiles) {
      expect(accountIds.has(kyc.account_id)).toBe(true);
    }
    for (const remittance of dataset.remittances) {
      expect(accountIds.has(remittance.sender_account_id)).toBe(true);
      expect(accountIds.has(remittance.recipient_account_id)).toBe(true);
      expect(
        walletIds.has(remittance.source_wallet_id) ||
          [...dataset.treasuryByCurrency.values()].some((t) => t.id === remittance.source_wallet_id)
      ).toBe(true);
      expect(walletIds.has(remittance.destination_wallet_id)).toBe(true);
    }
  });

  it('every posting in ledgerEntries balances per currency', async () => {
    const config = resolveSeedConfig({ customers: 300, seed: 11 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());

    const netByTransactionAndCurrency = new Map<string, number>();
    for (const entry of dataset.ledgerEntries) {
      const key = `${entry.transaction_id}:${entry.currency}`;
      const signed =
        entry.direction_id === 1 ? entry.amount_minor_units : -entry.amount_minor_units;
      netByTransactionAndCurrency.set(key, (netByTransactionAndCurrency.get(key) ?? 0) + signed);
    }

    for (const [key, net] of netByTransactionAndCurrency) {
      expect(net).toBe(0);
      void key;
    }
  });

  it('every wallet balance equals the sum of its own ledger entries', async () => {
    const config = resolveSeedConfig({ customers: 300, seed: 11 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());

    const ledgerBalanceByWallet = new Map<string, number>();
    for (const entry of dataset.ledgerEntries) {
      const signed =
        entry.direction_id === 2 ? entry.amount_minor_units : -entry.amount_minor_units;
      ledgerBalanceByWallet.set(
        entry.wallet_id,
        (ledgerBalanceByWallet.get(entry.wallet_id) ?? 0) + signed
      );
    }

    // Customer wallets start at 0 with no seed balance predating this run,
    // so their whole balance must equal their ledger net exactly.
    for (const wallet of dataset.wallets) {
      expect(wallet.balance).toBe(ledgerBalanceByWallet.get(wallet.id) ?? 0);
    }
    // Treasury wallets start from TREASURY_STARTING_BALANCE (mirroring
    // migrations/002_seed_treasury_wallets.sql's own fixed, non-ledger-backed
    // seed balance — see docs/seed.md and financial-invariants.ts's
    // checkWalletBalancesMatchLedger comment) — only the *delta* since then
    // is ledger-backed.
    for (const treasury of dataset.treasuryByCurrency.values()) {
      const ledgerNet = ledgerBalanceByWallet.get(treasury.id) ?? 0;
      expect(treasury.balance).toBe(TREASURY_STARTING_BALANCE + ledgerNet);
    }
  });

  it('never leaves a wallet or treasury balance negative', async () => {
    const config = resolveSeedConfig({ customers: 500, seed: 99 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());

    for (const wallet of dataset.wallets) {
      expect(wallet.balance).toBeGreaterThanOrEqual(0);
    }
    for (const treasury of dataset.treasuryByCurrency.values()) {
      expect(treasury.balance).toBeGreaterThanOrEqual(0);
    }
  });

  it('generates a small dataset end to end (100 customers) without throwing', async () => {
    const config = resolveSeedConfig({ customers: 100, seed: 42 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());

    expect(dataset.customers).toHaveLength(100);
    expect(dataset.remittances.length).toBeGreaterThan(0);
    expect(dataset.ledgerEntries.length).toBeGreaterThan(0);
  });

  it('high-contention scenario builds a shared pool and intents referencing only it', async () => {
    const config = resolveSeedConfig({ scenario: 'high-contention', customers: 50, seed: 42 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());

    expect(dataset.contentionSharedAccountIds.length).toBeGreaterThan(0);
    expect(dataset.contentionIntents.length).toBeGreaterThan(0);

    const sharedSet = new Set(dataset.contentionSharedAccountIds);
    for (const intent of dataset.contentionIntents) {
      expect(sharedSet.has(intent.senderAccountId)).toBe(true);
      expect(sharedSet.has(intent.recipientAccountId)).toBe(true);
    }
  });

  it('the normal scenario never produces contention intents', async () => {
    const config = resolveSeedConfig({ scenario: 'normal', customers: 50, seed: 42 });
    const dataset = await generateDataset(config, NOW, buildFakeTreasury());

    expect(dataset.contentionIntents).toHaveLength(0);
    expect(dataset.contentionSharedAccountIds).toHaveLength(0);
  });
});
