export type ProviderOrderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface CreateOrderParams {
  amount: number;
  currency: string;
  description?: string;
  userId: string;
  /**
   * Optional caller-supplied idempotency key. When present, the
   * provider derives a deterministic order id for (userId, key) so a
   * retried request maps to the same provider order instead of
   * creating a duplicate.
   */
  idempotencyKey?: string;
}

export interface PaymentOrderResult {
  providerOrderId: string;
  amount: number;
  currency: string;
  status: ProviderOrderStatus;
  createdAt: string;
}

export type PaymentSimulationEvent =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.cancelled';

export interface IPaymentProvider {
  readonly name: string;
  isAvailable(): boolean;
  createOrder(params: CreateOrderParams): Promise<PaymentOrderResult>;
  getOrder(providerOrderId: string): Promise<PaymentOrderResult>;
  simulateEvent(
    providerOrderId: string,
    event: PaymentSimulationEvent
  ): Promise<PaymentOrderResult>;
}
