import { Currency } from '../../../domain/shared/value-objects/currency-value-object';
import { Money } from '../../../domain/shared/value-objects/money-value-object';
import { MockExchangeRateProvider } from '../../exchange/mock-exchange-rate-provider';
import { FlatPercentageFeeCalculator } from '../../pricing/flat-percentage-fee-calculator';
import { DeterministicRng } from '../rng/deterministic-rng';
import { SeedConfig } from '../config/seed-config';
import { SeedCustomer, SeedLedgerEntryRow, SeedRemittanceRow, SeedWalletRef } from '../types';
import { assertBalancedPerCurrency, LegDraft } from './ledger-math';
import { randomTimestampBetween } from './temporal-distribution';

// Mirrors UNVERIFIED_LIMIT_MINOR_UNITS in
// src/infra/compliance/in-memory-compliance-checker.ts — that constant isn't
// exported, so this is a deliberate, commented duplicate; keep both in sync
// if the real limit ever changes.
const UNVERIFIED_LIMIT_MINOR_UNITS = 100_000;

const MIN_REMITTANCE_AMOUNT_MINOR_UNITS = 100;
const SEND_FRACTION_RANGE: [number, number] = [0.01, 0.35];
// How much of a *destination* treasury wallet's remaining balance one
// cross-currency settlement leg may draw down — keeps a single seed run from
// exhausting a currency's treasury liquidity (see funding-generator.ts's
// equivalent FUNDING_SAFETY_FACTOR comment).
const TREASURY_LEG_SAFETY = 0.9;

const RemittanceStatusId = {
  COMPLETED: 1,
  REJECTED_COMPLIANCE: 2,
  REJECTED_INSUFFICIENT_FUNDS: 3,
  FAILED: 4,
} as const;

export interface RemittanceGenerationResult {
  remittances: SeedRemittanceRow[];
  ledgerEntries: SeedLedgerEntryRow[];
}

interface BuildContext {
  config: SeedConfig;
  rng: DeterministicRng;
  exchangeRateProvider: MockExchangeRateProvider;
  feeCalculator: FlatPercentageFeeCalculator;
  treasuryByCurrency: Map<string, SeedWalletRef>;
  now: Date;
}

/**
 * Generates remittances for every customer, sized by their activity profile
 * (AGENTS.md request section 3). COMPLETED remittances replay the exact leg
 * layout SendRemittanceUseCase posts (see that file) — same-currency
 * principal moves wallet-to-wallet with only the fee routed through
 * treasury; cross-currency principal routes both legs through treasury —
 * and mutate the in-memory wallet/treasury balances the same way
 * Wallet.credit()/.debit() would. The three statuses that use case never
 * actually persists (REJECTED_COMPLIANCE / REJECTED_INSUFFICIENT_FUNDS /
 * FAILED — it throws before building a Remittance at all, see
 * docs/seed.md's "Limitações" section) are inserted directly with no ledger
 * legs, exactly mirroring the fact that a real failed attempt today leaves
 * no accounting trace either.
 */
export async function generateRemittances(
  config: SeedConfig,
  rng: DeterministicRng,
  customers: readonly SeedCustomer[],
  walletsByAccountId: ReadonlyMap<string, SeedWalletRef[]>,
  treasuryByCurrency: Map<string, SeedWalletRef>,
  now: Date,
  excludeAccountIds: ReadonlySet<string> = new Set()
): Promise<RemittanceGenerationResult> {
  const context: BuildContext = {
    config,
    rng,
    exchangeRateProvider: new MockExchangeRateProvider(),
    feeCalculator: new FlatPercentageFeeCalculator(),
    treasuryByCurrency,
    now,
  };

  const remittances: SeedRemittanceRow[] = [];
  const ledgerEntries: SeedLedgerEntryRow[] = [];
  const eligibleSenders = customers.filter((c) => !excludeAccountIds.has(c.accountId));

  for (const sender of eligibleSenders) {
    const senderWallets = walletsByAccountId.get(sender.accountId) ?? [];
    if (senderWallets.length === 0) continue;

    const countRange = config.remittanceCountByProfile[sender.activityProfile];
    const count = rng.nextInt(countRange.min, countRange.max);

    for (let i = 0; i < count; i++) {
      const recipient = pickRecipient(rng, customers, sender.accountId);
      if (!recipient) continue;
      const recipientWallets = walletsByAccountId.get(recipient.accountId) ?? [];
      if (recipientWallets.length === 0) continue;

      const sourceWallet = rng.pick(senderWallets);
      const destinationWallet = pickDestinationWallet(rng, config, recipientWallets);
      if (!destinationWallet) continue;

      let status = rng.weightedPick(config.remittanceStatusDistribution);
      // A verified sender being rejected for compliance doesn't happen in
      // the real check (InMemoryComplianceChecker only rejects unverified
      // senders above the threshold) — fall back to completed rather than
      // emit a row that couldn't plausibly occur.
      if (status === 'rejected-compliance' && sender.kycVerified) {
        status = 'completed';
      }

      const built = await buildRemittance(
        context,
        status,
        sender,
        sourceWallet,
        recipient,
        destinationWallet
      );
      if (!built) continue;

      remittances.push(built.remittanceRow);
      ledgerEntries.push(...built.legRows);
    }
  }

  return { remittances, ledgerEntries };
}

