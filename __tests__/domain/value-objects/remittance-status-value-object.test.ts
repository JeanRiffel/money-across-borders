import { RemittanceStatus } from '../../../src/domain/remittance/value-objects/remittance-status-value-object'

describe('RemittanceStatus', () => {
  it('should describe each terminal status', () => {
    expect(RemittanceStatus.completed().getDescription()).toEqual('COMPLETED')
    expect(RemittanceStatus.rejectedCompliance().getDescription()).toEqual('REJECTED_COMPLIANCE')
    expect(RemittanceStatus.rejectedInsufficientFunds().getDescription()).toEqual('REJECTED_INSUFFICIENT_FUNDS')
    expect(RemittanceStatus.failed().getDescription()).toEqual('FAILED')
  })
})
