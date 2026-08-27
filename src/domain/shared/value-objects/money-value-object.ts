import { Currency } from './currency-value-object';
import { CurrencyMismatchError } from '../errors';

/**
 * Money is always stored as an integer amount of minor units (e.g. cents for
 * USD/BRL/EUR/GBP) — never as a float. This avoids the classic floating-point
 * rounding errors that are unacceptable in a ledger. Direction (debit/credit)
 * is expressed separately by callers (see EntryDirection) — Money itself is
 * always non-negative.
 */
export class Money {
  private constructor(
    private readonly amountMinorUnits: number,
    private readonly currency: Currency
  ) {}

  static fromMinorUnits(amountMinorUnits: number, currency: Currency): Money {
    if (!Number.isInteger(amountMinorUnits)) {
      throw new Error('Money amount must be an integer number of minor units');
    }
    if (amountMinorUnits < 0) {
      throw new Error('Money amount cannot be negative');
    }
    return new Money(amountMinorUnits, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  getAmountMinorUnits(): number {
    return this.amountMinorUnits;
  }

  getCurrency(): Currency {
    return this.currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinorUnits + other.amountMinorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this.amountMinorUnits - other.amountMinorUnits;
    if (result < 0) {
      throw new Error('Resulting money amount cannot be negative');
    }
    return new Money(result, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amountMinorUnits * factor), this.currency);
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinorUnits >= other.amountMinorUnits;
  }

  isZero(): boolean {
    return this.amountMinorUnits === 0;
  }

  equals(other: Money): boolean {
    return this.currency.equals(other.currency) && this.amountMinorUnits === other.amountMinorUnits;
  }

  toString(): string {
    const exponent = this.currency.getMinorUnitExponent();
    const major = this.amountMinorUnits / 10 ** exponent;
    return `${major.toFixed(exponent)} ${this.currency.getCode()}`;
  }

  private assertSameCurrency(other: Money): void {
    if (!this.currency.equals(other.currency)) {
      throw new CurrencyMismatchError(this.currency.getCode(), other.currency.getCode());
    }
  }
}
