import { Router } from 'express';
import type { Request, Response } from 'express';
import { checkDatabaseConnection } from '@/db/prisma';
import { config } from '@/config';

const router: Router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const dbConnected = await checkDatabaseConnection();
  
  const health = {
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: dbConnected ? 'connected' : 'disconnected',
    },
  };

  const statusCode = dbConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/ready', async (_req: Request, res: Response) => {
  const dbConnected = await checkDatabaseConnection();
  
  if (!dbConnected) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'disconnected',
      },
    });
    return;
  }

  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };