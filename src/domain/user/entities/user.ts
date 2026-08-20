import { UserId } from "../value-objects/user-id-value-object"
import { UserStatus } from "../value-objects/user-status-value-object"

/**
 * User is the identity/authentication aggregate: who can sign in and with
 * what credentials (email + password hash). Deliberately separate from
 * Account (see domain/account/entities/account.ts), which represents the
 * *financial* relationship — wallets, remittances, KYC — that a signup
 * provisions. A User owns zero-or-more Accounts; some Accounts (the system
 * treasury, see domain/wallet/treasury-account.ts) have no owning User at
 * all, which is exactly why this couldn't live as fields on Account.
 */
export class User {

  constructor(
    private readonly id: UserId,
    private readonly email: string,
    private readonly passwordHash: string,
    private readonly status: UserStatus,
    private readonly createdAt: Date
  ) {}

  getId(): UserId {
    return this.id
  }

  getEmail(): string {
    return this.email
  }

  getPasswordHash(): string {
    return this.passwordHash
  }

  getStatus(): UserStatus {
    return this.status
  }

  getCreatedAt(): Date {
    return this.createdAt
  }

}
