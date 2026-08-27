import bcrypt from 'bcrypt';
import { PasswordHasher } from 'src/application/shared/security/password-hasher';

export class BcryptPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
  compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
