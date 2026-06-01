import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { TokenPair } from '@fit/types';

// Mock the frozen env singleton so the verification TTL is deterministic, and
// stub argon2 so tests neither load the native addon nor pay hashing cost.
const { mockEnv, argonHash, argonVerify } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = { EMAIL_VERIFICATION_TTL: 86_400 };
  const argonHash = vi.fn<(password: string, opts?: unknown) => Promise<string>>(() =>
    Promise.resolve('argon2-hash'),
  );
  const argonVerify = vi.fn<(hash: string, password: string) => Promise<boolean>>(() =>
    Promise.resolve(true),
  );
  return { mockEnv, argonHash, argonVerify };
});
vi.mock('../config/env', () => ({ env: mockEnv }));
vi.mock('argon2', () => ({ hash: argonHash, verify: argonVerify, argon2id: 2 }));

import { AuthService, generateVerificationToken } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
import type { EmailService } from './email.service';

/** A user row as `login`'s `findUnique` projection returns it. */
interface StoredUser {
  id: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
}

/** Build an AuthService with controllable collaborator fakes. */
function setup() {
  const findUnique = vi.fn<(args: unknown) => Promise<{ id: string } | StoredUser | null>>(() =>
    Promise.resolve(null),
  );
  const create = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'user-1' }),
  );
  const updateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>(() =>
    Promise.resolve({ count: 1 }),
  );
  const set = vi.fn<(key: string, value: string, ex: string, ttl: number) => Promise<string>>(() =>
    Promise.resolve('OK'),
  );
  const get = vi.fn<(key: string) => Promise<string | null>>();
  const del = vi.fn<(key: string) => Promise<number>>(() => Promise.resolve(1));
  const issueTokenPair = vi.fn<(userId: string) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'access', refreshToken: 'refresh' }),
  );
  const rotateRefreshToken = vi.fn<(token: string) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'access2', refreshToken: 'refresh2' }),
  );
  const revokeRefreshToken = vi.fn<(token: string) => Promise<void>>(() => Promise.resolve());
  const sendVerificationEmail = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );

  const prisma = {
    client: { user: { findUnique, create, updateMany } },
  } as unknown as PrismaService;
  const redis = { client: { set, get, del } } as unknown as RedisService;
  const tokens = {
    issueTokenPair,
    rotateRefreshToken,
    revokeRefreshToken,
  } as unknown as TokenService;
  const email = { sendVerificationEmail } as unknown as EmailService;

  const service = new AuthService(prisma, redis, tokens, email);
  return {
    service,
    findUnique,
    create,
    updateMany,
    set,
    get,
    del,
    issueTokenPair,
    rotateRefreshToken,
    revokeRefreshToken,
    sendVerificationEmail,
  };
}

const VALID_REGISTER = { email: 'a@b.com', password: 'supersecret', name: 'Alice' };

