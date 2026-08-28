import { DeterministicRng } from '../rng/deterministic-rng';
import { SeedConfig } from '../config/seed-config';
import { ContentionIntent, SeedCustomer, SeedLedgerEntryRow, SeedWalletRef } from '../types';

/**
 * Prepares the `high-contention` scenario's shared resource pool (AGENTS.md
 * request section 11). Two outputs, neither of which executes anything
 * concurrently:
 *
 *  1. A small set of accounts (config.contentionSharedAccounts) has their
 *     wallets topped up well beyond what a single generated remittance
 *     needs, via the same treasury-backed, ledger-first posting
 *     funding-generator.ts uses for ordinary wallets — so the pool stays
 *     usable as a shared target for many concurrent requests later.
 *  2. `config.contentionIntents` request tuples referencing *only* that
 *     pool, meant for an external load-test tool (k6, artillery, a custom
 *     script) to fire concurrently against a running app — see
 *     output/write-high-contention-requests.ts for where these land.
 */
export interface ContentionPoolResult {
  sharedAccountIds: string[];
  topUpLedgerEntries: SeedLedgerEntryRow[];
  intents: ContentionIntent[];
}

export function buildContentionPool(
  config: SeedConfig,
  rng: DeterministicRng,
  customers: readonly SeedCustomer[],
  walletsByAccountId: ReadonlyMap<string, SeedWalletRef[]>,
  treasuryByCurrency: Map<string, SeedWalletRef>,
  now: Date
): ContentionPoolResult {
  const sharedCustomers = customers.slice(
    0,
    Math.min(config.contentionSharedAccounts, customers.length)
  );
  const sharedAccountIds = sharedCustomers.map((c) => c.accountId);
  const topUpLedgerEntries: SeedLedgerEntryRow[] = [];

  // The seed's job is to make contention *possible* to test, not to predict
  // exactly how many requests a real concurrent run will need — so this
  // aims comfortably high rather than precisely matching contentionIntents.
  const topUpTarget = config.contentionIntents * config.contentionAmountRange.max * 2;

  for (const customer of sharedCustomers) {
    for (const wallet of walletsByAccountId.get(customer.accountId) ?? []) {
      const treasury = treasuryByCurrency.get(wallet.currency);
      if (!treasury) continue;

      const affordable = Math.floor(treasury.balance * 0.5);
      const amount = Math.min(topUpTarget, affordable);
      if (amount <= 0) continue;

      const transactionId = rng.uuid();
      topUpLedgerEntries.push(
        {
          id: rng.uuid(),
          wallet_id: treasury.id,
          direction_id: 1,
          amount_minor_units: amount,
          currency: wallet.currency,
          transaction_id: transactionId,
          description: 'seed high-contention pool top-up (treasury -> customer)',
          created_at: now,
        },
        {
          id: rng.uuid(),
          wallet_id: wallet.id,
          direction_id: 2,
          amount_minor_units: amount,
          currency: wallet.currency,
          transaction_id: transactionId,
          description: 'seed high-contention pool top-up (treasury -> customer)',
          created_at: now,
        }
      );

      treasury.balance -= amount;
      wallet.balance += amount;
    }
  }

  const intents: ContentionIntent[] = [];
  for (let i = 0; i < config.contentionIntents; i++) {
    const sender = rng.pick(sharedCustomers);
    const recipient = pickDifferentCustomer(rng, sharedCustomers, sender.accountId);
    if (!recipient) continue;

    const senderWallets = walletsByAccountId.get(sender.accountId) ?? [];
    const recipientWallets = walletsByAccountId.get(recipient.accountId) ?? [];
    if (senderWallets.length === 0 || recipientWallets.length === 0) continue;

    const senderWallet = rng.pick(senderWallets);
    const recipientWallet = rng.pick(recipientWallets);

    intents.push({
      senderAccountId: sender.accountId,
      senderCurrency: senderWallet.currency,
      recipientAccountId: recipient.accountId,
      recipientCurrency: recipientWallet.currency,
      amountMinorUnits: rng.nextInt(
        config.contentionAmountRange.min,
        config.contentionAmountRange.max
      ),
      idempotencyKey: rng.uuid(),
    });
  }

  return { sharedAccountIds, topUpLedgerEntries, intents };
}

function pickDifferentCustomer(
  rng: DeterministicRng,
  pool: readonly SeedCustomer[],
  excludeAccountId: string
): SeedCustomer | null {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = rng.pick(pool);
    if (candidate.accountId !== excludeAccountId) return candidate;
  }
  return null;
}
