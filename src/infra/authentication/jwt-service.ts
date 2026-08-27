import jwt, { JwtPayload } from 'jsonwebtoken';
import {
  TokenGenerator,
  TokenVerifier,
} from 'src/application/shared/authentication/token-authentication';

export class JWTService implements TokenGenerator, TokenVerifier {
  generate(payload: object, expiresIn: string = '1h'): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
  }

  verify(token: string): JwtPayload | string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    try {
      const decoded = jwt.verify(token, secret);
      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}
