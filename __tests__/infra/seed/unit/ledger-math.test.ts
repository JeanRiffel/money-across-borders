import { assertBalancedPerCurrency } from '../../../../src/infra/seed/generators/ledger-math';

describe('assertBalancedPerCurrency', () => {
  it('does not throw when every currency nets to zero', () => {
    expect(() =>
      assertBalancedPerCurrency([
        { walletId: 'a', currency: 'BRL', direction: 1, amountMinorUnits: 1000 },
        { walletId: 'b', currency: 'BRL', direction: 2, amountMinorUnits: 1000 },
      ])
    ).not.toThrow();
  });

  it('does not throw for a balanced multi-currency posting (cross-currency remittance shape)', () => {
    expect(() =>
      assertBalancedPerCurrency([
        { walletId: 'source', currency: 'BRL', direction: 1, amountMinorUnits: 1000 },
        { walletId: 'treasury-brl', currency: 'BRL', direction: 2, amountMinorUnits: 1000 },
        { walletId: 'treasury-usd', currency: 'USD', direction: 1, amountMinorUnits: 190 },
        { walletId: 'dest', currency: 'USD', direction: 2, amountMinorUnits: 190 },
      ])
    ).not.toThrow();
  });

  it('throws when a currency does not net to zero', () => {
    expect(() =>
      assertBalancedPerCurrency([
        { walletId: 'a', currency: 'BRL', direction: 1, amountMinorUnits: 1000 },
        { walletId: 'b', currency: 'BRL', direction: 2, amountMinorUnits: 999 },
      ])
    ).toThrow(/unbalanced/i);
  });

  it('throws when one currency in a multi-currency posting is unbalanced even if others are fine', () => {
    expect(() =>
      assertBalancedPerCurrency([
        { walletId: 'a', currency: 'BRL', direction: 1, amountMinorUnits: 1000 },
        { walletId: 'b', currency: 'BRL', direction: 2, amountMinorUnits: 1000 },
        { walletId: 'c', currency: 'USD', direction: 1, amountMinorUnits: 500 },
        { walletId: 'd', currency: 'USD', direction: 2, amountMinorUnits: 400 },
      ])
    ).toThrow(/USD/);
  });
});
