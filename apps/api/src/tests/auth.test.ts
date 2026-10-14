import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signJwt } from '@/utils/jwt';
import {
  createTestSession,
  deletePaymentsByIds,
  jsonBody,
  jsonError,
} from './helpers';
import type { LoginData, PaymentData, TestSession } from './helpers';

let session: TestSession;
const createdPaymentIds: string[] = [];

beforeAll(async () => {
  session = await createTestSession();
});

afterAll(async () => {
  await deletePaymentsByIds(createdPaymentIds);
});

describe('auth integration', () => {
  it('logs in with valid credentials', async () => {
    const res = await request(session.app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    const body = jsonBody<LoginData>(res);
    expect(body.success).toBe(true);
    expect(typeof body.data.token).toBe('string');
    expect(body.data.user.email).toBe('test@example.com');
  });

  it('rejects an incorrect password', async () => {
    const res = await request(session.app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'not-the-password' });

    expect(res.status).toBe(401);
    expect(jsonError(res).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an unknown email', async () => {
    const res = await request(session.app)
      .post('/api/auth/login')
      .send({
        email: 'no-such-user@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(401);
    expect(jsonError(res).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects create-order without a token', async () => {
    const res = await request(session.app)
      .post('/api/payments/create-order')
      .send({ amount: 1000, currency: 'USD' });

    expect(res.status).toBe(401);
    expect(jsonError(res).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects create-order with a malformed token', async () => {
    const res = await request(session.app)
      .post('/api/payments/create-order')
      .set('Authorization', `Bearer ${session.token}.tampered`)
      .send({ amount: 1000, currency: 'USD' });

    expect(res.status).toBe(401);
    expect(jsonError(res).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = signJwt(
      { sub: session.userId, email: 'test@example.com' },
      'a-different-secret-that-is-long-enough',
      3600
    );

    const res = await request(session.app)
      .post('/api/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, currency: 'USD' });

    expect(res.status).toBe(401);
    expect(jsonError(res).error.code).toBe('UNAUTHORIZED');
  });

  it('creates a payment for an authenticated caller', async () => {
    const res = await request(session.app)
      .post('/api/payments/create-order')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ amount: 10000, currency: 'USD' });

    expect(res.status).toBe(201);
    const body = jsonBody<PaymentData>(res);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(session.userId);
    createdPaymentIds.push(body.data.id);
  });

  it('forbids creating a payment for a different user', async () => {
    const res = await request(session.app)
      .post('/api/payments/create-order')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ amount: 1000, currency: 'USD', userId: 'someone-else' });

    expect(res.status).toBe(403);
    expect(jsonError(res).error.code).toBe('USER_MISMATCH');
  });
});
