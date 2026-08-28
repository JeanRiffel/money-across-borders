import { resolveSeedConfig } from '../../../../src/infra/seed/config/seed-config';

describe('resolveSeedConfig', () => {
  it('applies defaults when no overrides are given', () => {
    const config = resolveSeedConfig({});
    expect(config.seed).toBe(42);
    expect(config.customers).toBe(10_000);
    expect(config.scenario).toBe('normal');
  });

  it('applies explicit overrides on top of the defaults', () => {
    const config = resolveSeedConfig({ customers: 100, seed: 7 });
    expect(config.customers).toBe(100);
    expect(config.seed).toBe(7);
  });

  it('applies the high-contention scenario defaults', () => {
    const config = resolveSeedConfig({ scenario: 'high-contention' });
    expect(config.scenario).toBe('high-contention');
    expect(config.customers).toBe(500); // HIGH_CONTENTION_SCENARIO's own default
  });

  it('lets an explicit --customers override a scenario default', () => {
    const config = resolveSeedConfig({ scenario: 'high-contention', customers: 50 });
    expect(config.customers).toBe(50);
  });

  it('rejects an unknown scenario', () => {
    expect(() => resolveSeedConfig({ scenario: 'made-up' as never })).toThrow(/Unknown scenario/);
  });

  it('rejects a non-positive customer count', () => {
    expect(() => resolveSeedConfig({ customers: 0 })).toThrow(/--customers/);
    expect(() => resolveSeedConfig({ customers: -5 })).toThrow(/--customers/);
  });

  it('rejects a non-integer seed', () => {
    expect(() => resolveSeedConfig({ seed: 1.5 })).toThrow(/--seed/);
  });

  it('rejects a non-positive date range', () => {
    expect(() => resolveSeedConfig({ dateRangeDays: 0 })).toThrow(/--date-range-days/);
  });

  it('scales walletsPerCustomer toward walletsTarget without exceeding the active currency count', () => {
    const config = resolveSeedConfig({ customers: 100, walletsTarget: 100 });
    // ~1 wallet/customer on average, capped at [1, activeCurrencyCount]
    expect(config.walletsPerCustomer.min).toBeGreaterThanOrEqual(1);
    expect(config.walletsPerCustomer.max).toBeGreaterThanOrEqual(config.walletsPerCustomer.min);
  });

  it('scales remittanceCountByProfile toward remittancesTarget', () => {
    const base = resolveSeedConfig({ customers: 100 });
    const scaledDown = resolveSeedConfig({ customers: 100, remittancesTarget: 10 });

    const baseAvg =
      (base.remittanceCountByProfile.normal.min + base.remittanceCountByProfile.normal.max) / 2;
    const scaledAvg =
      (scaledDown.remittanceCountByProfile.normal.min +
        scaledDown.remittanceCountByProfile.normal.max) /
      2;

    expect(scaledAvg).toBeLessThan(baseAvg);
  });
});
