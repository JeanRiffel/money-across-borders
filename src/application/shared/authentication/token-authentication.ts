import { JwtPayload } from 'jsonwebtoken';

export interface TokenGenerator {
  generate(payload: object, expiresIn?: string): string;
}

export interface TokenVerifier {
  verify(token: string): JwtPayload | string;
}
