import { Prisma } from '@prisma/client';
import type { Payment } from '@prisma/client';
import { config } from '@/config';
import { prisma } from '@/db/prisma';
import { AppError } from '@/middleware/errorHandler';
import { getPaymentProvider } from './provider';
import type { CreateOrderParams, IPaymentProvider } from './provider';
import { isAllowedTestAmount } from '../validation/payment';

export async function createPaymentOrder(
  params: CreateOrderParams,
  provider: IPaymentProvider = getPaymentProvider()
): Promise<Payment> {
  if (!isAllowedTestAmount(params.amount)) {
    throw new AppError(
      `Amount ${params.amount} is not in the allowed test amounts`,
      400,
      'AMOUNT_NOT_ALLOWED'
    );
  }

  if (params.currency !== config.payment.currency) {
    throw new AppError(
      `Currency ${params.currency} is not supported`,
      400,
      'CURRENCY_NOT_SUPPORTED'
    );
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) {
      throw AppError.notFound(`User not found: ${params.userId}`);
    }

    if (!provider.isAvailable()) {
      throw new AppError(
        'Payment provider is not available',
        503,
        'PAYMENT_PROVIDER_UNAVAILABLE'
      );
    }

    const providerOrder = await provider.createOrder(params);

    try {
      return await prisma.payment.create({
        data: {
          providerOrderId: providerOrder.providerOrderId,
          amount: providerOrder.amount,
          currency: providerOrder.currency,
          status: 'PENDING',
          provider: provider.name,
          description: params.description,
          userId: params.userId,
        },
      });
    } catch (createError) {
      // Idempotent replay: when an idempotency key was supplied, the
      // provider order id is deterministic for (userId, key), so a
      // unique-constraint collision means this exact request was already
      // processed. Return the existing record instead of duplicating it.
      if (
        params.idempotencyKey &&
        createError instanceof Prisma.PrismaClientKnownRequestError &&
        createError.code === 'P2002'
      ) {
        const existing = await prisma.payment.findUnique({
          where: { providerOrderId: providerOrder.providerOrderId },
        });
        if (existing) {
          return existing;
        }
      }
      throw createError;
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError(
        'Payment order already exists',
        409,
        'DUPLICATE_PAYMENT_ORDER'
      );
    }

    console.error(
      'Failed to create payment order:',
      error instanceof Error ? error.message : error
    );
    throw AppError.internal('Failed to create payment order');
  }
}
