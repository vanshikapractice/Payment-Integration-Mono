import { createHmac, timingSafeEqual } from 'node:crypto';

const JWT_ALGORITHM = 'HS256';

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function hmacSha256(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number
): string {
  const header = { alg: JWT_ALGORITHM, typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: issuedAt, exp: issuedAt + expiresInSeconds };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claims)
  )}`;
  const signature = base64UrlEncode(hmacSha256(secret, signingInput));

  return `${signingInput}.${signature}`;
}

export function verifyJwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('malformed token');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = hmacSha256(secret, signingInput);
  const providedSignature = base64UrlDecode(encodedSignature);

  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    throw new Error('invalid token signature');
  }

  const header = JSON.parse(
    base64UrlDecode(encodedHeader).toString('utf8')
  ) as { alg?: string };
  if (header.alg !== JWT_ALGORITHM) {
    throw new Error('unsupported token algorithm');
  }

  const payload = JSON.parse(
    base64UrlDecode(encodedPayload).toString('utf8')
  ) as Record<string, unknown>;

  // A token is only valid when it carries a non-empty subject (the user id)
  // and a numeric expiry claim. Tokens without either claim are rejected.
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('token missing subject');
  }

  if (typeof payload.exp !== 'number') {
    throw new Error('token missing expiry claim');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error('token expired');
  }

  return payload;
}
