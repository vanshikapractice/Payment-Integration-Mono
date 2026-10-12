import { config } from '@/config';
import { MockProvider } from './MockProvider';
import type { IPaymentProvider } from './IPaymentProvider';

export { MockProvider } from './MockProvider';
export type {
  CreateOrderParams,
  IPaymentProvider,
  PaymentOrderResult,
  PaymentSimulationEvent,
  ProviderOrderStatus,
} from './IPaymentProvider';

export function getPaymentProvider(): IPaymentProvider {
  switch (config.payment.provider) {
    case 'mock':
      return new MockProvider();
  }
}
