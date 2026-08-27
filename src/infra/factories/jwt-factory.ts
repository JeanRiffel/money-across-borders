import { JWTService } from '../authentication/jwt-service';

export function createJWTService(): JWTService {
  return new JWTService();
}
