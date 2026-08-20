import { UnsupportedCurrencyError } from '../errors'

// Minor-unit exponent per ISO 4217 code (how many decimal places the currency's
// minor unit represents, e.g. cents for USD). Kept small and hardcoded for this
// showcase — a real system would source this from a currency registry/table.
const SUPPORTED_CURRENCIES: Record<string, number> = {
  USD: 2,
  BRL: 2,
  EUR: 2,
  GBP: 2,
}

export class Currency {

  private constructor(
    private readonly code: string,
    private readonly minorUnitExponent: number
  ) {}

  static supportedCodes(): string[] {
    return Object.keys(SUPPORTED_CURRENCIES)
  }

  static from(code: string): Currency {
    const normalized = code.toUpperCase()
    const exponent = SUPPORTED_CURRENCIES[normalized]
    if (exponent === undefined) {
      throw new UnsupportedCurrencyError(code)
    }
    return new Currency(normalized, exponent)
  }

  getCode(): string {
    return this.code
  }

  getMinorUnitExponent(): number {
    return this.minorUnitExponent
  }

  equals(other: Currency): boolean {
    return this.code === other.code
  }

  toString(): string {
    return this.code
  }

}
