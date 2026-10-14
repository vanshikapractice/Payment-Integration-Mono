process.env.NODE_ENV ??= 'test';
process.env.PAYMENT_MOCK_MODE ??= 'true';
// Keep the integration-test login rate limit high so the
// request-level limiter never interferes with test traffic.
// The limiter itself is unit-tested with a small limit.
process.env.RATE_LIMIT_MAX ??= '1000';
