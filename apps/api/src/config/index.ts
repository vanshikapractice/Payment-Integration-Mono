import dotenv from 'dotenv';
import { MAX_AMOUNT_MINOR_UNITS } from '@/utils/amount';

dotenv.config();

const PROVIDER_VALUES = ['mock'] as const;
const CURRENCY_VALUES = ['USD'] as const;

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
} as const;
