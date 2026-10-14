import { z } from 'zod';
import { config } from '@/config';
import { isValidMinorUnitAmount } from '@/utils/amount';

export const createOrderRequestSchema = z.object({
  amount: z.number().refine(isValidMinorUnitAmount, {
    message:
      'Amount must be a positive integer in minor units (e.g., cents) within the allowed range',
  }),
  currency: z.string().length(3).default(config.payment.currency),
  description: z.string().max(200).optional(),
  // Optional and never trusted for identity: when present it must match the
  // authenticated user (enforced in the route). The persisted userId always
  // comes from the authentication token.
  userId: z.string().min(1).optional(),
});

export const simulatePaymentRequestSchema = z.object({
  event: z.enum(['payment.succeeded', 'payment.failed', 'payment.cancelled']),
});

export function isAllowedTestAmount(amount: number): boolean {
  return config.payment.allowedAmounts.includes(amount);
}
