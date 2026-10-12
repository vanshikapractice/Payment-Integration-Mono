import { randomUUID } from 'node:crypto';
import { config } from '@/config';
import { AppError } from '@/middleware/errorHandler';
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

export class MockProvider implements IPaymentProvider {
  readonly name = 'mock';

  private readonly orders = new Map<string, PaymentOrderResult>();

  isAvailable(): boolean {
    return config.payment.mockMode;
  }

  createOrder(params: CreateOrderParams): Promise<PaymentOrderResult> {
    const order: PaymentOrderResult = {
      providerOrderId: `mock_${randomUUID()}`,
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

    if (order.status !== 'PENDING' && order.status !== 'PROCESSING') {
      return Promise.reject(
        new AppError(
          `Mock payment order ${providerOrderId} is already in terminal state ${order.status}`,
          409,
          'INVALID_STATE'
        )
      );
    }

    order.status = EVENT_STATUS[event];
    return Promise.resolve(order);
  }
}
