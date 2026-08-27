import { KycProfile } from '../entities/kyc-profile';
import { AccountId } from '../../account/value-objects/account-id-value-object';

export interface KycProfileRepository {
  save(profile: KycProfile): Promise<void>;
  findByAccountId(accountId: AccountId): Promise<KycProfile | null>;
}
