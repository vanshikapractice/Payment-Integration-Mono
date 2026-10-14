import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { AppError } from '@/middleware/errorHandler';
import { createPaymentOrder } from '@/services/payment/PaymentService';
import { createOrderRequestSchema } from '@/services/validation/payment';

const router: Router = Router();

const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

// Every payment endpoint requires an authenticated caller. The user
// identity is taken from the authentication token, never from the
// request body (authorization is enforced separately below).
router.use(authenticate);

router.post(
  '/create-order',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = createOrderRequestSchema.parse(req.body);

    // Authorization: the payment owner is the authenticated principal.
    const authenticatedUserId = req.user?.id;
    if (!authenticatedUserId) {
      throw AppError.unauthorized('Authentication required');
    }

    // A caller may not create a payment for a different user: when a
    // userId is supplied it must match the authenticated principal. The
    // authenticated id is always the value persisted.
    if (payload.userId && payload.userId !== authenticatedUserId) {
      throw new AppError(
        'Cannot create a payment for a different user',
        403,
        'USER_MISMATCH'
      );
    }

    // Optional idempotency key (Idempotency-Key header). When present,
    // a retried request with the same key returns the original payment
    // instead of creating a duplicate.
    const rawKey = req.headers['idempotency-key'];
    let idempotencyKey: string | undefined;
    if (rawKey !== undefined) {
      if (
        Array.isArray(rawKey) ||
        typeof rawKey !== 'string' ||
        rawKey.length === 0 ||
        rawKey.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
        !IDEMPOTENCY_KEY_PATTERN.test(rawKey)
      ) {
        throw AppError.badRequest(
          'Idempotency-Key must be 1-255 characters of letters, numbers, ".", "_", ":" or "-"'
        );
      }
      idempotencyKey = rawKey;
    }

    const payment = await createPaymentOrder({
      ...payload,
      userId: authenticatedUserId,
      idempotencyKey,
    });
    res.status(201).json({ success: true, data: payment });
  })
);

export { router as paymentsRouter };