describe('AuthService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
    // clearAllMocks resets call history but not implementations, so restore the
    // hoisted argon2 stubs' defaults between tests that override them.
    argonVerify.mockResolvedValue(true);
    argonHash.mockResolvedValue('argon2-hash');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('hashes the password, creates the user, stores a verify token, and emails it', async () => {
      ctx.findUnique.mockResolvedValue(null);

      const result = await ctx.service.register(VALID_REGISTER);

      expect(result).toEqual({ message: 'verification email sent' });
      expect(argonHash).toHaveBeenCalledWith('supersecret', expect.objectContaining({ type: 2 }));
      expect(ctx.create).toHaveBeenCalledWith({
        data: { email: 'a@b.com', name: 'Alice', passwordHash: 'argon2-hash' },
        select: { id: true },
      });

      // Token is stored under email-verify:<token> -> userId with a 24h TTL.
      const [key, value, ex, ttl] = ctx.set.mock.calls[0]!;
      expect(key).toMatch(/^email-verify:.+/);
      expect(value).toBe('user-1');
      expect(ex).toBe('EX');
      expect(ttl).toBe(86_400);

      const emailedToken = key.slice('email-verify:'.length);
      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', emailedToken, 'Alice');
    });

    it('throws 409 EMAIL_TAKEN when the address already exists, without creating a user', async () => {
      ctx.findUnique.mockResolvedValue({ id: 'existing' });

      const error = await ctx.service.register(VALID_REGISTER).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EMAIL_TAKEN' });
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.set).not.toHaveBeenCalled();
    });

    it('still resolves 201 when the verification email fails to send', async () => {
      ctx.findUnique.mockResolvedValue(null);
      ctx.sendVerificationEmail.mockRejectedValue(new Error('resend down'));

      await expect(ctx.service.register(VALID_REGISTER)).resolves.toEqual({
        message: 'verification email sent',
      });
      // The account + token were still persisted.
      expect(ctx.create).toHaveBeenCalled();
      expect(ctx.set).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('consumes the token, stamps emailVerifiedAt, and issues a session', async () => {
      ctx.get.mockResolvedValue('user-1');

      const pair = await ctx.service.verifyEmail('tok');

      expect(ctx.del).toHaveBeenCalledWith('email-verify:tok');
      // Stamp only an unverified row, and `emailVerifiedAt` is a real Date.
      const update = ctx.updateMany.mock.calls[0]![0] as {
        where: unknown;
        data: { emailVerifiedAt: unknown };
      };
      expect(update.where).toEqual({ id: 'user-1', emailVerifiedAt: null });
      expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1');
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('throws 400 TOKEN_INVALID_OR_EXPIRED for an unknown / expired token', async () => {
      ctx.get.mockResolvedValue(null);

      const error = await ctx.service.verifyEmail('nope').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
      expect(ctx.del).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('rejects a token already consumed by a racing request (DEL returns 0)', async () => {
      ctx.get.mockResolvedValue('user-1');
      ctx.del.mockResolvedValue(0);

      const error = await ctx.service.verifyEmail('tok').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.updateMany).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const VALID_LOGIN = { email: 'a@b.com', password: 'supersecret' };
    const verifiedUser: StoredUser = {
      id: 'user-1',
      passwordHash: 'stored-hash',
      emailVerifiedAt: new Date('2026-01-01'),
    };

    it('verifies the password and issues a session for a verified user', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);

      const pair = await ctx.service.login(VALID_LOGIN);

      expect(argonVerify).toHaveBeenCalledWith('stored-hash', 'supersecret');
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1');
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('throws 401 INVALID_CREDENTIALS for an unknown email — but still runs a verify', async () => {
      ctx.findUnique.mockResolvedValue(null);

      const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      // Constant-time: a dummy hash is verified so timing doesn't leak existence.
      expect(argonVerify).toHaveBeenCalledTimes(1);
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('throws 401 INVALID_CREDENTIALS when the password is wrong', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(false);

      const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('throws 401 INVALID_CREDENTIALS for an OAuth-only account (no password hash)', async () => {
      ctx.findUnique.mockResolvedValue({ ...verifiedUser, passwordHash: null });

      const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('treats a malformed-hash verify error as a failed login', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockRejectedValue(new Error('invalid hash'));

      const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('throws 403 EMAIL_NOT_VERIFIED when the password is right but the email is unverified', async () => {
      ctx.findUnique.mockResolvedValue({ ...verifiedUser, emailVerifiedAt: null });
      argonVerify.mockResolvedValue(true);

      const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
      });
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('delegates to the token service rotation', async () => {
      const pair = await ctx.service.refresh({ refreshToken: 'rt-secret' });

      expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret');
      expect(pair).toEqual({ accessToken: 'access2', refreshToken: 'refresh2' });
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token', async () => {
      await ctx.service.logout({ refreshToken: 'rt-secret' });

      expect(ctx.revokeRefreshToken).toHaveBeenCalledWith('rt-secret');
    });
  });
});

describe('generateVerificationToken', () => {
  it('produces a 32-char URL-safe token', () => {
    const token = generateVerificationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('produces a distinct token each call', () => {
    expect(generateVerificationToken()).not.toBe(generateVerificationToken());
  });
});
