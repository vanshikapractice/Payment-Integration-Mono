import type { NextFunction, Request, Response } from 'express';
import { config } from '@/config';
import { AppError } from '@/middleware/errorHandler';
import { verifyJwt } from '@/utils/jwt';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const BEARER_PREFIX = 'Bearer ';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  if (config.jwtSecretIsDefault && config.env === 'production') {
    next(new AppError('JWT secret is not configured', 503, 'AUTH_MISCONFIGURED'));
    return;
  }

  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith(BEARER_PREFIX)) {
    next(AppError.unauthorized('Missing or malformed Authorization header'));
    return;
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    next(AppError.unauthorized('Missing or malformed Authorization header'));
    return;
  }

  try {
    const payload = verifyJwt(token, config.jwtSecret);
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      next(AppError.unauthorized('Token is missing a subject'));
      return;
    }

    const email = typeof payload.email === 'string' ? payload.email : '';
    req.user = { id: sub, email };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
}
