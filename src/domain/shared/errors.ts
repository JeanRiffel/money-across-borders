export class CurrencyMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`Currency mismatch: expected ${expected}, got ${actual}`)
    this.name = 'CurrencyMismatchError'
  }
}

export class InsufficientFundsError extends Error {
  constructor(walletId: string) {
    super(`Wallet ${walletId} does not have sufficient funds for this operation`)
    this.name = 'InsufficientFundsError'
  }
}

export class UnbalancedLedgerError extends Error {
  constructor(details: string) {
    super(`Ledger entries do not balance: ${details}`)
    this.name = 'UnbalancedLedgerError'
  }
}

export class UnsupportedCurrencyError extends Error {
  constructor(code: string) {
    super(`Currency ${code} is not supported`)
    this.name = 'UnsupportedCurrencyError'
  }
}

export class WalletNotFoundError extends Error {
  constructor(walletId: string) {
    super(`Wallet ${walletId} was not found`)
    this.name = 'WalletNotFoundError'
  }
}

export class WalletAlreadyExistsError extends Error {
  constructor(accountId: string, currency: string) {
    super(`Account ${accountId} already has a wallet in ${currency}`)
    this.name = 'WalletAlreadyExistsError'
  }
}

export class RecipientWalletNotFoundError extends Error {
  constructor(accountId: string, currency: string) {
    super(`Recipient ${accountId} has no wallet in ${currency}`)
    this.name = 'RecipientWalletNotFoundError'
  }
}

export class ComplianceRejectedError extends Error {
  constructor(reason: string) {
    super(`Compliance check rejected: ${reason}`)
    this.name = 'ComplianceRejectedError'
  }
}

export class ExchangeRateNotAvailableError extends Error {
  constructor(base: string, quote: string) {
    super(`No exchange rate available for ${base}/${quote}`)
    this.name = 'ExchangeRateNotAvailableError'
  }
}
