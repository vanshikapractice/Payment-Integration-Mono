# Part 2 — Prisma Payment Model, Create-Order API & Authentication

Status: **Complete** (authentication boundary enforced; verified end-to-end against the real database)

## Part 2 completion checklist

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Prisma `Payment` model (unique id, user relation, integer minor-unit amount, currency, `PENDING` status, provider, `providerOrderId`, timestamps, indexes) | ✅ Done — schema valid, migration applied, DB in sync |
| 2 | `POST /api/payments/create-order` (validate, allowlist, currency, mock gating, user check, persist `PENDING`, `201`) | ✅ Done |
| 3 | Authentication/authorization boundary (caller cannot pay for an arbitrary user) | ✅ Done — JWT auth; `userId` from token; `403 USER_MISMATCH` on a foreign `userId` |
| 4 | Failure handling (provider order ok, DB insert fails) | ✅ Done — `409`/`500` via centralized error handler |
| 5 | Automated tests | ⏸️ Skipped per instruction ("skip writing test cases"); behavior verified via a one-off real-DB run |
| 6 | Verification (typecheck, lint, Prisma validate, migration status, integration, read-back, health/ready) | ✅ Done — see "Verification results" |

**Conclusion: Part 2 is complete.** The only intentionally omitted item is the
committed automated test suite (deferred by instruction). All functional and
security requirements are implemented and verified against the real database.

## Summary

Part 2 adds database persistence, the order-creation endpoint, and a proper
authentication/authorization boundary on top of the Part 1 payment module. It
introduces no new provider, no frontend flow, and no simulation endpoint.

Key properties:

- **Integer minor units only**: `Payment.amount` is `Int` (cents), never a
  floating-point or `Decimal` column. All money math is integer math.
- **Migration already applied and in sync**: `prisma migrate status` reports the
  database is up to date; the live `payments.amount` column is `int`, matching the
  schema and migration. **No new migration is required and none was applied.**
- **Server-controlled allowlist**: the endpoint re-validates the amount against
  `PAYMENT_ALLOWED_AMOUNTS` server-side; frontend validation is never trusted.
- **Authentication enforced**: every `/api/payments/*` route requires a valid
  `Authorization: Bearer <jwt>` header. The user identity is taken from the
  token, never from the request body.
- **Authorization**: a caller cannot create a payment for another user — a
  `userId` in the body that differs from the authenticated principal is rejected
  with `403 USER_MISMATCH`, and the persisted `userId` is always the
  authenticated user's id.
- **Mock fails closed in production**: `config.payment.mockMode` is `true` only
  when `PAYMENT_MOCK_MODE=true` is set **and** `NODE_ENV !== 'production'`.
- **Centralized error handling**: the route uses `asyncHandler` + `errorHandler`;
  no stack traces or secrets are returned to clients.

## Authentication & authorization

New in this pass. No authentication existed previously, so the create-order
endpoint used to trust `userId` from the request body (any caller could pay for
any user). That boundary is now closed.

### Components

| File | Role |
|------|------|
| `apps/api/src/utils/jwt.ts` | Dependency-free JWT (HS256) sign/verify using Node's built-in `crypto` (`createHmac` + `timingSafeEqual`). Pins `alg` to `HS256` and checks `exp`. **No new dependency.** |
| `apps/api/src/middleware/auth.ts` | `authenticate` Express middleware: parses `Authorization: Bearer <token>`, verifies the JWT with `config.jwtSecret`, and sets `req.user = { id, email }`. Rejects with `401 UNAUTHORIZED` on a missing/malformed/invalid/expired token. Fails closed (`503 AUTH_MISCONFIGURED`) in production when the development fallback secret is in use. |
| `apps/api/src/services/auth/AuthService.ts` | `login(email, password)`: looks up the user, verifies the password with `bcryptjs` (already a dependency), and returns a signed JWT (`sub` = user id, 1-hour TTL). On a missing user it hashes a dummy value so response time does not reveal whether the email exists (user-enumeration mitigation). Never returns the password hash. |
| `apps/api/src/services/validation/auth.ts` | `loginRequestSchema` (Zod): `email` must be a valid email, `password` non-empty. |
| `apps/api/src/routes/auth.ts` | `POST /api/auth/login` → `200 { success, data: { token, user: { id, email, name } } }`. |
| `apps/api/src/config/index.ts` | Adds `jwtSecret` (from `JWT_SECRET`, with a documented development-only fallback) and `jwtSecretIsDefault`. |

### How the boundary is enforced

`apps/api/src/routes/payments.ts` applies `router.use(authenticate)` so all
payment routes require authentication. In `POST /create-order`:

