import { AccountId } from '../../account/value-objects/account-id-value-object';
import { KycProfileId } from '../value-objects/kyc-profile-id-value-object';
import { KycStatus } from '../value-objects/kyc-status-value-object';

export class KycProfile {
  constructor(
    private readonly id: KycProfileId,
    private readonly accountId: AccountId,
    private readonly status: KycStatus,
    private readonly fullName: string,
    private readonly documentId: string,
    private readonly verifiedAt: Date | null,
    private readonly createdAt: Date
  ) {}

  getId(): KycProfileId {
    return this.id;
  }

  getAccountId(): AccountId {
    return this.accountId;
  }

  getStatus(): KycStatus {
    return this.status;
  }

  getFullName(): string {
    return this.fullName;
  }

  getDocumentId(): string {
    return this.documentId;
  }

  getVerifiedAt(): Date | null {
    return this.verifiedAt;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }
}
