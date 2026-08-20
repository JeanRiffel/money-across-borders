import { Remittance } from '../../../src/domain/remittance/entities/remittance'
import { RemittanceId } from '../../../src/domain/remittance/value-objects/remittance-id-value-object'
import { RemittanceStatus } from '../../../src/domain/remittance/value-objects/remittance-status-value-object'
import { AccountId } from '../../../src/domain/account/value-objects/account-id-value-object'
import { WalletId } from '../../../src/domain/wallet/value-objects/wallet-id-value-object'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { Money } from '../../../src/domain/shared/value-objects/money-value-object'

describe('Remittance', () => {
  it('should use its own id as the ledger transaction id', () => {
    const id = RemittanceId.generate()
    const usd = Currency.from('USD')
    const brl = Currency.from('BRL')

    const remittance = new Remittance(
      id,
      AccountId.generate(),
      AccountId.generate(),
      WalletId.generate(),
      WalletId.generate(),
      Money.fromMinorUnits(10000, usd),
      Money.fromMinorUnits(50, usd),
      Money.fromMinorUnits(52000, brl),
      5.2,
      RemittanceStatus.completed(),
      new Date()
    )

    expect(remittance.getTransactionId()).toEqual(id.getValue())
    expect(remittance.getStatus().getDescription()).toEqual('COMPLETED')
    expect(remittance.getExchangeRate()).toEqual(5.2)
  })
})
