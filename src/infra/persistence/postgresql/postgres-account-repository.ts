import { Account } from "../../../domain/account/entities/account";
import { AccountRepository } from "../../../domain/account/repository/account-repository";
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object";
import { UserId } from "../../../domain/user/value-objects/user-id-value-object";

export class PostgresAccountRepository implements AccountRepository{

  async save(account: Account): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async findbyId(_accountId: AccountId): Promise<Account | null> {
    throw new Error("Method not implemented.");
  }

  async findByUserId(_userId: UserId): Promise<Account | null> {
    throw new Error("Method not implemented.");
  }

}