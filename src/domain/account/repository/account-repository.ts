import { Account } from "../entities/account"
import { AccountId } from "../value-objects/account-id-value-object"
import { UserId } from "../../user/value-objects/user-id-value-object"

export interface AccountRepository {
  save(account: Account): Promise<void>
  findbyId(accountId: AccountId): Promise<Account | null>
  // Needed by LoginUseCase: a User authenticates by email/password, but the
  // rest of the API (wallets, remittances) operates on accountId, so login
  // has to resolve the authenticated User's Account to embed in the token.
  findByUserId(userId: UserId): Promise<Account | null>
}