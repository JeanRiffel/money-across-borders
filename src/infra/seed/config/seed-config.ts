/**
 * Every tunable of the seed pipeline lives here — no magic numbers scattered
 * across generators (see docs/seed.md's "Configuração" section, mirroring
 * AGENTS.md request section 13). `resolveSeedConfig` merges, in order:
 * DEFAULT_SEED_CONFIG → the chosen scenario's overrides → explicit CLI flags.
 */
import { Currency } from '../../../domain/shared/value-objects/currency-value-object';
import { NORMAL_SCENARIO } from './scenarios/normal';
import { HIGH_CONTENTION_SCENARIO } from './scenarios/high-contention';

export type ScenarioName = 'normal' | 'high-contention';

export interface WeightedEntry<T extends string> {
  value: T;
  weight: number;
}

export interface BalanceTierRange {
  min: number;
  max: number;
}

export interface SeedConfig {
  /** PRNG seed — the whole pipeline is a pure function of (seed, config). */
  seed: number;
  scenario: ScenarioName;
  /** Number of customers (1 User + 1 Account each). */
  customers: number;
  /** How many days back remittances/signups may be dated from "now". */
  dateRangeDays: number;
  /** Truncate business tables (never touches treasury's fixed row) before seeding. */
  reset: boolean;

  kycDistribution: readonly WeightedEntry<'verified' | 'pending' | 'rejected'>[];
  activityDistribution: readonly WeightedEntry<'heavy' | 'normal' | 'low'>[];
  currencyDistribution: readonly WeightedEntry<string>[];
  remittanceStatusDistribution: readonly WeightedEntry<
    'completed' | 'rejected-compliance' | 'rejected-insufficient-funds' | 'failed'
  >[];

  walletsPerCustomer: { min: number; max: number };
  /** Range of remittances *sent* per customer over dateRangeDays, by activity profile. */
  remittanceCountByProfile: Record<'heavy' | 'normal' | 'low', { min: number; max: number }>;

  balanceTierDistribution: readonly WeightedEntry<'zero' | 'low' | 'medium' | 'high'>[];
  /** In minor units, applied per-currency (all currently-supported currencies share 2 decimals). */
  balanceTierRanges: Record<'low' | 'medium' | 'high', BalanceTierRange>;

  /** Relative jitter applied on top of MockExchangeRateProvider's quoted rate, e.g. 0.005 = ±0.5%. */
  fxJitter: number;

  /** Fraction of otherwise-COMPLETED remittances also mirrored into idempotency_records (see docs/seed.md §10). */
  idempotencyDemoRatio: number;

  // --- high-contention-only knobs (ignored by the "normal" scenario) ---
  contentionSharedAccounts: number;
  contentionIntents: number;
  contentionAmountRange: BalanceTierRange;
}

export const DEFAULT_SEED_CONFIG: SeedConfig = {
  seed: 42,
  scenario: 'normal',
  customers: 10_000,
  dateRangeDays: 90,
  reset: false,

  kycDistribution: [
    { value: 'verified', weight: 0.8 },
    { value: 'pending', weight: 0.1 },
    { value: 'rejected', weight: 0.1 },
  ],
  activityDistribution: [
    { value: 'heavy', weight: 0.05 },
    { value: 'normal', weight: 0.7 },
    { value: 'low', weight: 0.25 },
  ],
  // Prioritizes BRL/USD/EUR per AGENTS.md's domain shape; GBP is a supported
  // currency (Currency.supportedCodes(), and treasury already funds it — see
  // migrations/002_seed_treasury_wallets.sql) but stays at weight 0 by
  // default rather than being force-included in the "priority three".
  currencyDistribution: [
    { value: 'BRL', weight: 0.55 },
    { value: 'USD', weight: 0.3 },
    { value: 'EUR', weight: 0.15 },
    { value: 'GBP', weight: 0 },
  ],
  // REJECTED_COMPLIANCE / REJECTED_INSUFFICIENT_FUNDS / FAILED are never
  // actually persisted by SendRemittanceUseCase today (it throws before
  // building a Remittance — see docs/seed.md's "Limitações" section); these
  // three are inserted directly as documented synthetic rows, kept small
  // since most real traffic succeeds.
  remittanceStatusDistribution: [
    { value: 'completed', weight: 0.92 },
    { value: 'rejected-compliance', weight: 0.03 },
    { value: 'rejected-insufficient-funds', weight: 0.03 },
    { value: 'failed', weight: 0.02 },
  ],

  walletsPerCustomer: { min: 1, max: 3 },
  remittanceCountByProfile: {
    heavy: { min: 40, max: 150 },
    normal: { min: 3, max: 15 },
    low: { min: 0, max: 2 },
  },

  balanceTierDistribution: [
    { value: 'zero', weight: 0.1 },
    { value: 'low', weight: 0.4 },
    { value: 'medium', weight: 0.35 },
    { value: 'high', weight: 0.15 },
  ],
  balanceTierRanges: {
    low: { min: 1_000, max: 50_000 }, // ~10 – 500 in major units
    medium: { min: 50_000, max: 2_000_000 }, // ~500 – 20,000
    high: { min: 2_000_000, max: 50_000_000 }, // ~20,000 – 500,000
  },

  fxJitter: 0.005,
  idempotencyDemoRatio: 0.01,

  contentionSharedAccounts: 10,
  contentionIntents: 2_000,
  contentionAmountRange: { min: 1_000, max: 20_000 },
};

