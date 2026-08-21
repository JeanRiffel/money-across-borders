import { Account } from "../../../domain/account/entities/account";
import { AccountRepository } from "../../../domain/account/repository/account-repository";
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object";
import { AccountStatus } from "../../../domain/account/value-objects/account-status-value-object";
import { UserId } from "../../../domain/user/value-objects/user-id-value-object";
import { getExecutor } from "../../config/database/postgresql/pg";

type AccountRow = {
  id: string
  user_id: string | null
  status_id: number
  created_at: Date
}

function toAccount(row: AccountRow): Account {
  return new Account(
    AccountId.from(row.id),
    row.user_id === null ? null : UserId.from(row.user_id),
    new AccountStatus(row.status_id),
    row.created_at
  )
}

export class PostgresAccountRepository implements AccountRepository {

  // Accounts are never mutated after creation in this codebase (no
  // Account.update()-style method exists) — plain insert, ON CONFLICT DO
  // NOTHING makes an accidental replay (e.g. a retried idempotency-decorated
  // request) safe rather than a thrown unique-violation.
  async save(account: Account): Promise<void> {
    await getExecutor().query(
      `INSERT INTO accounts (id, user_id, status_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        account.getId().getValue(),
        account.getUserId()?.getValue() ?? null,
        account.getStatus().getId(),
        account.getCreatedAt(),
      ]
    )
  }

  async findbyId(accountId: AccountId): Promise<Account | null> {
    const result = await getExecutor().query<AccountRow>(
      `SELECT id, user_id, status_id, created_at FROM accounts WHERE id = $1`,
      [accountId.getValue()]
    )
    return result.rows[0] ? toAccount(result.rows[0]) : null
  }

  async findByUserId(userId: UserId): Promise<Account | null> {
    const result = await getExecutor().query<AccountRow>(
      `SELECT id, user_id, status_id, created_at FROM accounts WHERE user_id = $1`,
      [userId.getValue()]
    )
    return result.rows[0] ? toAccount(result.rows[0]) : null
  }
}
