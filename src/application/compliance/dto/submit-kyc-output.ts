import { KycProfile } from '../../../domain/compliance/entities/kyc-profile';

export class SubmitKycOutput {
  constructor(
    public readonly kycProfileId: string,
    public readonly accountId: string,
    public readonly status: string,
    public readonly verifiedAt: string | null,
    public readonly createdAt: string
  ) {}

  static from(profile: KycProfile): SubmitKycOutput {
    return new SubmitKycOutput(
      profile.getId().getValue(),
      profile.getAccountId().getValue(),
      profile.getStatus().getDescription(),
      profile.getVerifiedAt()?.toISOString() ?? null,
      profile.getCreatedAt().toISOString()
    );
  }
}
