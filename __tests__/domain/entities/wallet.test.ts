import { Wallet } from '../../../src/domain/wallet/entities/wallet'
import { WalletId } from '../../../src/domain/wallet/value-objects/wallet-id-value-object'
import { WalletStatus } from '../../../src/domain/wallet/value-objects/wallet-status-value-object'
import { AccountId } from '../../../src/domain/account/value-objects/account-id-value-object'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { Money } from '../../../src/domain/shared/value-objects/money-value-object'
import { CurrencyMismatchError, InsufficientFundsError } from '../../../src/domain/shared/errors'

describe('Wallet', () => {
  const usd = Currency.from('USD')
  const brl = Currency.from('BRL')

  function buildWallet(balanceMinorUnits: number): Wallet {
    return new Wallet(
      WalletId.generate(),
      AccountId.generate(),
      usd,
      Money.fromMinorUnits(balanceMinorUnits, usd),
      WalletStatus.active(),
      new Date()
    )
  }

  it('should credit without mutating the original instance', () => {
    const wallet = buildWallet(1000)
    const credited = wallet.credit(Money.fromMinorUnits(500, usd))

    expect(wallet.getBalance().getAmountMinorUnits()).toEqual(1000)
    expect(credited.getBalance().getAmountMinorUnits()).toEqual(1500)
  })

  it('should debit without mutating the original instance', () => {
    const wallet = buildWallet(1000)
    const debited = wallet.debit(Money.fromMinorUnits(300, usd))

    expect(wallet.getBalance().getAmountMinorUnits()).toEqual(1000)
    expect(debited.getBalance().getAmountMinorUnits()).toEqual(700)
  })

  it('should reject a debit larger than the current balance', () => {
    const wallet = buildWallet(500)
    expect(() => wallet.debit(Money.fromMinorUnits(600, usd))).toThrow(InsufficientFundsError)
  })

  it('should allow a debit exactly equal to the balance, leaving zero', () => {
    const wallet = buildWallet(500)
    const debited = wallet.debit(Money.fromMinorUnits(500, usd))

    expect(debited.getBalance().getAmountMinorUnits()).toEqual(0)
  })

  it('should reject credit/debit in a different currency', () => {
    const wallet = buildWallet(1000)
    expect(() => wallet.credit(Money.fromMinorUnits(100, brl))).toThrow(CurrencyMismatchError)
    expect(() => wallet.debit(Money.fromMinorUnits(100, brl))).toThrow(CurrencyMismatchError)
  })
})
