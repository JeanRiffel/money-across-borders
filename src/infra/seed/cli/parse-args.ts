import { ScenarioName, SeedConfigOverrides } from '../config/seed-config';

export const SEED_HELP_TEXT = `
Usage: npm run seed -- [options]

Options:
  --customers <n>         Number of customers to generate (default: 10000, or the
                           scenario's own default if --scenario is set)
  --wallets <n>           Approximate total wallet count — scales the configured
                           wallets-per-customer range proportionally (see docs/seed.md;
                           wallet count is still derived from RNG draws, not pinned exactly)
  --remittances <n>       Approximate total remittance count — scales the configured
                           per-activity-profile ranges proportionally (same caveat as --wallets)
  --seed <n>              Integer PRNG seed; same seed + same options → same
                           dataset on a clean database (default: 42)
  --scenario <name>       "normal" (default) or "high-contention"
  --date-range-days <n>   How many days back remittances/signups may be dated
                           from "now" (default: 90)
  --reset                 Truncate business tables before seeding (users,
                           accounts, wallets, kyc_profiles, remittances,
                           ledger_entries, idempotency_records) and re-seed the
                           treasury account. Refuses to run when NODE_ENV=production.
  --help                  Show this message

Examples:
  npm run seed -- --customers 100 --seed 42
  npm run seed -- --customers 10000 --seed 42
  npm run seed -- --customers 1000 --scenario high-contention --seed 42
`;

const SCENARIOS: ScenarioName[] = ['normal', 'high-contention'];

/** Minimal, dependency-free argv parser — the option surface is small and fixed. */
export function parseSeedArgs(argv: readonly string[]): SeedConfigOverrides {
  const overrides: SeedConfigOverrides = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        // eslint-disable-next-line no-console -- CLI --help output, not app logging
        console.log(SEED_HELP_TEXT);
        process.exit(0);
        break;
      case '--reset':
        overrides.reset = true;
        break;
      case '--customers':
        overrides.customers = parsePositiveInt('--customers', argv[++i]);
        break;
      case '--wallets':
        overrides.walletsTarget = parsePositiveInt('--wallets', argv[++i]);
        break;
      case '--remittances':
        overrides.remittancesTarget = parsePositiveInt('--remittances', argv[++i]);
        break;
      case '--seed':
        overrides.seed = parseInt10('--seed', argv[++i]);
        break;
      case '--date-range-days':
        overrides.dateRangeDays = parsePositiveInt('--date-range-days', argv[++i]);
        break;
      case '--scenario': {
        const value = argv[++i];
        if (!SCENARIOS.includes(value as ScenarioName)) {
          throw new Error(`--scenario must be one of: ${SCENARIOS.join(', ')} (got "${value}")`);
        }
        overrides.scenario = value as ScenarioName;
        break;
      }
      default:
        throw new Error(`Unknown option "${arg}". Run with --help to see supported options.`);
    }
  }

  return overrides;
}

function parseInt10(flag: string, raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${flag} requires a numeric value`);
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`${flag} requires a numeric value, got "${raw}"`);
  }
  return value;
}

function parsePositiveInt(flag: string, raw: string | undefined): number {
  const value = parseInt10(flag, raw);
  if (value <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
}
