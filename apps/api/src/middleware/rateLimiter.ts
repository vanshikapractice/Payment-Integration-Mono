import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@/middleware/errorHandler';

export interface RateLimiterOptions {
  /** Length of the fixed window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed per window per key. */
  max: number;
  /**
   * Optional shared store. A fresh Map is created per limiter when
   * omitted, which keeps instances (and tests) isolated.
   */
  store?: Map<string, { count: number; resetAt: number }>;
  /** Derives the rate-limit bucket key. Defaults to the client IP. */
  keyGenerator?: (req: Request) => string;
}

/**
 * Minimal, dependency-free fixed-window rate limiter. Intended for
 * authentication endpoints (e.g. login) to blunt credential-stuffing
 * and brute-force attempts. State is in-memory and per-process, so it
 * is not a distributed quota — it is a lightweight local guard.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const store = options.store ?? new Map<string, { count: number; resetAt: number }>();
  const keyGenerator = options.keyGenerator ?? ((req: Request) => req.ip ?? 'unknown');

  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();

    // Sweep expired entries so the store does not grow unboundedly.
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }

    const key = keyGenerator(req);
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + options.windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      next(
        new AppError('Too many requests, please try again later', 429, 'TOO_MANY_REQUESTS', {
          retryAfter,
        })
      );
      return;
    }

    next();
  };
}
