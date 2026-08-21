import { User } from "../../../domain/user/entities/user";
import { UserRepository } from "../../../domain/user/repository/user-repository";
import { UserId } from "../../../domain/user/value-objects/user-id-value-object";
import { UserStatus } from "../../../domain/user/value-objects/user-status-value-object";
import { getExecutor } from "../../config/database/postgresql/pg";

type UserRow = {
  id: string
  email: string
  password_hash: string
  status_id: number
  created_at: Date
}

function toUser(row: UserRow): User {
  return new User(
    UserId.from(row.id),
    row.email,
    row.password_hash,
    new UserStatus(row.status_id),
    row.created_at
  )
}

export class PostgresUserRepository implements UserRepository {

  // Users are never mutated after creation in this codebase — plain insert,
  // ON CONFLICT DO NOTHING makes an accidental replay safe.
  async save(user: User): Promise<void> {
    await getExecutor().query(
      `INSERT INTO users (id, email, password_hash, status_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        user.getId().getValue(),
        user.getEmail(),
        user.getPasswordHash(),
        user.getStatus().getId(),
        user.getCreatedAt(),
      ]
    )
  }

  async findById(userId: UserId): Promise<User | null> {
    const result = await getExecutor().query<UserRow>(
      `SELECT id, email, password_hash, status_id, created_at FROM users WHERE id = $1`,
      [userId.getValue()]
    )
    return result.rows[0] ? toUser(result.rows[0]) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await getExecutor().query<UserRow>(
      `SELECT id, email, password_hash, status_id, created_at FROM users WHERE email = $1`,
      [email]
    )
    return result.rows[0] ? toUser(result.rows[0]) : null
  }
}
