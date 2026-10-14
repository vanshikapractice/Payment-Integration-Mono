import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Simulate production before any application module is evaluated so
// the config is built with production semantics (mock payments must be
// force-disabled even when PAYMENT_MOCK_MODE is set).
vi.hoisted(() => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'a'.repeat(32);
  process.env.PAYMENT_MOCK_MODE = 'true';
});

import { prisma } from '@/db/prisma';
import { createTestSession, jsonError } from './helpers';
import type { TestSession } from './helpers';

let session: TestSession;

beforeAll(async () => {
  session = await createTestSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('production fail-closed behaviour', () => {
  it('rejects payment creation when the mock provider is disabled', async () => {
    const res = await request(session.app)
      .post('/api/payments/create-order')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ amount: 1000, currency: 'USD' });

    expect(res.status).toBe(503);
    expect(jsonError(res).error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
  });
});
