import { SubmitKycUseCase } from '../../../../src/application/compliance/uses-cases/submit-kyc-use-case'
import { SubmitKycInput } from '../../../../src/application/compliance/dto/submit-kyc-input'
import { InMemoryKycProfileRepository } from '../../../../src/infra/persistence/in-memory/in-memory-kyc-profile-repository'
import { InMemoryKycDossierRepository } from '../../../../src/infra/persistence/in-memory/in-memory-kyc-dossier-repository'
import { SystemClock } from '../../../../src/infra/time/system-clock'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'

function buildScenario() {
  const kycProfileRepository = new InMemoryKycProfileRepository()
  const kycDossierRepository = new InMemoryKycDossierRepository()
  const useCase = new SubmitKycUseCase(kycProfileRepository, kycDossierRepository, new SystemClock())
  return { kycProfileRepository, kycDossierRepository, useCase }
}

describe('SubmitKycUseCase', () => {
  it('creates a VERIFIED KycProfile and archives the dossier', async () => {
    const { kycProfileRepository, kycDossierRepository, useCase } = buildScenario()
    const accountId = AccountId.generate().getValue()

    const output = await useCase.execute(SubmitKycInput.from({
      accountId,
      fullName: 'Jane Doe',
      documentId: 'PASSPORT-123',
      documentType: 'PASSPORT',
      attachments: [{ label: 'passport-photo', reference: 's3://bucket/passport.jpg' }],
      notes: 'Submitted via mobile app',
    }))

    expect(output.status).toEqual('VERIFIED')
    expect(output.accountId).toEqual(accountId)
    expect(output.verifiedAt).not.toBeNull()

    const savedProfile = await kycProfileRepository.findByAccountId(AccountId.from(accountId))
    expect(savedProfile).not.toBeNull()
    expect(savedProfile!.getStatus().isVerified()).toBe(true)

    const dossiers = kycDossierRepository.getSavedDossiers()
    expect(dossiers).toHaveLength(1)
    expect(dossiers[0]).toMatchObject({
      kycProfileId: output.kycProfileId,
      accountId,
      fullName: 'Jane Doe',
      documentId: 'PASSPORT-123',
      documentType: 'PASSPORT',
      notes: 'Submitted via mobile app',
    })
    expect(dossiers[0].attachments).toHaveLength(1)
  })

  it('reuses the same profile id and original createdAt on a resubmission', async () => {
    const { kycProfileRepository, kycDossierRepository, useCase } = buildScenario()
    const accountId = AccountId.generate().getValue()

    const firstOutput = await useCase.execute(SubmitKycInput.from({
      accountId,
      fullName: 'Jane Doe',
      documentId: 'PASSPORT-123',
    }))

    const secondOutput = await useCase.execute(SubmitKycInput.from({
      accountId,
      fullName: 'Jane Doe',
      documentId: 'PASSPORT-456', // e.g. renewed document
    }))

    expect(secondOutput.kycProfileId).toEqual(firstOutput.kycProfileId)
    expect(secondOutput.createdAt).toEqual(firstOutput.createdAt)

    // Still only one profile per account — the second save() upserts.
    const allProfiles = await kycProfileRepository.findByAccountId(AccountId.from(accountId))
    expect(allProfiles!.getDocumentId()).toEqual('PASSPORT-456')

    // The dossier is upserted by kycProfileId (see
    // MongoKycDossierRepository's comment) — one current dossier per
    // profile, mirroring KycProfile's own one-per-account semantics, not a
    // full submission history.
    expect(kycDossierRepository.getSavedDossiers()).toHaveLength(1)
    expect(kycDossierRepository.getSavedDossiers()[0].documentId).toEqual('PASSPORT-456')
  })
})
