import { User } from "../../../domain/user/entities/user";
import { UserRepository } from "../../../domain/user/repository/user-repository";
import { UserId } from "../../../domain/user/value-objects/user-id-value-object";

export class PostgresUserRepository implements UserRepository {

  // eslint-disable-next-line
  async save(user: User): Promise<void> {
    throw new Error("Method not implemented.");
  }

  // eslint-disable-next-line
  async findById(userId: UserId): Promise<User | null> {
    throw new Error("Method not implemented.");
  }

  // eslint-disable-next-line
  async findByEmail(email: string): Promise<User | null> {
    throw new Error("Method not implemented.");
  }

}
