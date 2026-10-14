import express from 'express';
import type { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from '@/config';
import { apiRouter } from '@/routes';
import { errorHandler, notFoundHandler, requestLogger } from '@/middleware';

export function createApp(): Application {
  // Fail fast on insecure configuration (e.g. a missing or weak
  // production JWT secret) before accepting any traffic.
  validateConfig();

  const app = express();

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  }));

  // All request payloads in this API are tiny (login credentials and
  // small payment orders), so a small body limit rejects oversized
  // payloads early instead of the permissive 10mb default.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  app.use(requestLogger);

  app.use(`${config.apiPrefix}`, apiRouter);

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Payment API',
      version: process.env.npm_package_version || '1.0.0',
      environment: config.env,
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}