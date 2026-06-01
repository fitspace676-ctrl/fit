import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

// Mock the frozen env singleton so APPLE_CLIENT_IDS is controllable per test.
const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { AppleOAuthService } from './apple-oauth.service';

const CLIENT_ID = 'com.fit.app';
const KID = 'test-key-1';

/** Base64url-encode a buffer or string (no padding). */
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

let privateKey: KeyObject;
let jwk: Record<string, unknown>;

/** Mint an Apple-style RS256 ID token signed by the test key. */
function signToken(claims: Record<string, unknown>, opts: { kid?: string } = {}): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: opts.kid ?? KID }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

/** Default valid claims; override per test. */
function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://appleid.apple.com',
    aud: CLIENT_ID,
    sub: 'apple-sub-123',
    email: 'User@Example.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

/** A `fetch` stub returning the test JWKS with an hour-long cache lifetime. */
function jwksFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'cache-control': 'public, max-age=3600' },
      }),
    ),
  );
}

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey;
  jwk = { ...(pair.publicKey.export({ format: 'jwk' }) as object), kid: KID, alg: 'RS256' };
});

describe('AppleOAuthService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    for (const key of Object.keys(mockEnv)) delete mockEnv[key];
    mockEnv.APPLE_CLIENT_IDS = CLIENT_ID;
    fetchMock = jwksFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('isConfigured reflects whether APPLE_CLIENT_IDS is set', () => {
    expect(new AppleOAuthService().isConfigured).toBe(true);
    delete mockEnv.APPLE_CLIENT_IDS;
    expect(new AppleOAuthService().isConfigured).toBe(false);
  });

  it('verifies a valid token and returns the normalised profile', async () => {
    const token = signToken(validClaims());

    const profile = await new AppleOAuthService().verifyIdToken(token);

    expect(profile).toEqual({
      appleId: 'apple-sub-123',
      email: 'user@example.com', // lower-cased
      emailVerified: true,
    });
  });

  it('treats a string email_verified as verified', async () => {
    const token = signToken(validClaims({ email_verified: 'true' }));

    const profile = await new AppleOAuthService().verifyIdToken(token);

    expect(profile.emailVerified).toBe(true);
  });

  it('returns an undefined email when Apple omits it (returning sign-in)', async () => {
    const token = signToken(validClaims({ email: undefined, email_verified: undefined }));

    const profile = await new AppleOAuthService().verifyIdToken(token);

    expect(profile).toEqual({
      appleId: 'apple-sub-123',
      email: undefined,
      emailVerified: false,
    });
  });

  it('matches the audience against any configured client id', async () => {
    mockEnv.APPLE_CLIENT_IDS = ` com.fit.app.web , ${CLIENT_ID} `;
    const token = signToken(validClaims());

    await expect(new AppleOAuthService().verifyIdToken(token)).resolves.toMatchObject({
      appleId: 'apple-sub-123',
    });
  });

  it('reports emailVerified:false without throwing (the service layer decides)', async () => {
    const token = signToken(validClaims({ email_verified: false }));

    const profile = await new AppleOAuthService().verifyIdToken(token);

    expect(profile.emailVerified).toBe(false);
  });

  it('throws 503 when APPLE_CLIENT_IDS is unset', async () => {
    delete mockEnv.APPLE_CLIENT_IDS;
    const token = signToken(validClaims());

    await expect(new AppleOAuthService().verifyIdToken(token)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects a token whose audience is not a configured client id', async () => {
    const token = signToken(validClaims({ aud: 'com.attacker.app' }));

    await expectAppleTokenInvalid(token);
  });

  it('rejects a token from an unexpected issuer', async () => {
    const token = signToken(validClaims({ iss: 'https://accounts.google.com' }));

    await expectAppleTokenInvalid(token);
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = signToken(validClaims({ exp: past, iat: past - 3600 }));

    await expectAppleTokenInvalid(token);
  });

  it('rejects a token signed by a different (unknown) key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const real = privateKey;
    privateKey = other.privateKey; // sign with a key absent from the JWKS
    const token = signToken(validClaims());
    privateKey = real;

    await expectAppleTokenInvalid(token);
  });

  it('rejects a token whose signature has been tampered with', async () => {
    const token = signToken(validClaims());
    const tampered = `${token.slice(0, -3)}aaa`;

    await expectAppleTokenInvalid(tampered);
  });

  it('rejects a non-RS256 algorithm', async () => {
    // Hand-craft an alg:none token (no signature) — must never be trusted.
    const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID }));
    const payload = base64url(JSON.stringify(validClaims()));
    const token = `${header}.${payload}.`;

    await expectAppleTokenInvalid(token);
  });

  it('rejects a structurally malformed token', async () => {
    await expectAppleTokenInvalid('not-a-jwt');
  });

  it('rejects a token missing the sub claim', async () => {
    const token = signToken(validClaims({ sub: undefined }));

    await expectAppleTokenInvalid(token);
  });

  it('rejects when the kid is unknown to the JWKS', async () => {
    const token = signToken(validClaims(), { kid: 'unknown-kid' });

    await expectAppleTokenInvalid(token);
  });

  it('caches the JWKS across calls (one fetch for two verifications)', async () => {
    const service = new AppleOAuthService();
    await service.verifyIdToken(signToken(validClaims()));
    await service.verifyIdToken(signToken(validClaims()));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/** Assert a token is rejected with the single 401 APPLE_TOKEN_INVALID. */
async function expectAppleTokenInvalid(token: string): Promise<void> {
  const error = await new AppleOAuthService().verifyIdToken(token).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).getResponse()).toMatchObject({
    code: 'APPLE_TOKEN_INVALID',
  });
}
