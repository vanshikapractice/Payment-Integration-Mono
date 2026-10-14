import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/middleware/errorHandler';
import { createRateLimiter } from '@/middleware/rateLimiter';
import {
  canTransitionPaymentStatus,
  isTerminalPaymentStatus,
} from '@/services/payment/state';
import type { config, validateConfig } from '@/config';

/**
 * Loads a fresh copy of the config module with the supplied
 * environment. process.env is restored afterwards so scenarios
 * do not leak into one another.
 */
async function loadConfig(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  const keys = new Set([...Object.keys(env), ...Object.keys(process.env)]);
  for (const key of keys) previous[key] = process.env[key];

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  vi.resetModules();
  const mod = (await vi.importActual('@/config')) as {
    config: typeof config;
    validateConfig: typeof validateConfig;
  };

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return mod;
}

describe('payment configuration', () => {
  it('fails closed: mock mode is disabled in production even when enabled', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'production',
      PAYMENT_MOCK_MODE: 'true',
    });
    expect(config.payment.mockMode).toBe(false);
  });

  it('enables mock mode in development when explicitly enabled', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'development',
      PAYMENT_MOCK_MODE: 'true',
    });
    expect(config.payment.mockMode).toBe(true);
  });

  it('disables mock mode when not explicitly enabled', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'development',
      PAYMENT_MOCK_MODE: 'false',
    });
    expect(config.payment.mockMode).toBe(false);
  });

  it('falls back to the supported currency for unsupported values', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'development',
      PAYMENT_CURRENCY: 'EUR',
    });
    expect(config.payment.currency).toBe('USD');
  });
});

describe('validateConfig', () => {
  it('throws in production when the JWT secret is the development fallback', async () => {
    const { validateConfig } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: undefined,
    });
    expect(() => validateConfig()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when the JWT secret is too weak', async () => {
    const { validateConfig } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'short',
    });
    expect(() => validateConfig()).toThrow(/at least/);
  });

  it('passes in production with a strong JWT secret', async () => {
    const { validateConfig } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
    });
    expect(() => validateConfig()).not.toThrow();
  });

  it('passes outside production with the development fallback', async () => {
    const { validateConfig } = await loadConfig({
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
    });
    expect(() => validateConfig()).not.toThrow();
  });
});

describe('rate limiter', () => {
  it('allows up to the limit then rejects with 429', () => {
    const store = new Map<string, { count: number; resetAt: number }>();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, store });
    const req = { ip: '203.0.113.9' } as unknown as Request;
    const res = {} as unknown as Response;
    const nextErrors: unknown[] = [];
    const next = (err?: unknown) => {
      nextErrors.push(err);
    };

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(nextErrors[0]).toBeUndefined();
    expect(nextErrors[1]).toBeUndefined();
    expect(nextErrors[2]).toBeInstanceOf(AppError);
    expect((nextErrors[2] as AppError).statusCode).toBe(429);
    expect((nextErrors[2] as AppError).code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('payment state machine', () => {
  it('allows valid transitions', () => {
    expect(canTransitionPaymentStatus('PENDING', 'PROCESSING')).toBe(true);
    expect(canTransitionPaymentStatus('PENDING', 'SUCCEEDED')).toBe(true);
    expect(canTransitionPaymentStatus('PENDING', 'FAILED')).toBe(true);
    expect(canTransitionPaymentStatus('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransitionPaymentStatus('SUCCEEDED', 'REFUNDED')).toBe(true);
  });

  it('never allows a terminal status to be overwritten', () => {
    expect(canTransitionPaymentStatus('FAILED', 'SUCCEEDED')).toBe(false);
    expect(canTransitionPaymentStatus('FAILED', 'PENDING')).toBe(false);
    expect(canTransitionPaymentStatus('CANCELLED', 'PENDING')).toBe(false);
    expect(canTransitionPaymentStatus('REFUNDED', 'PENDING')).toBe(false);
    expect(canTransitionPaymentStatus('SUCCEEDED', 'PENDING')).toBe(false);
  });

  it('identifies terminal statuses', () => {
    expect(isTerminalPaymentStatus('FAILED')).toBe(true);
    expect(isTerminalPaymentStatus('CANCELLED')).toBe(true);
    expect(isTerminalPaymentStatus('REFUNDED')).toBe(true);
    expect(isTerminalPaymentStatus('PENDING')).toBe(false);
    expect(isTerminalPaymentStatus('PROCESSING')).toBe(false);
  });
});