import { Router } from 'express';
import { healthRouter } from './health';
import { paymentsRouter } from './payments';
import { authRouter } from './auth';

const router: Router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/payments', paymentsRouter);

export { router as apiRouter };