async function buildRemittance(
  ctx: BuildContext,
  status: 'completed' | 'rejected-compliance' | 'rejected-insufficient-funds' | 'failed',
  sender: SeedCustomer,
  sourceWallet: SeedWalletRef,
  recipient: SeedCustomer,
  destinationWallet: SeedWalletRef
): Promise<{ remittanceRow: SeedRemittanceRow; legRows: SeedLedgerEntryRow[] } | null> {
  if (status === 'completed') {
    return buildCompletedRemittance(ctx, sender, sourceWallet, recipient, destinationWallet);
  }
  return buildSyntheticRemittance(ctx, status, sender, sourceWallet, recipient, destinationWallet);
}

async function buildCompletedRemittance(
  ctx: BuildContext,
  sender: SeedCustomer,
  sourceWallet: SeedWalletRef,
  recipient: SeedCustomer,
  destinationWallet: SeedWalletRef
): Promise<{ remittanceRow: SeedRemittanceRow; legRows: SeedLedgerEntryRow[] } | null> {
  const { rng, config } = ctx;

  let amount = Math.floor(sourceWallet.balance * rng.range(...SEND_FRACTION_RANGE));
  if (!sender.kycVerified) {
    amount = Math.min(amount, UNVERIFIED_LIMIT_MINOR_UNITS);
  }
  if (amount < MIN_REMITTANCE_AMOUNT_MINOR_UNITS) return null; // sender too low on funds this round

  const sourceCurrency = Currency.from(sourceWallet.currency);
  const fee = ctx.feeCalculator
    .calculate(Money.fromMinorUnits(amount, sourceCurrency))
    .getAmountMinorUnits();
  if (amount + fee > sourceWallet.balance) return null; // defensive; SEND_FRACTION_RANGE's max keeps this from happening

  const isSameCurrency = sourceWallet.currency === destinationWallet.currency;
  const treasurySource = requireTreasury(ctx, sourceWallet.currency);

  const legs: LegDraft[] = [];
  let convertedAmount = amount;
  let exchangeRateValue = 1;
  let treasuryDestination: SeedWalletRef | null = null;

  if (isSameCurrency) {
    legs.push(
      {
        walletId: sourceWallet.id,
        currency: sourceWallet.currency,
        direction: 1,
        amountMinorUnits: amount,
      },
      {
        walletId: destinationWallet.id,
        currency: sourceWallet.currency,
        direction: 2,
        amountMinorUnits: amount,
      },
      {
        walletId: sourceWallet.id,
        currency: sourceWallet.currency,
        direction: 1,
        amountMinorUnits: fee,
      },
      {
        walletId: treasurySource.id,
        currency: sourceWallet.currency,
        direction: 2,
        amountMinorUnits: fee,
      }
    );
  } else {
    treasuryDestination = requireTreasury(ctx, destinationWallet.currency);
    const destinationCurrency = Currency.from(destinationWallet.currency);
    const quote = await ctx.exchangeRateProvider.getRate(sourceCurrency, destinationCurrency);
    const jitteredRate = quote.getRate() * (1 + rng.range(-config.fxJitter, config.fxJitter));
    const exponentAdjustment =
      destinationCurrency.getMinorUnitExponent() - sourceCurrency.getMinorUnitExponent();
    convertedAmount = Math.round(amount * jitteredRate * 10 ** exponentAdjustment);
    exchangeRateValue = jitteredRate;

    const maxAffordable = Math.floor(treasuryDestination.balance * TREASURY_LEG_SAFETY);
    if (convertedAmount > maxAffordable) {
      if (maxAffordable <= 0) return null; // this currency's treasury pool is exhausted for now
      const scale = maxAffordable / convertedAmount;
      amount = Math.floor(amount * scale);
      if (amount < MIN_REMITTANCE_AMOUNT_MINOR_UNITS) return null;
      convertedAmount = Math.round(amount * jitteredRate * 10 ** exponentAdjustment);
    }

    legs.push(
      {
        walletId: sourceWallet.id,
        currency: sourceWallet.currency,
        direction: 1,
        amountMinorUnits: amount,
      },
      {
        walletId: treasurySource.id,
        currency: sourceWallet.currency,
        direction: 2,
        amountMinorUnits: amount,
      },
      {
        walletId: sourceWallet.id,
        currency: sourceWallet.currency,
        direction: 1,
        amountMinorUnits: fee,
      },
      {
        walletId: treasurySource.id,
        currency: sourceWallet.currency,
        direction: 2,
        amountMinorUnits: fee,
      },
      {
        walletId: treasuryDestination.id,
        currency: destinationWallet.currency,
        direction: 1,
        amountMinorUnits: convertedAmount,
      },
      {
        walletId: destinationWallet.id,
        currency: destinationWallet.currency,
        direction: 2,
        amountMinorUnits: convertedAmount,
      }
    );
  }

  assertBalancedPerCurrency(legs);

  const createdAt = randomTimestampBetween(
    rng,
    new Date(Math.max(sourceWallet.createdAt.getTime(), destinationWallet.createdAt.getTime())),
    ctx.now
  );
  const remittanceId = rng.uuid();
  const legRows = toLedgerRows(rng, legs, remittanceId, createdAt);

  // Apply exactly like Wallet.debit()/.credit() would.
  sourceWallet.balance -= amount + fee;
  destinationWallet.balance += convertedAmount;
  treasurySource.balance += isSameCurrency ? fee : amount + fee;
  if (treasuryDestination) treasuryDestination.balance -= convertedAmount;

  const remittanceRow: SeedRemittanceRow = {
    id: remittanceId,
    sender_account_id: sender.accountId,
    recipient_account_id: recipient.accountId,
    source_wallet_id: sourceWallet.id,
    destination_wallet_id: destinationWallet.id,
    source_amount_minor_units: amount,
    source_currency: sourceWallet.currency,
    fee_minor_units: fee,
    fee_currency: sourceWallet.currency,
    converted_amount_minor_units: convertedAmount,
    destination_currency: destinationWallet.currency,
    exchange_rate: exchangeRateValue,
    status_id: RemittanceStatusId.COMPLETED,
    created_at: createdAt,
  };

  return { remittanceRow, legRows };
}

