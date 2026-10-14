import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from '@/utils/jwt';

const SECRET = 'unit-test-secret-that-is-long-enough-32';

function craftToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret: string
): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
}

describe('verifyJwt', () => {
  it('verifies a valid token and returns its payload', () => {
    const token = signJwt({ sub: 'user-1', email: 'a@b.c' }, SECRET, 60);
    const payload = verifyJwt(token, SECRET);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.c');
    expect(typeof payload.exp).toBe('number');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET, 60);
    expect(() =>
      verifyJwt(token, 'a-different-secret-that-is-long-enough')
    ).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET, -1);
    expect(() => verifyJwt(token, SECRET)).toThrow(/expired/i);
  });

  it('rejects a token without an expiry claim', () => {
    const token = craftToken(
      { alg: 'HS256', typ: 'JWT' },
      { sub: 'user-1' },
      SECRET
    );
    expect(() => verifyJwt(token, SECRET)).toThrow(/expiry/i);
  });

  it('rejects a token without a subject', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = craftToken(
      { alg: 'HS256', typ: 'JWT' },
      { exp: now + 60 },
      SECRET
    );
    expect(() => verifyJwt(token, SECRET)).toThrow(/subject/i);
  });

  it('rejects a malformed token with the wrong number of segments', () => {
    expect(() => verifyJwt('not-a-jwt', SECRET)).toThrow();
  });

  it('rejects a token that uses an unsupported algorithm', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = craftToken(
      { alg: 'none', typ: 'JWT' },
      { sub: 'user-1', exp: now + 60 },
      SECRET
    );
    expect(() => verifyJwt(token, SECRET)).toThrow(/algorithm/i);
  });
});
