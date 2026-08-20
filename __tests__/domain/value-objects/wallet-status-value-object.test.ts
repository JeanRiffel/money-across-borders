import { WalletStatus } from '../../../src/domain/wallet/value-objects/wallet-status-value-object'

describe('WalletStatus', () => {
  it('should describe ACTIVE and CLOSED', () => {
    expect(WalletStatus.active().getDescription()).toEqual('ACTIVE')
    expect(WalletStatus.closed().getDescription()).toEqual('CLOSED')
  })

  it('should describe an unknown id as UNKNOWN', () => {
    expect(new WalletStatus(99).getDescription()).toEqual('UNKNOWN')
  })
})
