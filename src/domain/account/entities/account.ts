import { AccountId } from '../value-objects/account-id-value-object';
import { AccountStatus } from '../value-objects/account-status-value-object';
import { UserId } from '../../user/value-objects/user-id-value-object';

export type AccountJSON = {
  id: AccountId;
  userId: UserId | null;
  status: AccountStatus;
  createdAt: Date;
};

/**
 * Account is the financial/ledger relationship — the thing Wallet,
 * Remittance, and KycProfile actually reference by id. It deliberately does
 * NOT carry login credentials; those belong to User (see
 * domain/user/entities/user.ts). userId is nullable because not every
 * Account has a human owner: the system treasury account (see
 * domain/wallet/treasury-account.ts) is an Account with no User at all.
 */
export class Account {
  constructor(
    private readonly id: AccountId,
    private readonly userId: UserId | null,
    private readonly status: AccountStatus,
    private readonly createdAt: Date
  ) {}

  getId(): AccountId {
    return this.id;
  }

  getUserId(): UserId | null {
    return this.userId;
  }

  getStatus(): AccountStatus {
    return this.status;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }
}
