# Part 1 — Payment Module Architecture & Foundation

Status: **Complete** (awaiting review before Part 2)

## Summary

Part 1 establishes the payment module boundaries and safe mock-mode configuration for the existing pnpm monorepo (`apps/api`, `apps/web`, `packages/shared-types`). It adds no database models, API routes, migrations, or frontend changes — only configuration, validation schemas, a provider interface with a basic in-memory mock provider, and a mock-mode guard middleware.

Key properties:

- **Mock mode fails closed**: `mockMode` is `true` only when `PAYMENT_MOCK_MODE=true` is explicitly set **and** `NODE_ENV` is not `production`. In production it is always `false`, even if the env var is set.
- **Integer minor units**: monetary amounts are validated as safe integers (cents) within a bounded range (1–1,000,000).
- **Server-controlled amount allowlist**: `PAYMENT_ALLOWED_AMOUNTS` (minor units) acts as the test-amount allowlist until real pricing rules exist.
- **Provider-agnostic core**: `IPaymentProvider` has no Express or Prisma imports; a factory (`getPaymentProvider`) is the single seam where Razorpay will be plugged in later.
- **Health API preserved**: `GET /api/health` and `GET /api/ready` are untouched; `mockGuard` is a standalone middleware, not globally registered.

## Architecture

```
apps/api/src/
├── config/index.ts                     # payment config (fail-closed mock mode)
├── utils/amount.ts                     # minor-unit validation helpers
├── middleware/
│   ├── mockGuard.ts                    # blocks mock simulation routes when disabled
│   └── index.ts                        # barrel export
└── services/
    ├── validation/payment.ts           # Zod request schemas + amount allowlist
    └── payment/
        ├── index.ts                    # barrel export
        └── provider/
            ├── IPaymentProvider.ts     # minimal provider interface
            ├── MockProvider.ts         # in-memory mock structure
            └── index.ts                # provider factory
```

## Files

| File | Explanation |
|------|-------------|
| `apps/api/src/config/index.ts` | Extends existing config with a `payment` block: `provider`, `mockMode`, `allowedAmounts`, `currency`. Invalid env values fall back to safe defaults; mock mode requires explicit opt-in and is force-disabled in production. |
| `apps/api/src/utils/amount.ts` | Defines `MIN/MAX_AMOUNT_MINOR_UNITS` and `isValidMinorUnitAmount()` (positive safe integer within range). |
| `apps/api/src/middleware/mockGuard.ts` | Express middleware that rejects with 403 when `config.payment.mockMode` is false; intended only for the future `POST /api/payments/:id/simulate` route. |
| `apps/api/src/middleware/index.ts` | Barrel export; now re-exports `mockGuard` alongside existing middleware. |
| `apps/api/src/services/validation/payment.ts` | Zod schemas for create-order (integer minor-unit amount, 3-letter currency, optional description, userId) and simulate (enum of three events), plus `isAllowedTestAmount()` allowlist check. |
| `apps/api/src/services/payment/provider/IPaymentProvider.ts` | Minimal provider contract (`name`, `isAvailable`, `createOrder`, `getOrder`, `simulateEvent`) using integer minor units; independent of Express and Prisma. |
| `apps/api/src/services/payment/provider/MockProvider.ts` | In-memory mock: `createOrder` always returns `PENDING`; `simulateEvent` maps the three events to terminal states, rejects terminal transitions (409), and refuses when mock mode is off. |
| `apps/api/src/services/payment/provider/index.ts` | `getPaymentProvider()` factory that selects the provider from config — the extension point for Razorpay. |
| `apps/api/src/services/payment/index.ts` | Barrel export for the payment service layer. |
| `apps/api/.env.example` | Placeholder payment variables only (`PAYMENT_MOCK_MODE`, `PAYMENT_PROVIDER`, `PAYMENT_ALLOWED_AMOUNTS`, `PAYMENT_CURRENCY`); `.env` was not modified. |
| `apps/api/package.json`, `pnpm-lock.yaml` | Added `typescript-eslint@^7.18.0` devDependency — it was imported by the committed `eslint.config.js` but never declared, so `pnpm lint` could not load the config at all. |

## Verification

- **typecheck**: `pnpm --filter @payment/api typecheck` — **pass**.
- **lint**: 30 errors, **all pre-existing** (19 in `dist/` + `eslint.config.js` due to broken flat-config ignores; 10 across 6 untouched source files). Zero errors in new/modified files. The pre-existing failures need a project-wide lint-config decision, deferred to Part 5.
- **Runtime scenarios** (all passed):
  1. Defaults — mock off, order stays `PENDING`, simulation rejected.
  2. `PAYMENT_MOCK_MODE=true` in development — full flow works; terminal-state transition rejected with 409.
  3. `NODE_ENV=production` + `PAYMENT_MOCK_MODE=true` — still fails closed.
  4. Invalid env values (bad allowlist entries, unsupported provider/currency) — safe defaults applied.

## Deferred to later parts

- Part 2: Prisma persistence + `POST /api/payments/create-order`.
- Part 3: status simulation endpoint and safe state transitions.
- Part 4: React/TanStack Query v5 frontend flow.
- Part 5: edge-case tests, security review, lint-config cleanup, documentation.
