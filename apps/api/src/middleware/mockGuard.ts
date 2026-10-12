import type { NextFunction, Request, Response } from 'express';
import { config } from '@/config';
import { AppError } from './errorHandler';

export function mockGuard(_req: Request, _res: Response, next: NextFunction): void {
  if (!config.payment.mockMode) {
    next(AppError.forbidden('Mock payment simulation is disabled'));
    return;
  }
  next();
}
