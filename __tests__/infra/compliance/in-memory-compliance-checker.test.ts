import { InMemoryComplianceChecker } from '../../../src/infra/compliance/in-memory-compliance-checker'
import { InMemoryKycProfileRepository } from '../../../src/infra/persistence/in-memory/in-memory-kyc-profile-repository'
import { KycProfile } from '../../../src/domain/compliance/entities/kyc-profile'
import { KycProfileId } from '../../../src/domain/compliance/value-objects/kyc-profile-id-value-object'
import { KycStatus } from '../../../src/domain/compliance/value-objects/kyc-status-value-object'
import { AccountId } from '../../../src/domain/account/value-objects/account-id-value-object'
import { Currency } from '../../../src/domain/shared/value-objects/currency-value-object'
import { Money } from '../../../src/domain/shared/value-objects/money-value-object'

const usd = Currency.from('USD')

describe('InMemoryComplianceChecker', () => {
  it('should approve an unverified sender under the threshold', async () => {
    const checker = new InMemoryComplianceChecker(new InMemoryKycProfileRepository())
    const result = await checker.check({ accountId: AccountId.generate(), amount: Money.fromMinorUnits(50_000, usd) })
    expect(result.approved).toBe(true)
  })

  it('should reject an unverified sender above the threshold', async () => {
    const checker = new InMemoryComplianceChecker(new InMemoryKycProfileRepository())
    const result = await checker.check({ accountId: AccountId.generate(), amount: Money.fromMinorUnits(200_000, usd) })
    expect(result.approved).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('should approve a verified sender above the threshold', async () => {
    const kycProfileRepository = new InMemoryKycProfileRepository()
    const accountId = AccountId.generate()
    await kycProfileRepository.save(new KycProfile(
      KycProfileId.generate(),
      accountId,
      KycStatus.verified(),
      'Jane Doe',
      'DOC-123',
      new Date(),
      new Date()
    ))

    const checker = new InMemoryComplianceChecker(kycProfileRepository)
    const result = await checker.check({ accountId, amount: Money.fromMinorUnits(200_000, usd) })
    expect(result.approved).toBe(true)
  })
})