/**
 * REJECTED_COMPLIANCE / REJECTED_INSUFFICIENT_FUNDS / FAILED — inserted
 * directly with NO ledger legs and NO wallet mutation, matching what
 * actually happens today when SendRemittanceUseCase throws before ever
 * calling LedgerService (see this file's top comment). Amounts are shaped
 * to plausibly justify the status (e.g. REJECTED_INSUFFICIENT_FUNDS always
 * exceeds the sender's real balance) purely for readability of the seeded
 * dataset — nothing here is asserted against LedgerService's invariant
 * because nothing here is a real posting.
 */
async function buildSyntheticRemittance(
  ctx: BuildContext,
  status: 'rejected-compliance' | 'rejected-insufficient-funds' | 'failed',
  sender: SeedCustomer,
  sourceWallet: SeedWalletRef,
  recipient: SeedCustomer,
  destinationWallet: SeedWalletRef
): Promise<{ remittanceRow: SeedRemittanceRow; legRows: SeedLedgerEntryRow[] }> {
  const { rng } = ctx;
  const sourceCurrency = Currency.from(sourceWallet.currency);

  let amount: number;
  let statusId: number;
  switch (status) {
    case 'rejected-compliance':
      amount = rng.nextInt(UNVERIFIED_LIMIT_MINOR_UNITS + 1, UNVERIFIED_LIMIT_MINOR_UNITS * 20);
      statusId = RemittanceStatusId.REJECTED_COMPLIANCE;
      break;
    case 'rejected-insufficient-funds':
      amount =
        Math.max(sourceWallet.balance, MIN_REMITTANCE_AMOUNT_MINOR_UNITS) +
        rng.nextInt(1_000, 100_000);
      statusId = RemittanceStatusId.REJECTED_INSUFFICIENT_FUNDS;
      break;
    case 'failed':
      amount = Math.max(
        MIN_REMITTANCE_AMOUNT_MINOR_UNITS,
        Math.floor((sourceWallet.balance || 100_000) * rng.range(...SEND_FRACTION_RANGE))
      );
      statusId = RemittanceStatusId.FAILED;
      break;
  }

  const fee = ctx.feeCalculator
    .calculate(Money.fromMinorUnits(amount, sourceCurrency))
    .getAmountMinorUnits();
  const isSameCurrency = sourceWallet.currency === destinationWallet.currency;
  let convertedAmount = amount;
  let exchangeRateValue = 1;
  if (!isSameCurrency) {
    const destinationCurrency = Currency.from(destinationWallet.currency);
    const quote = await ctx.exchangeRateProvider.getRate(sourceCurrency, destinationCurrency);
    exchangeRateValue = quote.getRate();
    convertedAmount = quote
      .convert(Money.fromMinorUnits(amount, sourceCurrency))
      .getAmountMinorUnits();
  }

  const createdAt = randomTimestampBetween(
    rng,
    new Date(Math.max(sourceWallet.createdAt.getTime(), destinationWallet.createdAt.getTime())),
    ctx.now
  );

  const remittanceRow: SeedRemittanceRow = {
    id: rng.uuid(),
    sender_account_id: sender.accountId,
    recipient_account_id: recipient.accountId,
    source_wallet_id: sourceWallet.id,
    destination_wallet_id: destinationWallet.id,
    source_amount_minor_units: amount,
    source_currency: sourceWallet.currency,
    fee_minor_units: fee,
    fee_currency: sourceWallet.currency,
    converted_amount_minor_units: convertedAmount,
    destination_currency: destinationWallet.currency,
    exchange_rate: exchangeRateValue,
    status_id: statusId,
    created_at: createdAt,
  };

  return { remittanceRow, legRows: [] };
}

