import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/asyncHandler';
import { createRateLimiter } from '@/middleware/rateLimiter';
import { config } from '@/config';
import { login } from '@/services/auth/AuthService';
import { loginRequestSchema } from '@/services/validation/auth';

const router: Router = Router();

// Rate limit login attempts per client IP to blunt credential-stuffing
// and brute-force attacks. State is in-memory and per-process.
const loginRateLimiter = createRateLimiter({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
});

router.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const payload = loginRequestSchema.parse(req.body);
    const result = await login(payload.email, payload.password);
    res.status(200).json({ success: true, data: result });
  })
);

export { router as authRouter };
