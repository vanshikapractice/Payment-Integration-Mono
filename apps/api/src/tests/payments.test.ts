import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/db/prisma';
import { AppError } from '@/middleware/errorHandler';
import { createPaymentOrder } from '@/services/payment/PaymentService';
import type { IPaymentProvider } from '@/services/payment/provider';
import {
  createTestSession,
  deletePaymentsByIds,
  jsonBody,
  jsonError,
  jsonRaw,
} from './helpers';
import type {
  HealthData,
  PaymentData,
  ReadyData,
  TestSession,
} from './helpers';

let session: TestSession;
const createdPaymentIds: string[] = [];

beforeAll(async () => {
  session = await createTestSession();
});

afterAll(async () => {
  await deletePaymentsByIds(createdPaymentIds);
});

function createOrderRequest() {
  return request(session.app)
    .post('/api/payments/create-order')
    .set('Authorization', `Bearer ${session.token}`);
}

describe('create-order API', () => {
  it('creates a payment for an allowlisted amount', async () => {
    const res = await createOrderRequest().send({
      amount: 1000,
      currency: 'USD',
      description: 'integration test order',
    });

    expect(res.status).toBe(201);
    const body = jsonBody<PaymentData>(res);
    expect(body.success).toBe(true);
    expect(body.data.amount).toBe(1000);
    expect(body.data.currency).toBe('USD');
    expect(body.data.status).toBe('PENDING');
    expect(body.data.provider).toBe('mock');
    expect(body.data.userId).toBe(session.userId);
    createdPaymentIds.push(body.data.id);
  });

  it('rejects a non-numeric amount with a validation error', async () => {
    const res = await createOrderRequest().send({
      amount: '1000',
      currency: 'USD',
    });

    expect(res.status).toBe(400);
    expect(jsonError(res).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a well-formed amount that is not allowlisted', async () => {
    const res = await createOrderRequest().send({
      amount: 9999,
      currency: 'USD',
    });

    expect(res.status).toBe(400);
    expect(jsonError(res).error.code).toBe('AMOUNT_NOT_ALLOWED');
  });

  it('rejects an unsupported currency', async () => {
    const res = await createOrderRequest().send({
      amount: 1000,
      currency: 'EUR',
    });

    expect(res.status).toBe(400);
    expect(jsonError(res).error.code).toBe('CURRENCY_NOT_SUPPORTED');
  });

  it('returns the original payment when a key is retried', async () => {
    const key = `retry-${Date.now()}`;

    const first = await createOrderRequest()
      .set('Idempotency-Key', key)
      .send({ amount: 2500, currency: 'USD' });
    expect(first.status).toBe(201);
    const firstBody = jsonBody<PaymentData>(first);
    createdPaymentIds.push(firstBody.data.id);

    const second = await createOrderRequest()
      .set('Idempotency-Key', key)
      .send({ amount: 2500, currency: 'USD' });
    expect(second.status).toBe(201);
    const secondBody = jsonBody<PaymentData>(second);
    expect(secondBody.data.id).toBe(firstBody.data.id);
    expect(secondBody.data.providerOrderId).toBe(
      firstBody.data.providerOrderId
    );

    const count = await prisma.payment.count({
      where: { providerOrderId: firstBody.data.providerOrderId },
    });
    expect(count).toBe(1);
  });

  it('creates distinct payments for distinct idempotency keys', async () => {
    const first = await createOrderRequest()
      .set('Idempotency-Key', `alpha-${Date.now()}`)
      .send({ amount: 5000, currency: 'USD' });
    const second = await createOrderRequest()
      .set('Idempotency-Key', `beta-${Date.now()}`)
      .send({ amount: 5000, currency: 'USD' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = jsonBody<PaymentData>(first);
    const secondBody = jsonBody<PaymentData>(second);
    expect(secondBody.data.id).not.toBe(firstBody.data.id);
    createdPaymentIds.push(firstBody.data.id, secondBody.data.id);
  });

  it('rejects an idempotency key with invalid characters', async () => {
    const res = await createOrderRequest()
      .set('Idempotency-Key', 'invalid key!')
      .send({ amount: 1000, currency: 'USD' });

    expect(res.status).toBe(400);
    expect(jsonError(res).error.code).toBe('BAD_REQUEST');
  });

  it('rejects an idempotency key that is too long', async () => {
    const res = await createOrderRequest()
      .set('Idempotency-Key', 'a'.repeat(256))
      .send({ amount: 1000, currency: 'USD' });

    expect(res.status).toBe(400);
    expect(jsonError(res).error.code).toBe('BAD_REQUEST');
  });

  it('reports healthy when the database is reachable', async () => {
    const res = await request(session.app).get('/api/health');

    expect(res.status).toBe(200);
    const body = jsonRaw<HealthData>(res);
    expect(body.status).toBe('healthy');
    expect(body.checks.database).toBe('connected');
  });

  it('reports ready when the database is reachable', async () => {
    const res = await request(session.app).get('/api/health/ready');

    expect(res.status).toBe(200);
    const body = jsonRaw<ReadyData>(res);
    expect(body.status).toBe('ready');
  });
});

describe('createPaymentOrder error handling', () => {
  it('sanitizes an unexpected provider failure into a 500', async () => {
    const failingProvider: IPaymentProvider = {
      name: 'mock',
      isAvailable: () => true,
      createOrder: () => Promise.reject(new Error('provider exploded')),
      getOrder: () => Promise.reject(new Error('not implemented')),
      simulateEvent: () => Promise.reject(new Error('not implemented')),
    };

    const error = await createPaymentOrder(
      { amount: 1000, currency: 'USD', userId: session.userId },
      failingProvider
    ).then(
      () => {
        throw new Error('expected createPaymentOrder to reject');
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.statusCode).toBe(500);
    expect(appError.code).toBe('INTERNAL_ERROR');
    // The generic client-facing message must never leak the
    // underlying provider error.
    expect(appError.message).not.toContain('provider exploded');
  });
});
