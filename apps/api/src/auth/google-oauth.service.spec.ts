import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

// Mock the frozen env singleton so GOOGLE_CLIENT_IDS is controllable per test.
const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { GoogleOAuthService } from './google-oauth.service';

const CLIENT_ID = 'web-client.apps.googleusercontent.com';
const KID = 'test-key-1';

/** Base64url-encode a buffer or string (no padding). */
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

let privateKey: KeyObject;
let jwk: Record<string, unknown>;

/** Mint a Google-style RS256 ID token signed by the test key. */
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
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-123',
    email: 'User@Example.com',
    email_verified: true,
    name: 'Sam',
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

describe('GoogleOAuthService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    for (const key of Object.keys(mockEnv)) delete mockEnv[key];
    mockEnv.GOOGLE_CLIENT_IDS = CLIENT_ID;
    fetchMock = jwksFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('isConfigured reflects whether GOOGLE_CLIENT_IDS is set', () => {
    expect(new GoogleOAuthService().isConfigured).toBe(true);
    delete mockEnv.GOOGLE_CLIENT_IDS;
    expect(new GoogleOAuthService().isConfigured).toBe(false);
  });

  it('verifies a valid token and returns the normalised profile', async () => {
    const token = signToken(validClaims());

    const profile = await new GoogleOAuthService().verifyIdToken(token);

    expect(profile).toEqual({
      googleId: 'google-sub-123',
      email: 'user@example.com', // lower-cased
      emailVerified: true,
      name: 'Sam',
    });
  });

  it('accepts the bare accounts.google.com issuer and a string email_verified', async () => {
    const token = signToken(validClaims({ iss: 'accounts.google.com', email_verified: 'true' }));

    const profile = await new GoogleOAuthService().verifyIdToken(token);

    expect(profile.emailVerified).toBe(true);
  });

  it('matches the audience against any configured client id', async () => {
    mockEnv.GOOGLE_CLIENT_IDS = ` other-client , ${CLIENT_ID} `;
    const token = signToken(validClaims());

    await expect(new GoogleOAuthService().verifyIdToken(token)).resolves.toMatchObject({
      googleId: 'google-sub-123',
    });
  });

  it('reports emailVerified:false without throwing (the service layer decides)', async () => {
    const token = signToken(validClaims({ email_verified: false }));

    const profile = await new GoogleOAuthService().verifyIdToken(token);

    expect(profile.emailVerified).toBe(false);
  });

  it('throws 503 when GOOGLE_CLIENT_IDS is unset', async () => {
    delete mockEnv.GOOGLE_CLIENT_IDS;
    const token = signToken(validClaims());

    await expect(new GoogleOAuthService().verifyIdToken(token)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects a token whose audience is not a configured client id', async () => {
    const token = signToken(validClaims({ aud: 'attacker-client.apps.googleusercontent.com' }));

    await expectGoogleTokenInvalid(token);
  });

  it('rejects a token from an unexpected issuer', async () => {
    const token = signToken(validClaims({ iss: 'https://evil.example.com' }));

    await expectGoogleTokenInvalid(token);
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = signToken(validClaims({ exp: past, iat: past - 3600 }));

    await expectGoogleTokenInvalid(token);
  });

  it('rejects a token signed by a different (unknown) key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const real = privateKey;
    privateKey = other.privateKey; // sign with a key absent from the JWKS
    const token = signToken(validClaims());
    privateKey = real;

    await expectGoogleTokenInvalid(token);
  });

  it('rejects a token whose signature has been tampered with', async () => {
    const token = signToken(validClaims());
    const tampered = `${token.slice(0, -3)}aaa`;

    await expectGoogleTokenInvalid(tampered);
  });

  it('rejects a non-RS256 algorithm', async () => {
    // Hand-craft an alg:none token (no signature) — must never be trusted.
    const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID }));
    const payload = base64url(JSON.stringify(validClaims()));
    const token = `${header}.${payload}.`;

    await expectGoogleTokenInvalid(token);
  });

  it('rejects a structurally malformed token', async () => {
    await expectGoogleTokenInvalid('not-a-jwt');
  });

  it('rejects when the kid is unknown to the JWKS', async () => {
    const token = signToken(validClaims(), { kid: 'unknown-kid' });

    await expectGoogleTokenInvalid(token);
  });

  it('caches the JWKS across calls (one fetch for two verifications)', async () => {
    const service = new GoogleOAuthService();
    await service.verifyIdToken(signToken(validClaims()));
    await service.verifyIdToken(signToken(validClaims()));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/** Assert a token is rejected with the single 401 GOOGLE_TOKEN_INVALID. */
async function expectGoogleTokenInvalid(token: string): Promise<void> {
  const error = await new GoogleOAuthService().verifyIdToken(token).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).getResponse()).toMatchObject({
    code: 'GOOGLE_TOKEN_INVALID',
  });
}
