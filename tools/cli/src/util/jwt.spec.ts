import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signJwt } from './jwt';

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

describe('signJwt', () => {
  it('produces a verifiable HS256 token with the expected claims', () => {
    const token = signJwt({ sub: 'u1', role: 'MANAGER', gym: 'demo' }, 'secret', {
      issuedAt: 1_000,
      expiresInSeconds: 3600,
      issuer: 'fit',
    });

    const [header, payload, signature] = token.split('.');
    expect(decodeSegment(header!)).toEqual({ alg: 'HS256', typ: 'JWT' });

    const claims = decodeSegment(payload!);
    expect(claims).toMatchObject({
      sub: 'u1',
      role: 'MANAGER',
      gym: 'demo',
      iat: 1_000,
      exp: 4_600,
      iss: 'fit',
    });

    // Signature verifies against the signing input with the same secret.
    const expected = createHmac('sha256', 'secret')
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(signature).toBe(expected);
  });

  it('omits iss when no issuer is given and defaults the lifetime', () => {
    const token = signJwt({ sub: 'u1' }, 'secret', { issuedAt: 0 });
    const claims = decodeSegment(token.split('.')[1]!);
    expect(claims.iss).toBeUndefined();
    expect(claims.exp).toBe(3600);
  });
});
