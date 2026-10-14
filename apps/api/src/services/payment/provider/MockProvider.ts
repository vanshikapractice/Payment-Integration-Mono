import { createHash, randomUUID } from 'node:crypto';
import { config } from '@/config';
import { AppError } from '@/middleware/errorHandler';
import { canTransitionPaymentStatus } from '@/services/payment/state';
import type {
  CreateOrderParams,
  IPaymentProvider,
  PaymentOrderResult,
  PaymentSimulationEvent,
  ProviderOrderStatus,
} from './IPaymentProvider';

const EVENT_STATUS: Record<PaymentSimulationEvent, ProviderOrderStatus> = {
  'payment.succeeded': 'SUCCEEDED',
  'payment.failed': 'FAILED',
  'payment.cancelled': 'CANCELLED',
};

/**
 * Derives a stable provider order id for a (userId, idempotencyKey)
 * pair. The digest is one-way, so the key itself is never stored or
 * leaked, and retries of the same key always resolve to the same
 * provider order.
 */
function deterministicOrderId(userId: string, idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update(`${userId}:${idempotencyKey}`)
    .digest('hex');
  return `mock_idem_${digest}`;
}

/**
 * In-memory mock provider.
 *
 * IMPORTANT: this Map is ephemeral, per-process mock state and is
 * NOT the persistent source of truth. The authoritative record for
 * any payment is the row persisted in the `payments` table by the
 * payment service. The Map only backs the mock's own getOrder /
 * simulateEvent lookups, which are not exposed as API endpoints in
 * this phase.
 */
export class MockProvider implements IPaymentProvider {
  readonly name = 'mock';

  private readonly orders = new Map<string, PaymentOrderResult>();

  isAvailable(): boolean {
    return config.payment.mockMode;
  }

  createOrder(params: CreateOrderParams): Promise<PaymentOrderResult> {
    const providerOrderId = params.idempotencyKey
      ? deterministicOrderId(params.userId, params.idempotencyKey)
      : `mock_${randomUUID()}`;

    const order: PaymentOrderResult = {
      providerOrderId,
      amount: params.amount,
      currency: params.currency,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.orders.set(order.providerOrderId, order);
    return Promise.resolve(order);
  }

  getOrder(providerOrderId: string): Promise<PaymentOrderResult> {
    const order = this.orders.get(providerOrderId);
    if (!order) {
      return Promise.reject(
        AppError.notFound(`Mock payment order not found: ${providerOrderId}`)
      );
    }
    return Promise.resolve(order);
  }

  simulateEvent(
    providerOrderId: string,
    event: PaymentSimulationEvent
  ): Promise<PaymentOrderResult> {
    if (!this.isAvailable()) {
      return Promise.reject(
        AppError.forbidden('Mock payment provider is not enabled')
      );
    }

    const order = this.orders.get(providerOrderId);
    if (!order) {
      return Promise.reject(
        AppError.notFound(`Mock payment order not found: ${providerOrderId}`)
      );
    }

    const targetStatus = EVENT_STATUS[event];
    if (!canTransitionPaymentStatus(order.status, targetStatus)) {
      return Promise.reject(
        new AppError(
          `Mock payment order ${providerOrderId} cannot transition from ${order.status} to ${targetStatus}`,
          409,
          'INVALID_STATE'
        )
      );
    }

    order.status = targetStatus;
    return Promise.resolve(order);
  }
}