function pickDestinationWallet(
  rng: DeterministicRng,
  config: SeedConfig,
  recipientWallets: readonly SeedWalletRef[]
): SeedWalletRef | null {
  if (recipientWallets.length === 0) return null;
  const preferredCurrency = rng.weightedPick(
    config.currencyDistribution.filter((e) => e.weight > 0)
  );
  return (
    recipientWallets.find((w) => w.currency === preferredCurrency) ?? rng.pick(recipientWallets)
  );
}

function pickRecipient(
  rng: DeterministicRng,
  customers: readonly SeedCustomer[],
  excludeAccountId: string
): SeedCustomer | null {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = customers[rng.nextInt(0, customers.length - 1)];
    if (candidate.accountId !== excludeAccountId) return candidate;
  }
  return null;
}

function requireTreasury(ctx: BuildContext, currency: string): SeedWalletRef {
  const treasury = ctx.treasuryByCurrency.get(currency);
  if (!treasury) {
    throw new Error(
      `No treasury wallet found for currency ${currency}. Run "npm run db:migrate" first.`
    );
  }
  return treasury;
}

function toLedgerRows(
  rng: DeterministicRng,
  legs: readonly LegDraft[],
  transactionId: string,
  createdAt: Date
): SeedLedgerEntryRow[] {
  return legs.map((leg) => ({
    id: rng.uuid(),
    wallet_id: leg.walletId,
    direction_id: leg.direction,
    amount_minor_units: leg.amountMinorUnits,
    currency: leg.currency,
    transaction_id: transactionId,
    description: describeLeg(leg, legs),
    created_at: createdAt,
  }));
}

// Mirrors SendRemittanceUseCase's leg descriptions exactly (see that file)
// so seeded ledger_entries read identically to ones the real use case would
// have produced.
function describeLeg(leg: LegDraft, legs: readonly LegDraft[]): string {
  const isSameCurrency = new Set(legs.map((l) => l.currency)).size === 1;
  const index = legs.indexOf(leg);
  if (isSameCurrency) {
    return [
      'remittance principal debit',
      'remittance principal credit',
      'remittance fee debit',
      'remittance fee revenue',
    ][index];
  }
  return [
    'remittance principal debit',
    'FX settlement (source leg)',
    'remittance fee debit',
    'remittance fee revenue',
    'FX settlement (destination leg)',
    'remittance principal credit',
  ][index];
}
