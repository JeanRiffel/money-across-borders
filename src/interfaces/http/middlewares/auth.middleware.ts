import { Request, Response, NextFunction } from 'express';
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication';

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
    } catch {
      return res.status(401).send();
    }
  };
}
