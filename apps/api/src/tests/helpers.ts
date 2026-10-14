import request from 'supertest';
import type { Application } from 'express';
import type { Response } from 'supertest';
import { createApp } from '@/app';
import { prisma } from '@/db/prisma';

export const TEST_USER_EMAIL = 'test@example.com';
export const TEST_USER_PASSWORD = 'password123';

export interface TestSession {
  app: Application;
  token: string;
  userId: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export interface LoginData {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface PaymentData {
  id: string;
  providerOrderId: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  description: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthData {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  checks: {
    database: string;
  };
}

export interface ReadyData {
  status: string;
  timestamp: string;
}

/** Typed success envelope ({ success: true, data }). */
export function jsonBody<T>(res: Response): ApiSuccessBody<T> {
  return res.body as ApiSuccessBody<T>;
}

/** Typed error envelope ({ success: false, error }). */
export function jsonError(res: Response): ApiErrorBody {
  return res.body as ApiErrorBody;
}

/** Typed bare JSON response (health and readiness probes). */
export function jsonRaw<T>(res: Response): T {
  return res.body as T;
}

/** Builds a fresh app and authenticates the seeded test user. */
export async function createTestSession(): Promise<TestSession> {
  const app = createApp();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });

  if (res.status !== 200) {
    throw new Error(
      `Test login failed: ${res.status} ${JSON.stringify(res.body)}`
    );
  }

  const body = jsonBody<LoginData>(res);
  return {
    app,
    token: body.data.token,
    userId: body.data.user.id,
  };
}

/** Removes test-created payments so runs stay independent. */
export async function deletePaymentsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await prisma.payment.deleteMany({ where: { id: { in: ids } } });
}
