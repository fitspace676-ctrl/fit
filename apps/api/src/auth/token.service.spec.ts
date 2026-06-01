import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { TokenService, hashRefreshToken } from './token.service';
import type { PrismaService } from '../prisma/prisma.service';

const FULL_ENV = {
  JWT_SECRET: 'test-secret',
  JWT_ISSUER: 'fit',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 2_592_000,
};

function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, FULL_ENV, overrides);
}

/** Decode a base64url JWT segment back to JSON. */
function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function setup() {
  const refreshToken = {
    create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(() =>
      Promise.resolve({ id: 'rt-1' }),
    ),
  };
  const prisma = { client: { refreshToken } } as unknown as PrismaService;
  return { service: new TokenService(prisma), refreshToken };
}

describe('TokenService', () => {
  beforeEach(() => configure());
  afterEach(() => vi.clearAllMocks());

  describe('signAccessToken', () => {
    it('mints an HS256 JWT with sub/type/iss claims and a valid signature', () => {
      const { service } = setup();

      const token = service.signAccessToken('user-1', 1_000);
      const [header, payload, signature] = token.split('.');

      expect(decodeSegment(header!)).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(decodeSegment(payload!)).toEqual({
        sub: 'user-1',
        type: 'access',
        iat: 1_000,
        exp: 1_900,
        iss: 'fit',
      });

      const expected = createHmac('sha256', 'test-secret')
        .update(`${header}.${payload}`)
        .digest('base64url');
      expect(signature).toBe(expected);
    });

    it('throws ServiceUnavailable when JWT_SECRET is unset', () => {
      configure({ JWT_SECRET: undefined });
      const { service } = setup();
      expect(() => service.signAccessToken('user-1')).toThrow(ServiceUnavailableException);
    });
  });

  describe('issueTokenPair', () => {
    it('signs an access token and persists a hashed refresh token with its own family', async () => {
      const { service, refreshToken } = setup();

      const pair = await service.issueTokenPair('user-1', 'device-xyz');

      expect(pair.accessToken.split('.')).toHaveLength(3);
      expect(pair.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);

      const { data } = refreshToken.create.mock.calls[0]![0];
      expect(data.userId).toBe('user-1');
      expect(data.deviceFingerprint).toBe('device-xyz');
      // Only the hash is persisted — never the plaintext refresh secret.
      expect(data.tokenHash).toBe(hashRefreshToken(pair.refreshToken));
      expect(data.tokenHash).not.toBe(pair.refreshToken);
      expect(typeof data.familyId).toBe('string');
      expect(data.expiresAt).toBeInstanceOf(Date);
    });

    it('throws ServiceUnavailable (and persists nothing) when unconfigured', async () => {
      configure({ JWT_SECRET: undefined });
      const { service, refreshToken } = setup();

      await expect(service.issueTokenPair('user-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
