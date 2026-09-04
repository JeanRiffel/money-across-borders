import { Request, Response, NextFunction } from 'express';
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication';
import { logger } from 'src/infra/observability/logger';

interface AuthenticatedRequest extends Request {
  user?: any;
}

export function authMiddleware(
  tokenVerifier: TokenVerifier
): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) return res.status(401).send();

    try {
      const payload = tokenVerifier.verify(token);
      req.user = payload;
      return next();
    } catch (error) {
      // The client only ever sees a bare 401 (no body) — logging here is
      // purely for operators: JWTService.verify() attaches the original
      // jsonwebtoken error (expired, malformed, bad signature, ...) as
      // `error.cause`, which pino serializes automatically.
      logger.warn({ error }, 'Rejected request: invalid or expired token');
      return res.status(401).send();
    }
  };
}