1. `req.user.id` (from the verified token) is the **only** source of identity.
2. If the body carries a `userId` that differs from `req.user.id`, the request is
   rejected with `403 USER_MISMATCH` ("Cannot create a payment for a different
   user").
3. The value persisted is always `req.user.id`, never the body value.

Therefore a caller authenticated as user **A** cannot create a payment for user
**B** by supplying B's id — the request is rejected, and even a matching/omitted
body `userId` cannot change the owner.

`createOrderRequestSchema` was updated so `userId` is **optional** and never
trusted for identity (Zod strips unknown keys by default, so an attacker cannot
smuggle other fields either).

### Production safety

`config.jwtSecretIsDefault` is `true` when `JWT_SECRET` is unset. In that case
`authenticate` returns `503 AUTH_MISCONFIGURED` instead of minting/accepting
tokens signed with the well-known development fallback. Set `JWT_SECRET` to a
strong, unique secret (≥32 bytes) in production — see `apps/api/.env.example`.

## Prisma Payment model

`apps/api/prisma/schema.prisma` (unchanged this pass)

| Requirement | Implementation |
|-------------|----------------|
| Unique payment ID | `id String @id @default(cuid())` (PK) |
| User relationship | `userId String` + `user User @relation(fields:[userId], references:[id], onDelete: Cascade)`; mirrors the existing `User` model |
| Integer amount (minor units) | `amount Int` — no floating-point/Decimal |
| Currency | `currency String @default("USD")` |
| Status incl. `PENDING` | `status PaymentStatus @default(PENDING)`; enum = `PENDING, PROCESSING, SUCCEEDED, FAILED, CANCELLED, REFUNDED` |
| Provider identification | `provider String @default("mock")` |
| Provider order/reference ID | `providerOrderId String @unique` |
| Timestamps | `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` |
| Constraints/indexes | unique `providerOrderId`, `@@index([userId])`, `@@index([status])`, FK `payments_userId_fkey` → `users.id` (cascade) |
| Table mapping | `@@map("payments")` |

`prisma validate` → **schema is valid**.

## Critical migration check — findings

Migration inspected: `apps/api/prisma/migrations/20261012102737_payment_model/migration.sql`.

Findings from live-database inspection (read-only, via `mysql2` against the `.env`
`DATABASE_URL`):

- The migration is the **only** migration in `prisma/migrations/` and is **already
  recorded as applied** in `_prisma_migrations` (`applied_steps_count = 1`,
  `finished_at` set).
- It creates **both** `users` and `payments`. Because it is the sole migration, it
  is also the migration that established the `users` table — there is **no earlier
  migration** for `users`.
- The live `payments` table has `amount` as **`int`** (NOT a `Decimal`). There is
  **no pre-existing `payments` table with a Decimal amount** to reconcile.
- Live schema matches the migration SQL exactly (unique `payments_providerOrderId_key`,
  `payments_userId_idx`, `payments_status_idx`, FK `payments_userId_fkey` →
  `users.id` cascade; unique `users_email_key`).
- `npx prisma migrate status` → **"Database schema is up to date!"**

**Migration strategy: none.** The schema, generated client, migration SQL, and live
database already agree. Re-applying would fail (`users`/`payments` already exist),
so the migration was deliberately **not** re-applied. No `migrate reset`, `db push`,
or destructive sync was used. Existing data preserved.

## POST /api/payments/create-order

**Request** — `POST {API_PREFIX}/payments/create-order` with header
`Authorization: Bearer <jwt>`

```json
{
  "amount": 1000,
  "currency": "USD",
  "description": "Development test payment"
}
```

> Adapted to project conventions and now secured:
> - `currency` defaults to `config.payment.currency` (`USD`) and is the **only**
>   supported currency (`CURRENCY_VALUES = ['USD']`).
> - `amount` must be one of the server-configured allowlisted values
>   (`PAYMENT_ALLOWED_AMOUNTS`, default `1000,2500,5000,10000` minor units).
> - `userId` is **optional and ignored for identity** — the owner is the
>   authenticated user from the token. A `userId` that differs from the token
>   subject is rejected with `403 USER_MISMATCH`.
> - The task's `INR` example is intentionally rejected as an unsupported currency.

**Success** — `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "cuid...",
    "providerOrderId": "mock_<uuid>",
    "amount": 1000,
    "currency": "USD",
    "status": "PENDING",
    "provider": "mock",
    "description": "Development test payment",
    "userId": "<authenticated-user-id>",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Validation & authorization flow** (`createPaymentOrder` + route):

1. `authenticate` middleware — valid Bearer JWT required, else `401 UNAUTHORIZED`.
2. Zod parse (`createOrderRequestSchema`) — `amount` a positive safe integer in
   `[1, 1_000_000]`; `currency` a 3-letter string; `description` optional, ≤200
   chars. Failure → `400 VALIDATION_ERROR`.
3. User-mismatch guard — body `userId` (if any) must equal `req.user.id`, else
   `403 USER_MISMATCH`.
4. Amount allowlist (`isAllowedTestAmount`) → `400 AMOUNT_NOT_ALLOWED` if not listed.
5. Currency check (`params.currency === config.payment.currency`) →
   `400 CURRENCY_NOT_SUPPORTED`.
6. User existence (`prisma.user.findUnique`) → `404 NOT_FOUND` if missing.
7. Provider availability (`provider.isAvailable()`) → `503 PAYMENT_PROVIDER_UNAVAILABLE`
   when mock mode is off (including all of production).
8. `provider.createOrder()` builds the mock order (`PENDING`).
9. `prisma.payment.create(...)` persists the record with `status: 'PENDING'` and
   `userId = req.user.id`.
10. Returns the persisted `Payment`; the route responds `201` with `{ success: true, data }`.

**Error responses** (centralized `errorHandler`, no stack traces/secrets):

| Condition | HTTP | `error.code` |
|-----------|------|--------------|
| Missing/malformed/invalid/expired token | 401 | `UNAUTHORIZED` |
| JWT secret not configured (production) | 503 | `AUTH_MISCONFIGURED` |
| Body `userId` differs from authenticated user | 403 | `USER_MISMATCH` |
| Zod validation failure (bad type/value, malformed currency) | 400 | `VALIDATION_ERROR` |
| Amount outside the allowlist | 400 | `AMOUNT_NOT_ALLOWED` |
| Unsupported currency | 400 | `CURRENCY_NOT_SUPPORTED` |
| User does not exist | 404 | `NOT_FOUND` |
| Mock mode disabled / production | 503 | `PAYMENT_PROVIDER_UNAVAILABLE` |
| Duplicate `providerOrderId` (Prisma `P2002`) | 409 | `DUPLICATE_PAYMENT_ORDER` |
| Unexpected DB/insert failure | 500 | `INTERNAL_ERROR` |

## Failure handling (provider order succeeds, DB insert fails)

The sequence is provider-order → DB-insert inside one `try`. If the DB insert fails:

- `Prisma.PrismaClientKnownRequestError` with code `P2002` → `409 DUPLICATE_PAYMENT_ORDER`.
- Any other error is logged server-side (`console.error`) and rethrown as
  `AppError.internal(...)` → `500 INTERNAL_ERROR`; the client sees only the generic message.
- `AppError` instances are rethrown unchanged.

The mock provider has no cancel/rollback method in `IPaymentProvider`, so none is
called — consistent with the existing provider interface and acceptable for an
in-memory learning mock. Each request resolves a **fresh** `MockProvider` (the
route calls `createPaymentOrder(...)` with the default `getPaymentProvider()`), so
an orphaned in-memory order is garbage-collected with its instance and cannot leak
into later requests. No external infrastructure or saga/compensation machinery was
introduced.

## Existing functionality reused without modification

- Part 1 payment module: `IPaymentProvider`, `MockProvider`, `getPaymentProvider`,
  `createOrderRequestSchema`, `isAllowedTestAmount`, `config.payment`, `mockGuard`.
- `asyncHandler`, `errorHandler`/`AppError`, `notFoundHandler`, `requestLogger`.
- `prisma` client singleton (`apps/api/src/db/prisma.ts`).
- `bcryptjs` (already a dependency) — now reused for password verification in login.
- `GET /api/health` and `GET /api/health/ready` (unchanged, still functional).
- `User` model and seed data (unchanged).

## Files created or modified in this pass

**Created**
- `apps/api/src/utils/jwt.ts` — dependency-free HS256 JWT sign/verify.
- `apps/api/src/middleware/auth.ts` — `authenticate` middleware + `AuthenticatedUser` type + `Express.Request` augmentation.
- `apps/api/src/services/validation/auth.ts` — `loginRequestSchema`.
- `apps/api/src/services/auth/AuthService.ts` — `login` (bcrypt verify + JWT issue).
- `apps/api/src/services/auth/index.ts` — barrel export.
- `apps/api/src/routes/auth.ts` — `POST /api/auth/login`.

**Modified**
- `apps/api/src/config/index.ts` — added `jwtSecret` and `jwtSecretIsDefault`.
- `apps/api/src/middleware/index.ts` — re-export `authenticate` and `AuthenticatedUser`.
- `apps/api/src/routes/index.ts` — mount `/auth` router.
- `apps/api/src/routes/payments.ts` — apply `authenticate`; derive `userId` from the token; reject mismatched body `userId` with `403`.
- `apps/api/src/services/validation/payment.ts` — `userId` is now optional and never trusted for identity.
- `apps/api/.env.example` — documented `JWT_SECRET` (commented placeholder, no real secret).

## Verification results

| Check | Command | Result |
|-------|---------|--------|
| API typecheck | `pnpm --filter @payment/api typecheck` (`tsc --noEmit`) | **PASS** (exit 0) |
| API lint | `pnpm --filter @payment/api lint` (`eslint .`) | **30 errors, all pre-existing**; **0 errors in any new/modified Part 1/2 file** |
| Prisma schema validation | `npx prisma validate` | **valid** |
| Prisma client generation | `npx prisma generate` | **EPERM** — Windows file lock on `query_engine-windows.dll.node` (multiple `node.exe` processes running). Client was already generated from a prior run (typecheck passes); regeneration is only needed if the schema changes. |
| Migration status | `npx prisma migrate status` | **Database schema is up to date!** |
| DB connectivity | read-only `mysql2` query against `.env` `DATABASE_URL` | **OK** |

Lint breakdown (pre-existing, not introduced by Part 1 or 2): 19 errors from
`dist/**` and `eslint.config.js` (flat-config `ignores` does not exclude them from
typed linting) and 11 errors across 6 untouched source files (`app.ts`, `index.ts`,
`errorHandler.ts`, `requestLogger.ts`, `health.ts`, `seed.ts`) — all
`consistent-type-imports`, `require-await`, or `no-misused-promises`. 19 + 11 = 30.

### End-to-end verification (real database, one-off run)

A temporary supertest script (since deleted — no test files were committed, per the
"skip writing test cases" instruction) exercised the **real** Express app against
the **real** MySQL database. Results:

| Scenario | Result |
|----------|--------|
| `GET /api/health` | `200`, `database: connected` |
| `GET /api/health/ready` | `200`, `status: ready` |
| `POST /api/auth/login` (valid credentials) | `200`, JWT issued |
| `POST /api/auth/login` (wrong password) | `401 UNAUTHORIZED` |
| `POST /api/auth/login` (unknown email) | `401 UNAUTHORIZED` (identical message — no user enumeration) |
| `POST /api/payments/create-order` (no token) | `401 UNAUTHORIZED` |
| `POST /api/payments/create-order` (valid token, allowlisted amount) | `201`, `status: PENDING`, `userId` = authenticated user |
| DB read-back of created payment | persisted, `status = PENDING`, `userId` matches the authenticated user |
| `POST /api/payments/create-order` (tampered token) | `401 UNAUTHORIZED` |
| `POST /api/payments/create-order` (authenticated as A, body `userId` = B) | **`403 USER_MISMATCH`** |
| `POST /api/payments/create-order` (amount `999`, not allowlisted) | `400 AMOUNT_NOT_ALLOWED` |
| `POST /api/payments/create-order` (currency `INR`) | `400 CURRENCY_NOT_SUPPORTED` |
| `POST /api/payments/create-order` (amount as string) | `400 VALIDATION_ERROR` |
| Cleanup | test-created payment deleted; `payments` count returned to the original 7 (seed data intact) |

**Persistence was verified against the real database** (not a mocked Prisma client):
the created record was read back via `prisma.payment.findUnique` and confirmed
`PENDING` and owned by the authenticated user, then cleaned up.

## Remaining work / notes

1. **Automated tests are not committed.** Per the "skip writing test cases"
   instruction, no `*.test.ts` files or `test` npm script were added. The
   verification above was a one-off manual run against the real database. A
   permanent Vitest suite (devDependency already present) should be added later to
   lock in these behaviors.
2. **`prisma generate` EPERM** is an environment blocker (Windows file lock from
   running `node.exe` processes), not a code defect; close running processes / the
   dev server and re-run `pnpm db:generate` if regeneration is ever required. The
   already-generated client is sufficient for current typecheck.
3. **README discrepancy (pre-existing, unrelated):** `README.md` documents
   `GET /api/ready`, but the readiness route is mounted under the health router, so
   the actual path is `GET /api/health/ready` (verified `200`). This predates Part
   2 and was left untouched to avoid modifying unrelated modules.

## Git/work preservation

No `git reset`, `git clean`, `git checkout`, or destructive database command was run.
The `.env` file was read but never modified or exposed (only env-var **names** are
referenced above; secrets are not included). All pre-existing modified and untracked
files remain intact. The only database mutation was a single payment row created and
then deleted by the one-off verification run, leaving the seeded data unchanged.
