import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { TokenPair } from '@fit/types';

// Mock the frozen env singleton so the verification TTL is deterministic, and
// stub argon2 so tests neither load the native addon nor pay hashing cost.
const { mockEnv, argonHash } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = { EMAIL_VERIFICATION_TTL: 86_400 };
  const argonHash = vi.fn<(password: string, opts?: unknown) => Promise<string>>(() =>
    Promise.resolve('argon2-hash'),
  );
  return { mockEnv, argonHash };
});
vi.mock('../config/env', () => ({ env: mockEnv }));
vi.mock('argon2', () => ({ hash: argonHash, argon2id: 2 }));

import { AuthService, generateVerificationToken } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
import type { EmailService } from './email.service';

/** Build an AuthService with controllable collaborator fakes. */
function setup() {
  const findUnique = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
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
  const sendVerificationEmail = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );

  const prisma = {
    client: { user: { findUnique, create, updateMany } },
  } as unknown as PrismaService;
  const redis = { client: { set, get, del } } as unknown as RedisService;
  const tokens = { issueTokenPair } as unknown as TokenService;
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
    sendVerificationEmail,
  };
}

const VALID_REGISTER = { email: 'a@b.com', password: 'supersecret', name: 'Alice' };

describe('AuthService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
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
