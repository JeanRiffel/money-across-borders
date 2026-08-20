import { User } from "../../../domain/user/entities/user";
import { UserRepository } from "../../../domain/user/repository/user-repository";
import { UserId } from "../../../domain/user/value-objects/user-id-value-object";

export class InMemoryUserRepository implements UserRepository {
  private users: User[] = []

  async save(user: User): Promise<void> {
    this.users.push(user)
  }

  async findById(userId: UserId): Promise<User | null> {
    return this.users.find(user => user.getId().equals(userId)) ?? null
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find(user => user.getEmail() === email) ?? null
  }
}
