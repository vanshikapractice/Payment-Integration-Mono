import dotenv from 'dotenv';
import { MAX_AMOUNT_MINOR_UNITS } from '@/utils/amount';

dotenv.config();

const PROVIDER_VALUES = ['mock'] as const;
const CURRENCY_VALUES = ['USD'] as const;

// Minimum length (in characters) for a production JWT signing secret.
export const MIN_JWT_SECRET_LENGTH = 32;

// Development-only fallback so the auth flow works out of the box. In
// production, JWT_SECRET must be set to a strong, unique secret (see
// .env.example); the application fails fast at startup whenever the
// fallback is in use.
const JWT_DEV_FALLBACK_SECRET = 'payment-task-dev-only-secret-change-me';

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function parseAmountAllowlist(value: string | undefined): readonly number[] {
  const fallback = [1000, 2500, 5000, 10000];
  if (value === undefined) {
    return fallback;
  }

  const amounts = value
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter(
      (amount) =>
        Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT_MINOR_UNITS
    );

  return amounts.length > 0 ? amounts : fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const isProduction = process.env.NODE_ENV === 'production';
const mockModeExplicitlyEnabled = process.env.PAYMENT_MOCK_MODE === 'true';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || '/api',
  databaseUrl: process.env.DATABASE_URL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  payment: {
    provider: parseEnum(process.env.PAYMENT_PROVIDER, PROVIDER_VALUES, 'mock'),
    mockMode: mockModeExplicitlyEnabled && !isProduction,
    allowedAmounts: parseAmountAllowlist(process.env.PAYMENT_ALLOWED_AMOUNTS),
    currency: parseEnum(process.env.PAYMENT_CURRENCY, CURRENCY_VALUES, 'USD'),
  },
  security: {
    rateLimit: {
      windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
      max: parsePositiveInt(process.env.RATE_LIMIT_MAX, 30),
    },
  },
  jwtSecret: process.env.JWT_SECRET || JWT_DEV_FALLBACK_SECRET,
  jwtSecretIsDefault: !process.env.JWT_SECRET,
} as const;

/**
 * Validates configuration at startup. Fails fast (throws) in production
 * when the JWT secret is missing, weak, or still the development fallback,
 * so the server never boots with an insecure signing key.
 */
export function validateConfig(): void {
  if (config.env !== 'production') {
    return;
  }

  if (config.jwtSecretIsDefault) {
    throw new Error(
      'JWT_SECRET must be set in production; the development fallback secret is not allowed'
    );
  }

  if (config.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long in production`
    );
  }
}
