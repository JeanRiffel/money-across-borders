import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { AccountId } from '../../../domain/account/value-objects/account-id-value-object';
import { KycProfile } from '../../../domain/compliance/entities/kyc-profile';
import { KycProfileId } from '../../../domain/compliance/value-objects/kyc-profile-id-value-object';
import { KycStatus } from '../../../domain/compliance/value-objects/kyc-status-value-object';
import { KycProfileRepository } from '../../../domain/compliance/repository/kyc-profile-repository';
import { KycDossierRepository } from '../repositories/kyc-dossier-repository';
import { Clock } from '../../../domain/shared/clock';
import { SubmitKycInput } from '../dto/submit-kyc-input';
import { SubmitKycOutput } from '../dto/submit-kyc-output';

export class SubmitKycUseCase implements UseCase<SubmitKycInput, SubmitKycOutput> {
  constructor(
    private readonly kycProfileRepository: KycProfileRepository,
    private readonly kycDossierRepository: KycDossierRepository,
    private readonly clock: Clock
  ) {}

  async execute(input: SubmitKycInput): Promise<SubmitKycOutput> {
    const accountId = AccountId.from(input.accountId);
    const now = this.clock.now();

    // Reuse the existing profile's id/createdAt on a resubmission instead
    // of generating fresh ones — PostgresKycProfileRepository.save() upserts
    // by account_id (the schema's UNIQUE constraint) and never updates the
    // id column on conflict, so a freshly generated id here would silently
    // diverge from what's actually persisted on a second submission for the
    // same account.
    const existingProfile = await this.kycProfileRepository.findByAccountId(accountId);
    const kycProfileId = existingProfile ? existingProfile.getId() : KycProfileId.generate();
    const createdAt = existingProfile ? existingProfile.getCreatedAt() : now;

    // Mocked verification, same spirit as MockExchangeRateProvider /
    // InMemoryComplianceChecker elsewhere in this codebase: this MVP
    // auto-verifies every submission synchronously instead of calling a
    // real KYC provider. A real implementation would start PENDING and
    // move to VERIFIED/REJECTED asynchronously — plausibly through the same
    // event-driven shape as account.created/remittance.completed (submit →
    // publish an event → a provider webhook or async worker updates the
    // status later), not a direct synchronous flip like this.
    const kycProfile = new KycProfile(
      kycProfileId,
      accountId,
      KycStatus.verified(),
      input.fullName,
      input.documentId,
      now,
      createdAt
    );

    // Postgres first: this is the record ComplianceChecker actually reads
    // (see InMemoryComplianceChecker.check()), so it has to land before
    // anything else — its success is what this use case's contract
    // promises the caller.
    await this.kycProfileRepository.save(kycProfile);

    // The dossier — everything actually submitted (document type,
    // attachments, free-form notes) — goes to Mongo, not Postgres: it's
    // supporting material nothing in the domain reads back. See
    // KycDossierRepository's "never throws" contract.
    await this.kycDossierRepository.save({
      kycProfileId: kycProfile.getId().getValue(),
      accountId: input.accountId,
      fullName: input.fullName,
      documentId: input.documentId,
      documentType: input.documentType,
      attachments: input.attachments ?? [],
      notes: input.notes,
      submittedAt: now.toISOString(),
    });

    return SubmitKycOutput.from(kycProfile);
  }
}
