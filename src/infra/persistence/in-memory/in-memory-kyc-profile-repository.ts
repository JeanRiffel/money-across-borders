import { KycProfile } from '../../../domain/compliance/entities/kyc-profile';
import { KycProfileRepository } from '../../../domain/compliance/repository/kyc-profile-repository';
import { AccountId } from '../../../domain/account/value-objects/account-id-value-object';

export class InMemoryKycProfileRepository implements KycProfileRepository {
  private profiles: KycProfile[] = [];

  async save(profile: KycProfile): Promise<void> {
    const index = this.profiles.findIndex((p) => p.getAccountId().equals(profile.getAccountId()));
    if (index === -1) {
      this.profiles.push(profile);
    } else {
      this.profiles[index] = profile;
    }
  }

  async findByAccountId(accountId: AccountId): Promise<KycProfile | null> {
    return this.profiles.find((p) => p.getAccountId().equals(accountId)) ?? null;
  }
}
