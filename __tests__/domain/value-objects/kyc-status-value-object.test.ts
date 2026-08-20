import { KycStatus } from '../../../src/domain/compliance/value-objects/kyc-status-value-object'

describe('KycStatus', () => {
  it('should describe PENDING/VERIFIED/REJECTED', () => {
    expect(KycStatus.pending().getDescription()).toEqual('PENDING')
    expect(KycStatus.verified().getDescription()).toEqual('VERIFIED')
    expect(KycStatus.rejected().getDescription()).toEqual('REJECTED')
  })

  it('should only report isVerified() true for VERIFIED', () => {
    expect(KycStatus.verified().isVerified()).toBe(true)
    expect(KycStatus.pending().isVerified()).toBe(false)
    expect(KycStatus.rejected().isVerified()).toBe(false)
  })
})
