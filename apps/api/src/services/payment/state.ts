import type { PaymentStatus } from '@prisma/client';

/**
 * Explicit payment lifecycle model.
 *
 * Terminal states (FAILED, CANCELLED, REFUNDED) can never be left.
 * SUCCEEDED is stable except that it may be refunded. This module is
 * the single source of truth for allowed transitions so that future
 * status-update paths (e.g. provider webhooks) enforce the same rules
 * and a terminal status can never be overwritten arbitrarily.
 */
export const TERMINAL_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  'FAILED',
  'CANCELLED',
  'REFUNDED',
]);

export const VALID_PAYMENT_TRANSITIONS: Readonly<
  Record<PaymentStatus, ReadonlySet<PaymentStatus>>
> = {
  PENDING: new Set(['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  PROCESSING: new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']),
  SUCCEEDED: new Set(['REFUNDED']),
  FAILED: new Set([]),
  CANCELLED: new Set([]),
  REFUNDED: new Set([]),
};

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return TERMINAL_PAYMENT_STATUSES.has(status);
}

export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  return VALID_PAYMENT_TRANSITIONS[from]?.has(to) ?? false;
}
