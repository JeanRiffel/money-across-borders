import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id-value-object';

export interface UserRepository {
  save(user: User): Promise<void>;
  findById(userId: UserId): Promise<User | null>;
  // Email is a User's natural key for authentication — LoginUseCase looks
  // a user up by it before checking the password.
  findByEmail(email: string): Promise<User | null>;
}
