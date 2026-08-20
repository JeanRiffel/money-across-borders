import { KycProfile } from '../../../src/domain/compliance/entities/kyc-profile'
import { KycProfileId } from '../../../src/domain/compliance/value-objects/kyc-profile-id-value-object'
import { KycStatus } from '../../../src/domain/compliance/value-objects/kyc-status-value-object'
import { AccountId } from '../../../src/domain/account/value-objects/account-id-value-object'

describe('KycProfile', () => {
  it('should carry profile data', () => {
    const accountId = AccountId.generate()
    const createdAt = new Date()

    const profile = new KycProfile(
      KycProfileId.generate(),
      accountId,
      KycStatus.verified(),
      'Jane Doe',
      'DOC-123',
      createdAt,
      createdAt
    )

    expect(profile.getAccountId().equals(accountId)).toBe(true)
    expect(profile.getStatus().isVerified()).toBe(true)
    expect(profile.getFullName()).toEqual('Jane Doe')
    expect(profile.getDocumentId()).toEqual('DOC-123')
    expect(profile.getVerifiedAt()).toEqual(createdAt)
  })
})
