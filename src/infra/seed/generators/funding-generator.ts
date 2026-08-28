import { DeterministicRng } from '../rng/deterministic-rng';
import { SeedConfig } from '../config/seed-config';
import { SeedLedgerEntryRow, SeedWalletRef } from '../types';
import { assertBalancedPerCurrency } from './ledger-math';

/**
 * Leaves this fraction of each treasury wallet's balance untouched by
 * initial funding, reserved for remittance FX settlement legs generated
 * afterward (see remittance-generator.ts) — treasury is seeded once with a
 * large but *fixed* balance (migrations/002_seed_treasury_wallets.sql,
 * documented as deliberate in docs/known-issues.md), so funding has to share
 * that fixed pool with everything generated after it, not assume it's
 * infinite.
 */
const FUNDING_SAFETY_FACTOR = 0.6;

/**
 * Gives every wallet its opening balance as a real, ledger-backed posting
 * against the treasury wallet of the same currency — debit treasury, credit
 * customer wallet — instead of writing `wallets.balance_minor_units`
 * directly with no corresponding LedgerEntry (which is what
 * OpenWalletUseCase's `initialBalanceMinorUnits` param does today; see
 * docs/seed.md's "Limitações" section for why the seed deliberately does
 * NOT mirror that gap). This is the same treasury-as-counterparty pattern
 * LedgerService/SendRemittanceUseCase already use for FX — applied here to
 * "funding" instead of "conversion" — so every minor unit of balance this
 * seed creates is reachable by summing `ledger_entries` for that wallet.
 *
 * Sampling happens in two passes per currency so total funding never
 * exceeds what that currency's treasury wallet can actually afford:
 * (1) sample each wallet's *requested* amount from the configured tier
 * distribution, (2) scale every request down by the same factor if their
 * sum would exceed the currency's funding budget. Bigger `--customers`
 * runs against the same fixed treasury pool therefore get
 * proportionally smaller average balances — see docs/seed.md.
 */
export function generateFunding(
  config: SeedConfig,
  rng: DeterministicRng,
  wallets: readonly SeedWalletRef[],
  treasuryByCurrency: ReadonlyMap<string, SeedWalletRef>
): SeedLedgerEntryRow[] {
  const entries: SeedLedgerEntryRow[] = [];
  const walletsByCurrency = groupBy(wallets, (wallet) => wallet.currency);

  for (const [currency, currencyWallets] of walletsByCurrency) {
    const treasury = treasuryByCurrency.get(currency);
    if (!treasury) {
      throw new Error(
        `No treasury wallet found for currency ${currency}. Run "npm run db:migrate" first ` +
          `(migrations/002_seed_treasury_wallets.sql seeds one treasury wallet per supported currency).`
      );
    }

    const requests = currencyWallets.map((wallet) => ({
      wallet,
      amount: sampleTierAmountMinorUnits(config, rng),
    }));
    const rawTotal = requests.reduce((sum, request) => sum + request.amount, 0);
    const budget = Math.floor(treasury.balance * FUNDING_SAFETY_FACTOR);
    const scale = rawTotal > budget && rawTotal > 0 ? budget / rawTotal : 1;

    for (const { wallet, amount } of requests) {
      const actual = Math.floor(amount * scale);
      if (actual <= 0) continue; // "zero" tier, or scaled down to nothing — a legitimate empty wallet

      const transactionId = rng.uuid();
      const legs = [
        { walletId: treasury.id, currency, direction: 1 as const, amountMinorUnits: actual },
        { walletId: wallet.id, currency, direction: 2 as const, amountMinorUnits: actual },
      ];
      assertBalancedPerCurrency(legs);

      entries.push(
        {
          id: rng.uuid(),
          wallet_id: treasury.id,
          direction_id: 1,
          amount_minor_units: actual,
          currency,
          transaction_id: transactionId,
          description: 'seed initial funding (treasury -> customer)',
          created_at: wallet.createdAt,
        },
        {
          id: rng.uuid(),
          wallet_id: wallet.id,
          direction_id: 2,
          amount_minor_units: actual,
          currency,
          transaction_id: transactionId,
          description: 'seed initial funding (treasury -> customer)',
          created_at: wallet.createdAt,
        }
      );

      treasury.balance -= actual;
      wallet.balance += actual;
    }
  }

  return entries;
}

function sampleTierAmountMinorUnits(config: SeedConfig, rng: DeterministicRng): number {
  const tier = rng.weightedPick(config.balanceTierDistribution);
  if (tier === 'zero') return 0;
  const range = config.balanceTierRanges[tier];
  return rng.nextInt(range.min, range.max);
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}
