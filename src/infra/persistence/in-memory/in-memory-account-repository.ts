import { Account } from "../../../domain/account/entities/account";
import { AccountRepository } from "../../../domain/account/repository/account-repository";
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object";
import { UserId } from "../../../domain/user/value-objects/user-id-value-object";

export class InMemoryAccountRepository implements AccountRepository{
  private accounts: Account[] = []

  async save(account: Account): Promise<void> {
    this.accounts.push(account)
  }

  async findbyId(accountId: AccountId): Promise<Account | null> {
    return this.accounts.find(account => account.getId().equals(accountId)) ?? null
  }

  async findByUserId(userId: UserId): Promise<Account | null> {
    return this.accounts.find(account => account.getUserId()?.equals(userId) ?? false) ?? null
  }
}