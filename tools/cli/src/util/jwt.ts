import { createHmac } from 'node:crypto';

/** Base64url-encode a buffer (no padding) per RFC 7515. */
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface JwtClaims {
  [claim: string]: unknown;
}

export interface SignOptions {
  /** Token lifetime in seconds (default 1 hour). */
  expiresInSeconds?: number;
  /** `iss` claim. */
  issuer?: string;
  /** Unix seconds for `iat`; injectable so signing is deterministic in tests. */
  issuedAt?: number;
}

/**
 * Mint an HS256 JWT using Node's built-in crypto — no `jsonwebtoken`
 * dependency. The API signs its tokens the same way, so a token minted here
 * with the shared `JWT_SECRET` authenticates against protected endpoints.
 */
export function signJwt(claims: JwtClaims, secret: string, options: SignOptions = {}): string {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresInSeconds ?? 3600;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtClaims = {
    ...claims,
    iat: issuedAt,
    exp: issuedAt + expiresIn,
    ...(options.issuer ? { iss: options.issuer } : {}),
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64url(createHmac('sha256', secret).update(signingInput).digest());

  return `${signingInput}.${signature}`;
}
