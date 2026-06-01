import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { Role } from '@fit/db';
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

/** Current time in whole seconds — for building tokens with explicit exp claims. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** A persisted refresh-token row, as `findUnique` would return it. */
interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  deviceFingerprint: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

function storedToken(overrides: Partial<StoredRefreshToken> = {}): StoredRefreshToken {
  return {
    id: 'rt-1',
    userId: 'user-1',
    familyId: 'fam-1',
    deviceFingerprint: 'device-xyz',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function setup() {
  const refreshToken = {
    create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(() =>
      Promise.resolve({ id: 'rt-new' }),
    ),
    findUnique: vi.fn<(args: unknown) => Promise<StoredRefreshToken | null>>(() =>
      Promise.resolve(null),
    ),
    updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 1 }),
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

  describe('verifyAccessToken', () => {
    it('round-trips a token minted by signAccessToken and returns its claims', () => {
      const { service } = setup();
      const token = service.signAccessToken('user-1');

      const claims = service.verifyAccessToken(token);

      expect(claims.sub).toBe('user-1');
      expect(claims.type).toBe('access');
      expect(claims.iss).toBe('fit');
    });

    it('accepts a CLI-style token carrying role + gym claims and no type', () => {
      const { service } = setup();
      // Mint the way the `fit token` CLI does: { sub, role, gym }, no `type`.
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({ sub: 'u-1', role: 'MANAGER', gym: 'gym-a', exp: nowSeconds() + 60 }),
      ).toString('base64url');
      const signature = createHmac('sha256', 'test-secret')
        .update(`${header}.${payload}`)
        .digest('base64url');

      const claims = service.verifyAccessToken(`${header}.${payload}.${signature}`);

      expect(claims.sub).toBe('u-1');
      expect(claims.role).toBe('MANAGER');
      expect(claims.gym).toBe('gym-a');
    });

    it('rejects a token signed with the wrong secret', () => {
      const { service } = setup();
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(JSON.stringify({ sub: 'u-1' })).toString('base64url');
      const forged = createHmac('sha256', 'other-secret')
        .update(`${header}.${payload}`)
        .digest('base64url');

      expect(() => service.verifyAccessToken(`${header}.${payload}.${forged}`)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', () => {
      const { service } = setup();
      const token = service.signAccessToken('user-1', nowSeconds() - 10_000);
      expect(() => service.verifyAccessToken(token)).toThrow(UnauthorizedException);
    });

    it('rejects a non-access token type so a refresh JWT cannot be replayed', () => {
      const { service } = setup();
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({ sub: 'u-1', type: 'refresh', exp: nowSeconds() + 60 }),
      ).toString('base64url');
      const signature = createHmac('sha256', 'test-secret')
        .update(`${header}.${payload}`)
        .digest('base64url');

      expect(() => service.verifyAccessToken(`${header}.${payload}.${signature}`)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a malformed token', () => {
      const { service } = setup();
      expect(() => service.verifyAccessToken('not-a-jwt')).toThrow(UnauthorizedException);
    });

    it('throws ServiceUnavailable when JWT_SECRET is unset', () => {
      configure({ JWT_SECRET: undefined });
      const { service } = setup();
      expect(() => service.verifyAccessToken('a.b.c')).toThrow(ServiceUnavailableException);
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

  describe('rotateRefreshToken', () => {
    it('spends the presented token and mints a successor in the same family', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(storedToken());

      const pair = await service.rotateRefreshToken('presented-secret');

      // Looked up by the presented token's hash, never its plaintext.
      const lookup = refreshToken.findUnique.mock.calls[0]![0] as { where: { tokenHash: string } };
      expect(lookup.where.tokenHash).toBe(hashRefreshToken('presented-secret'));

      // The presented row was revoked, guarded on it still being unrevoked.
      const spend = refreshToken.updateMany.mock.calls[0]![0] as {
        where: { id: string; revokedAt: null };
        data: { revokedAt: Date };
      };
      expect(spend.where).toEqual({ id: 'rt-1', revokedAt: null });
      expect(spend.data.revokedAt).toBeInstanceOf(Date);

      // A fresh access token plus a successor refresh token in the same family.
      expect(pair.accessToken.split('.')).toHaveLength(3);
      const { data } = refreshToken.create.mock.calls[0]![0];
      expect(data.familyId).toBe('fam-1');
      expect(data.userId).toBe('user-1');
      expect(data.tokenHash).toBe(hashRefreshToken(pair.refreshToken));
    });

    it('rejects (and revokes the whole family) when an already-spent token is replayed', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(storedToken({ revokedAt: new Date() }));

      const error = await service.rotateRefreshToken('reused-secret').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'REFRESH_TOKEN_INVALID',
      });
      // The family was revoked and no successor minted.
      const familyRevoke = refreshToken.updateMany.mock.calls[0]![0] as { where: unknown };
      expect(familyRevoke.where).toEqual({ familyId: 'fam-1', revokedAt: null });
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes the family when it loses the rotate race (zero rows spent)', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(storedToken());
      refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      const error = await service.rotateRefreshToken('raced-secret').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      // First updateMany was the spend attempt; second is the family revoke.
      const familyRevoke = refreshToken.updateMany.mock.calls[1]![0] as { where: unknown };
      expect(familyRevoke.where).toEqual({ familyId: 'fam-1', revokedAt: null });
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown token without touching any family', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotateRefreshToken('nope')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(service.rotateRefreshToken('expired')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailable when unconfigured, before any DB work', async () => {
      configure({ JWT_SECRET: undefined });
      const { service, refreshToken } = setup();

      await expect(service.rotateRefreshToken('x')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes the presented token family', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(storedToken({ familyId: 'fam-7' }));

      await service.revokeRefreshToken('a-secret');

      const lookup = refreshToken.findUnique.mock.calls[0]![0] as { where: { tokenHash: string } };
      expect(lookup.where.tokenHash).toBe(hashRefreshToken('a-secret'));
      const revoke = refreshToken.updateMany.mock.calls[0]![0] as {
        where: unknown;
        data: { revokedAt: unknown };
      };
      expect(revoke.where).toEqual({ familyId: 'fam-7', revokedAt: null });
      expect(revoke.data.revokedAt).toBeInstanceOf(Date);
    });

    it('is a silent no-op for an unknown token', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.revokeRefreshToken('unknown')).resolves.toBeUndefined();
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes every still-live token the user holds, across all families', async () => {
      const { service, refreshToken } = setup();

      await service.revokeAllForUser('user-1');

      const revoke = refreshToken.updateMany.mock.calls[0]![0] as {
        where: unknown;
        data: { revokedAt: unknown };
      };
      expect(revoke.where).toEqual({ userId: 'user-1', revokedAt: null });
      expect(revoke.data.revokedAt).toBeInstanceOf(Date);
      // No lookup needed — it targets the user's tokens directly.
      expect(refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('signScopedAccessToken', () => {
    it('stamps role + gymId claims and honours the supplied TTL', () => {
      const { service } = setup();
      const iat = nowSeconds();

      const token = service.signScopedAccessToken(
        { userId: 'owner-1', role: Role.OWNER, gymId: 'gym-1', ttlSeconds: 600 },
        iat,
      );

      const [, payload] = token.split('.');
      const claims = decodeSegment(payload!);
      expect(claims).toMatchObject({
        sub: 'owner-1',
        type: 'access',
        role: 'OWNER',
        gymId: 'gym-1',
        iss: 'fit',
        iat,
        exp: iat + 600,
      });
    });

    it('produces a token the verifier accepts and the tenant middleware can read', () => {
      const { service } = setup();
      const token = service.signScopedAccessToken({
        userId: 'owner-1',
        role: Role.OWNER,
        gymId: 'gym-1',
        ttlSeconds: 600,
      });

      const verified = service.verifyAccessToken(token);
      expect(verified.sub).toBe('owner-1');
      expect(verified.role).toBe('OWNER');
      expect(verified.gymId).toBe('gym-1');
    });

    it('throws 503 when no signing secret is configured', () => {
      configure({ JWT_SECRET: undefined });
      const { service } = setup();
      expect(() =>
        service.signScopedAccessToken({
          userId: 'u',
          role: Role.OWNER,
          gymId: 'g',
          ttlSeconds: 600,
        }),
      ).toThrow(ServiceUnavailableException);
    });
  });

  describe('userIdForRefreshToken', () => {
    it('returns the owner of a live token', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(storedToken({ userId: 'user-7' }));

      await expect(service.userIdForRefreshToken('rt-secret')).resolves.toBe('user-7');
      expect(refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashRefreshToken('rt-secret') } }),
      );
    });

    it('returns null for an unknown token', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.userIdForRefreshToken('nope')).resolves.toBeNull();
    });

    it('returns null for a revoked token', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(storedToken({ revokedAt: new Date() }));
      await expect(service.userIdForRefreshToken('rt-secret')).resolves.toBeNull();
    });

    it('returns null for an expired token', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 1_000) }),
      );
      await expect(service.userIdForRefreshToken('rt-secret')).resolves.toBeNull();
    });

    it('does not spend or mutate the token', async () => {
      const { service, refreshToken } = setup();
      refreshToken.findUnique.mockResolvedValue(storedToken());
      await service.userIdForRefreshToken('rt-secret');
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
      expect(refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