const SCENARIOS: Record<ScenarioName, Partial<SeedConfig>> = {
  normal: NORMAL_SCENARIO,
  'high-contention': HIGH_CONTENTION_SCENARIO,
};

/** CLI-facing overrides — see cli/parse-args.ts for how these are populated. */
export interface SeedConfigOverrides extends Partial<
  Pick<SeedConfig, 'seed' | 'customers' | 'dateRangeDays' | 'reset' | 'scenario'>
> {
  /**
   * Approximate total wallet/remittance counts (AGENTS.md request section
   * 13 explicitly asks for these as top-level dials). Both are otherwise
   * *derived* — wallet count from walletsPerCustomer × currencyDistribution,
   * remittance count from remittanceCountByProfile × activityDistribution —
   * so setting either here scales those underlying ranges proportionally
   * rather than pinning an exact number: the actual row count still depends
   * on the same RNG draws as everything else in this pipeline.
   */
  walletsTarget?: number;
  remittancesTarget?: number;
}

export function resolveSeedConfig(overrides: SeedConfigOverrides): SeedConfig {
  const scenario = overrides.scenario ?? DEFAULT_SEED_CONFIG.scenario;
  const scenarioOverrides = SCENARIOS[scenario];
  if (!scenarioOverrides) {
    throw new Error(
      `Unknown scenario "${scenario}". Supported: ${Object.keys(SCENARIOS).join(', ')}`
    );
  }

  const { walletsTarget, remittancesTarget, ...directOverrides } = overrides;

  let config: SeedConfig = {
    ...DEFAULT_SEED_CONFIG,
    ...scenarioOverrides,
    ...directOverrides,
    scenario,
  };

  if (walletsTarget !== undefined) {
    config = { ...config, walletsPerCustomer: scaleWalletsTarget(config, walletsTarget) };
  }
  if (remittancesTarget !== undefined) {
    config = {
      ...config,
      remittanceCountByProfile: scaleRemittancesTarget(config, remittancesTarget),
    };
  }

  validateConfig(config);
  return config;
}

function scaleWalletsTarget(
  config: SeedConfig,
  walletsTarget: number
): SeedConfig['walletsPerCustomer'] {
  const activeCurrencyCount = config.currencyDistribution.filter((e) => e.weight > 0).length;
  const currentAvg = (config.walletsPerCustomer.min + config.walletsPerCustomer.max) / 2;
  const currentExpected = config.customers * currentAvg;
  const scale = currentExpected > 0 ? walletsTarget / currentExpected : 1;

  const min = clamp(Math.round(config.walletsPerCustomer.min * scale), 1, activeCurrencyCount);
  const max = clamp(Math.round(config.walletsPerCustomer.max * scale), min, activeCurrencyCount);
  return { min, max };
}

function scaleRemittancesTarget(
  config: SeedConfig,
  remittancesTarget: number
): SeedConfig['remittanceCountByProfile'] {
  const weightByProfile = new Map(config.activityDistribution.map((e) => [e.value, e.weight]));
  const totalWeight = config.activityDistribution.reduce((sum, e) => sum + e.weight, 0) || 1;

  let currentExpected = 0;
  for (const [profile, range] of Object.entries(config.remittanceCountByProfile) as [
    'heavy' | 'normal' | 'low',
    BalanceTierRange,
  ][]) {
    const share = (weightByProfile.get(profile) ?? 0) / totalWeight;
    currentExpected += config.customers * share * ((range.min + range.max) / 2);
  }
  const scale = currentExpected > 0 ? remittancesTarget / currentExpected : 1;

  const scaled = {} as SeedConfig['remittanceCountByProfile'];
  for (const [profile, range] of Object.entries(config.remittanceCountByProfile) as [
    'heavy' | 'normal' | 'low',
    BalanceTierRange,
  ][]) {
    const min = Math.max(0, Math.round(range.min * scale));
    const max = Math.max(min, Math.round(range.max * scale));
    scaled[profile] = { min, max };
  }
  return scaled;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function validateConfig(config: SeedConfig): void {
  if (!Number.isInteger(config.seed)) {
    throw new Error('--seed must be an integer');
  }
  if (!Number.isInteger(config.customers) || config.customers <= 0) {
    throw new Error('--customers must be a positive integer');
  }
  if (!Number.isInteger(config.dateRangeDays) || config.dateRangeDays <= 0) {
    throw new Error('--date-range-days must be a positive integer');
  }

  const supported = new Set(Currency.supportedCodes());
  for (const entry of config.currencyDistribution) {
    if (!supported.has(entry.value)) {
      throw new Error(
        `currencyDistribution references unsupported currency "${entry.value}" — ` +
          `supported: ${[...supported].join(', ')}`
      );
    }
  }
  if (config.currencyDistribution.every((entry) => entry.weight <= 0)) {
    throw new Error('currencyDistribution must have at least one currency with weight > 0');
  }
}
