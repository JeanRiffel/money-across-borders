import { SeedConfig } from '../seed-config';

/**
 * The default scenario: DEFAULT_SEED_CONFIG's distributions, unmodified.
 * Kept as an explicit (empty) override object — rather than special-casing
 * "normal" in resolveSeedConfig — so both scenarios are selected the same
 * way and a third scenario is a one-file addition (see docs/seed.md).
 */
export const NORMAL_SCENARIO: Partial<SeedConfig> = {};
