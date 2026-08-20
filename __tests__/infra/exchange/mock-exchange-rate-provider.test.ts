import { MockExchangeRateProvider } from '../../../src/infra/exchange/mock-exchange-rate-provider'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'

describe('MockExchangeRateProvider', () => {
  const provider = new MockExchangeRateProvider()

  it('should quote a rate between two supported currencies', async () => {
    const rate = await provider.getRate(Currency.from('USD'), Currency.from('BRL'))

    expect(rate.getBaseCurrency().getCode()).toEqual('USD')
    expect(rate.getQuoteCurrency().getCode()).toEqual('BRL')
    expect(rate.getRate()).toEqual(5.2)
  })

  it('should be internally consistent for the inverse pair', async () => {
    const usdToEur = await provider.getRate(Currency.from('USD'), Currency.from('EUR'))
    const eurToUsd = await provider.getRate(Currency.from('EUR'), Currency.from('USD'))

    expect(usdToEur.getRate() * eurToUsd.getRate()).toBeCloseTo(1, 6)
  })
})
