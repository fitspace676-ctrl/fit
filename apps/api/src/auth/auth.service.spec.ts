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
  const mockEnv: Record<string, unknown> = {
    EMAIL_VERIFICATION_TTL: 86_400,
    PASSWORD_RESET_TTL: 3_600,
  };
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
import { Prisma, Role } from '@fit/db';
import type { AppleProfile, GoogleProfile } from '@fit/types';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';

/** A user row as `login`'s `findUnique` projection returns it. */
interface StoredUser {
  id: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
}

/** Build an AuthService with controllable collaborator fakes. */
function setup() {
  const findUnique = vi.fn<
    (args: unknown) => Promise<
      | {
          id: string;
          emailVerifiedAt?: Date | null;
          name?: string | null;
          tokenVersion?: number;
          isSuperAdmin?: boolean;
        }
      | StoredUser
      | null
    >
  >(() => Promise.resolve(null));
  const create = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'user-1' }),
  );
  const update = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
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
  const userIdForRefreshToken = vi.fn<(token: string) => Promise<string | null>>(() =>
    Promise.resolve(null),
  );
  const revokeRefreshToken = vi.fn<(token: string) => Promise<void>>(() => Promise.resolve());
  const revokeAllForUser = vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve());
  const sendVerificationEmail = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const sendPasswordResetEmail = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const verifyIdToken = vi.fn<(idToken: string) => Promise<GoogleProfile>>(() =>
    Promise.resolve({ googleId: 'g-1', email: 'a@b.com', emailVerified: true, name: 'Alice' }),
  );
  const verifyAppleIdToken = vi.fn<(idToken: string) => Promise<AppleProfile>>(() =>
    Promise.resolve({ appleId: 'ap-1', email: 'a@b.com', emailVerified: true }),
  );

  // Gym-membership lookups backing the suspension gate. Default to "no
  // memberships" so login/refresh succeed unless a test opts into a membership.
  const gymMemberFindFirst = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(null),
  );
  // Membership rows backing the session-scope resolver. Default to "no active
  // membership" → a scopeless platform session ({ gymId: null, role: MEMBER }).
  const gymMemberFindMany = vi.fn<
    (
      args: unknown,
    ) => Promise<
      { gymId: string; role: Role; joinedAt: Date; gym: { status: string; slug?: string } }[]
    >
  >(() => Promise.resolve([]));

  const prisma = {
    client: {
      user: { findUnique, create, update, updateMany },
      gymMember: { findFirst: gymMemberFindFirst, findMany: gymMemberFindMany },
    },
  } as unknown as PrismaService;
  const redis = { client: { set, get, del } } as unknown as RedisService;
  const tokens = {
    issueTokenPair,
    rotateRefreshToken,
    userIdForRefreshToken,
    revokeRefreshToken,
    revokeAllForUser,
  } as unknown as TokenService;
  const email = { sendVerificationEmail, sendPasswordResetEmail } as unknown as EmailService;
  const google = { verifyIdToken } as unknown as GoogleOAuthService;
  const apple = { verifyIdToken: verifyAppleIdToken } as unknown as AppleOAuthService;

  const service = new AuthService(prisma, redis, tokens, email, google, apple);
  return {
    service,
    findUnique,
    create,
    update,
    updateMany,
    set,
    get,
    del,
    issueTokenPair,
    rotateRefreshToken,
    userIdForRefreshToken,
    revokeRefreshToken,
    revokeAllForUser,
    sendVerificationEmail,
    sendPasswordResetEmail,
    verifyIdToken,
    verifyAppleIdToken,
    gymMemberFindFirst,
    gymMemberFindMany,
  };
}

/**
 * The scope a session resolves to when the user has no active gym membership
 * (the default in most specs): a platform-level account — no tenant, least
 * privilege. {@link AuthService.resolveSessionScope} stamps this into the access
 * token, and it is the second argument every `issueTokenPair` / rotation call
 * now carries.
 */
const SCOPELESS = { gymId: null, role: Role.MEMBER, tokenVersion: 0 };

/**
 * Make `gymMemberFindFirst` model a specific membership picture: the first call
 * (any membership) and the second (a membership in an ACTIVE gym) are answered
 * in order, mirroring the two `findFirst`s `assertGymAccessNotSuspended` runs.
 */
function membership(
  ctx: ReturnType<typeof setup>,
  { hasAny, hasActive }: { hasAny: boolean; hasActive: boolean },
): void {
  ctx.gymMemberFindFirst
    .mockResolvedValueOnce(hasAny ? { id: 'm-1' } : null)
    .mockResolvedValueOnce(hasActive ? { id: 'm-1' } : null);
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
      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith(
        'a@b.com',
        emailedToken,
        'Alice',
        'en',
      );
    });

    it('emails the verification link in the requested locale', async () => {
      ctx.findUnique.mockResolvedValue(null);

      await ctx.service.register(VALID_REGISTER, 'ka');

      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        'Alice',
        'ka',
      );
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
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', SCOPELESS);
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

  describe('requestPasswordReset', () => {
    it('mints a reset token and emails it when the account exists', async () => {
      ctx.findUnique.mockResolvedValue({ id: 'user-1', name: 'Sam' });

      const result = await ctx.service.requestPasswordReset({ email: 'a@b.com' });

      expect(result).toEqual({
        message: 'If an account exists for that address, a reset link has been sent',
      });

      // Token stored under password-reset:<token> -> userId with a 1h TTL.
      const [key, value, ex, ttl] = ctx.set.mock.calls[0]!;
      expect(key).toMatch(/^password-reset:.+/);
      expect(value).toBe('user-1');
      expect(ex).toBe('EX');
      expect(ttl).toBe(3_600);

      const emailedToken = key.slice('password-reset:'.length);
      expect(ctx.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com', emailedToken, 'Sam', 'en');
    });

    it('returns the same generic message without minting a token when no account exists', async () => {
      ctx.findUnique.mockResolvedValue(null);

      const result = await ctx.service.requestPasswordReset({ email: 'ghost@b.com' });

      expect(result).toEqual({
        message: 'If an account exists for that address, a reset link has been sent',
      });
      expect(ctx.set).not.toHaveBeenCalled();
      expect(ctx.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('still resolves when the reset email fails to send (token already minted)', async () => {
      ctx.findUnique.mockResolvedValue({ id: 'user-1', name: null });
      ctx.sendPasswordResetEmail.mockRejectedValue(new Error('resend down'));

      await expect(ctx.service.requestPasswordReset({ email: 'a@b.com' })).resolves.toEqual({
        message: 'If an account exists for that address, a reset link has been sent',
      });
      // The token was still persisted despite the delivery failure.
      expect(ctx.set).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const VALID_RESET = { token: 'reset-tok', password: 'brand-new-secret' };

    it('consumes the token, sets the new hash, revokes all sessions, and issues a session', async () => {
      ctx.get.mockResolvedValue('user-1');

      const pair = await ctx.service.resetPassword(VALID_RESET);

      expect(ctx.del).toHaveBeenCalledWith('password-reset:reset-tok');
      expect(argonHash).toHaveBeenCalledWith(
        'brand-new-secret',
        expect.objectContaining({ type: 2 }),
      );

      // New hash written to the resolved user.
      const update = ctx.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { passwordHash: string };
      };
      expect(update.where).toEqual({ id: 'user-1' });
      expect(update.data.passwordHash).toBe('argon2-hash');

      // Verification is stamped only on a still-unverified row.
      const stamp = ctx.updateMany.mock.calls[0]![0] as {
        where: unknown;
        data: { emailVerifiedAt: unknown };
      };
      expect(stamp.where).toEqual({ id: 'user-1', emailVerifiedAt: null });
      expect(stamp.data.emailVerifiedAt).toBeInstanceOf(Date);

      // All existing sessions are cut, then a fresh one is issued.
      expect(ctx.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('throws 400 TOKEN_INVALID_OR_EXPIRED for an unknown / expired token', async () => {
      ctx.get.mockResolvedValue(null);

      const error = await ctx.service.resetPassword(VALID_RESET).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
      expect(ctx.del).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.revokeAllForUser).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('rejects a token already consumed by a racing request (DEL returns 0)', async () => {
      ctx.get.mockResolvedValue('user-1');
      ctx.del.mockResolvedValue(0);

      const error = await ctx.service.resetPassword(VALID_RESET).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(argonHash).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.revokeAllForUser).not.toHaveBeenCalled();
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
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', SCOPELESS);
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

    it('throws 403 GYM_SUSPENDED when every gym the member belongs to is suspended', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: false });

      const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('still logs in a member who has at least one active gym', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: true });

      await expect(ctx.service.login(VALID_LOGIN)).resolves.toMatchObject({
        accessToken: 'access',
      });
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', SCOPELESS);
    });

    it('logs in a platform user with no gym memberships (never gated)', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: false, hasActive: false });

      await expect(ctx.service.login(VALID_LOGIN)).resolves.toMatchObject({
        accessToken: 'access',
      });
    });

    it('stamps the session with the home gym + role for a single-gym member', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-1',
          role: Role.OWNER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE' },
        },
      ]);

      await ctx.service.login(VALID_LOGIN);

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-1',
        role: Role.OWNER,
        tokenVersion: 0,
      });
    });

    it('binds to the earliest-joined active gym when the user belongs to several', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-late',
          role: Role.MEMBER,
          joinedAt: new Date('2026-03-01'),
          gym: { status: 'ACTIVE' },
        },
        {
          gymId: 'gym-early',
          role: Role.MANAGER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE' },
        },
      ]);

      await ctx.service.login(VALID_LOGIN);

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-early',
        role: Role.MANAGER,
        tokenVersion: 0,
      });
    });

    it('binds to the subdomain gym when gymSlug names a membership (not the primary)', async () => {
      // Signed in on `riverside.fit.ge` — bind to riverside even though downtown
      // is the earliest-joined (primary) gym.
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-downtown',
          role: Role.OWNER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE', slug: 'downtown' },
        },
        {
          gymId: 'gym-riverside',
          role: Role.TRAINER,
          joinedAt: new Date('2026-03-01'),
          gym: { status: 'ACTIVE', slug: 'riverside' },
        },
      ]);

      await ctx.service.login({ ...VALID_LOGIN, gymSlug: 'riverside' });

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-riverside',
        role: Role.TRAINER,
        tokenVersion: 0,
      });
    });

    it('falls back to the primary gym when gymSlug names a gym the user is not a member of', async () => {
      ctx.findUnique.mockResolvedValue(verifiedUser);
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-downtown',
          role: Role.OWNER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE', slug: 'downtown' },
        },
      ]);

      // `someone-elses-gym` isn't among the user's memberships → primary wins.
      await ctx.service.login({ ...VALID_LOGIN, gymSlug: 'someone-elses-gym' });

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-downtown',
        role: Role.OWNER,
        tokenVersion: 0,
      });
    });

    it('resolves a platform SUPER_ADMIN (isSuperAdmin flag) to a tenant-less session', async () => {
      // The flag wins over any gym membership and yields no gym (platform-wide).
      ctx.findUnique.mockResolvedValue({ ...verifiedUser, isSuperAdmin: true });
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-1',
          role: Role.OWNER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE' },
        },
      ]);

      await ctx.service.login(VALID_LOGIN);

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: null,
        role: Role.SUPER_ADMIN,
        tokenVersion: 0,
      });
    });

    it('carries the user tokenVersion into the session scope', async () => {
      ctx.findUnique.mockResolvedValue({ ...verifiedUser, tokenVersion: 5 });
      argonVerify.mockResolvedValue(true);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-1',
          role: Role.MEMBER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE' },
        },
      ]);

      await ctx.service.login(VALID_LOGIN);

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-1',
        role: Role.MEMBER,
        tokenVersion: 5,
      });
    });
  });

  describe('loginWithGoogle', () => {
    const VALID = { idToken: 'google-id-token' };

    it('issues a session for an account already linked by googleId', async () => {
      // First findUnique (by googleId) hits; the email lookup is never reached.
      ctx.findUnique.mockResolvedValueOnce({ id: 'user-9' });

      const pair = await ctx.service.loginWithGoogle(VALID);

      expect(ctx.verifyIdToken).toHaveBeenCalledWith('google-id-token');
      // 1× to match by googleId, then 1× more when resolveSessionScope reads the
      // user's tokenVersion — the email lookup itself is never reached.
      expect(ctx.findUnique).toHaveBeenCalledTimes(2);
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-9', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('links googleId onto an existing same-email account and stamps verification', async () => {
      ctx.findUnique
        .mockResolvedValueOnce(null) // by googleId — miss
        .mockResolvedValueOnce({ id: 'user-7', emailVerifiedAt: null }); // by email — hit

      const pair = await ctx.service.loginWithGoogle(VALID);

      const update = ctx.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { googleId: string; emailVerifiedAt: unknown };
      };
      expect(update.where).toEqual({ id: 'user-7' });
      expect(update.data.googleId).toBe('g-1');
      expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-7', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('preserves an already-verified timestamp when linking', async () => {
      const verifiedAt = new Date('2025-01-01');
      ctx.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'user-7', emailVerifiedAt: verifiedAt });

      await ctx.service.loginWithGoogle(VALID);

      const update = ctx.update.mock.calls[0]![0] as { data: { emailVerifiedAt: unknown } };
      expect(update.data.emailVerifiedAt).toBe(verifiedAt);
    });

    it('creates a verified OAuth-only account when no user matches', async () => {
      ctx.findUnique.mockResolvedValue(null); // both lookups miss
      ctx.create.mockResolvedValue({ id: 'user-new' });

      const pair = await ctx.service.loginWithGoogle(VALID);

      const created = ctx.create.mock.calls[0]![0] as {
        data: { email: string; name: string | null; googleId: string; emailVerifiedAt: unknown };
      };
      expect(created.data.email).toBe('a@b.com');
      expect(created.data.googleId).toBe('g-1');
      expect(created.data.name).toBe('Alice');
      expect(created.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-new', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('rejects a Google account whose email is unverified', async () => {
      ctx.verifyIdToken.mockResolvedValue({
        googleId: 'g-1',
        email: 'a@b.com',
        emailVerified: false,
      });

      const error = await ctx.service.loginWithGoogle(VALID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'GOOGLE_EMAIL_NOT_VERIFIED',
      });
      expect(ctx.findUnique).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('refuses a session when the resolved user has only suspended gyms', async () => {
      ctx.findUnique.mockResolvedValueOnce({ id: 'user-9' }); // matched by googleId
      membership(ctx, { hasAny: true, hasActive: false });

      const error = await ctx.service.loginWithGoogle(VALID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('loginWithApple', () => {
    const VALID = { idToken: 'apple-id-token', name: 'Alice' };

    it('issues a session for an account already linked by appleId — without needing email', async () => {
      // Returning sign-in: Apple omits email, but the appleId match short-circuits.
      ctx.verifyAppleIdToken.mockResolvedValue({ appleId: 'ap-9', emailVerified: false });
      ctx.findUnique.mockResolvedValueOnce({ id: 'user-9' });

      const pair = await ctx.service.loginWithApple({ idToken: 'apple-id-token' });

      expect(ctx.verifyAppleIdToken).toHaveBeenCalledWith('apple-id-token');
      // 1× to match by appleId, then 1× more when resolveSessionScope reads the
      // user's tokenVersion (Apple omits email, so no email lookup happens).
      expect(ctx.findUnique).toHaveBeenCalledTimes(2);
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-9', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('links appleId onto an existing same-email account and stamps verification', async () => {
      ctx.findUnique
        .mockResolvedValueOnce(null) // by appleId — miss
        .mockResolvedValueOnce({ id: 'user-7', emailVerifiedAt: null }); // by email — hit

      const pair = await ctx.service.loginWithApple(VALID);

      const update = ctx.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { appleId: string; emailVerifiedAt: unknown };
      };
      expect(update.where).toEqual({ id: 'user-7' });
      expect(update.data.appleId).toBe('ap-1');
      expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-7', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('preserves an already-verified timestamp when linking', async () => {
      const verifiedAt = new Date('2025-01-01');
      ctx.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'user-7', emailVerifiedAt: verifiedAt });

      await ctx.service.loginWithApple(VALID);

      const update = ctx.update.mock.calls[0]![0] as { data: { emailVerifiedAt: unknown } };
      expect(update.data.emailVerifiedAt).toBe(verifiedAt);
    });

    it('creates a verified OAuth-only account (using the forwarded name) when no user matches', async () => {
      ctx.findUnique.mockResolvedValue(null); // both lookups miss
      ctx.create.mockResolvedValue({ id: 'user-new' });

      const pair = await ctx.service.loginWithApple(VALID);

      const created = ctx.create.mock.calls[0]![0] as {
        data: { email: string; name: string | null; appleId: string; emailVerifiedAt: unknown };
      };
      expect(created.data.email).toBe('a@b.com');
      expect(created.data.appleId).toBe('ap-1');
      expect(created.data.name).toBe('Alice');
      expect(created.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-new', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('creates an account with a null name when none is forwarded', async () => {
      ctx.findUnique.mockResolvedValue(null);
      ctx.create.mockResolvedValue({ id: 'user-new' });

      await ctx.service.loginWithApple({ idToken: 'apple-id-token' });

      const created = ctx.create.mock.calls[0]![0] as { data: { name: string | null } };
      expect(created.data.name).toBeNull();
    });

    it('rejects a new identity when Apple withholds the email', async () => {
      ctx.verifyAppleIdToken.mockResolvedValue({ appleId: 'ap-1', emailVerified: false });
      ctx.findUnique.mockResolvedValueOnce(null); // no appleId match

      const error = await ctx.service.loginWithApple(VALID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'APPLE_EMAIL_UNAVAILABLE',
      });
      expect(ctx.findUnique).toHaveBeenCalledTimes(1); // email lookup never reached
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('rejects a new identity whose Apple email is unverified', async () => {
      ctx.verifyAppleIdToken.mockResolvedValue({
        appleId: 'ap-1',
        email: 'a@b.com',
        emailVerified: false,
      });
      ctx.findUnique.mockResolvedValueOnce(null); // no appleId match

      const error = await ctx.service.loginWithApple(VALID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'APPLE_EMAIL_NOT_VERIFIED',
      });
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('refuses a session when the resolved user has only suspended gyms', async () => {
      ctx.verifyAppleIdToken.mockResolvedValue({ appleId: 'ap-9', emailVerified: false });
      ctx.findUnique.mockResolvedValueOnce({ id: 'user-9' }); // matched by appleId
      membership(ctx, { hasAny: true, hasActive: false });

      const error = await ctx.service.loginWithApple(VALID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('delegates to the token service rotation', async () => {
      const pair = await ctx.service.refresh({ refreshToken: 'rt-secret' });

      expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access2', refreshToken: 'refresh2' });
    });

    it('blocks the rotation when the token owner has only suspended gyms', async () => {
      ctx.userIdForRefreshToken.mockResolvedValue('user-1');
      membership(ctx, { hasAny: true, hasActive: false });

      const error = await ctx.service
        .refresh({ refreshToken: 'rt-secret' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
      // The presented token is left unspent so a later reactivation can refresh again.
      expect(ctx.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('rotates when the token owner still has an active gym', async () => {
      ctx.userIdForRefreshToken.mockResolvedValue('user-1');
      membership(ctx, { hasAny: true, hasActive: true });

      await ctx.service.refresh({ refreshToken: 'rt-secret' });

      expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', SCOPELESS);
    });

    it('rotates without a suspension check for an unknown/expired token (lets rotation 401)', async () => {
      ctx.userIdForRefreshToken.mockResolvedValue(null);

      await ctx.service.refresh({ refreshToken: 'rt-secret' });

      expect(ctx.gymMemberFindFirst).not.toHaveBeenCalled();
      expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', SCOPELESS);
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

/**
 * `registerGym` touches more models than the shared `setup()` mocks (gym +
 * gymMember inside a `$transaction`), so it gets its own self-contained fakes.
 */
function setupGym() {
  const gymFindUnique = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(null),
  );
  const userFindUnique = vi.fn<
    (
      args: unknown,
    ) => Promise<{ id: string; emailVerifiedAt: Date | null; name: string | null } | null>
  >(() => Promise.resolve(null));
  const userCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'owner-1' }),
  );
  const gymCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'gym-1' }),
  );
  const gymMemberCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'member-1' }),
  );

  // The transaction runs its callback against a `tx` exposing the write fakes.
  const tx = {
    user: { create: userCreate },
    gym: { create: gymCreate },
    gymMember: { create: gymMemberCreate },
  };
  type Tx = typeof tx;
  const $transaction = vi.fn(<T>(fn: (client: Tx) => Promise<T>) => fn(tx));

  const set = vi.fn<(key: string, value: string, ex: string, ttl: number) => Promise<string>>(() =>
    Promise.resolve('OK'),
  );
  const issueTokenPair = vi.fn();
  const sendOwnerOnboardingEmail = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );

  const prisma = {
    client: {
      gym: { findUnique: gymFindUnique, create: gymCreate },
      user: { findUnique: userFindUnique, create: userCreate },
      gymMember: { create: gymMemberCreate },
      $transaction,
    },
  } as unknown as PrismaService;
  const redis = { client: { set } } as unknown as RedisService;
  const tokens = { issueTokenPair } as unknown as TokenService;
  const email = { sendOwnerOnboardingEmail } as unknown as EmailService;
  const google = {} as unknown as GoogleOAuthService;
  const apple = {} as unknown as AppleOAuthService;

  const service = new AuthService(prisma, redis, tokens, email, google, apple);
  return {
    service,
    gymFindUnique,
    userFindUnique,
    userCreate,
    gymCreate,
    gymMemberCreate,
    $transaction,
    set,
    sendOwnerOnboardingEmail,
  };
}

const VALID_GYM = {
  gymName: 'Downtown Strength',
  subdomainSlug: 'downtown',
  ownerEmail: 'owner@example.com',
  ownerName: 'Olivia Owner',
  password: 'supersecret',
};

describe('AuthService.registerGym', () => {
  let ctx: ReturnType<typeof setupGym>;

  beforeEach(() => {
    ctx = setupGym();
    argonHash.mockResolvedValue('argon2-hash');
  });

  afterEach(() => vi.clearAllMocks());

  it('creates a new owner, gym, and OWNER membership, then sends the onboarding email', async () => {
    const result = await ctx.service.registerGym(VALID_GYM);

    // Owner created with the hashed password and supplied name.
    expect(argonHash).toHaveBeenCalledWith('supersecret', expect.objectContaining({ type: 2 }));
    expect(ctx.userCreate).toHaveBeenCalledWith({
      data: { email: 'owner@example.com', name: 'Olivia Owner', passwordHash: 'argon2-hash' },
      select: { id: true },
    });
    // Gym records who provisioned it (the owner, for self-signup).
    expect(ctx.gymCreate).toHaveBeenCalledWith({
      data: {
        name: 'Downtown Strength',
        slug: 'downtown',
        ownerId: 'owner-1',
        createdByUserId: 'owner-1',
      },
      select: { id: true },
    });
    expect(ctx.gymMemberCreate).toHaveBeenCalledWith({
      data: { userId: 'owner-1', gymId: 'gym-1', role: 'OWNER', status: 'ACTIVE' },
    });

    // Onboarding token stored under the same email-verify namespace verifyEmail consumes.
    const [key, value, ex, ttl] = ctx.set.mock.calls[0]!;
    expect(key).toMatch(/^email-verify:.+/);
    expect(value).toBe('owner-1');
    expect(ex).toBe('EX');
    expect(ttl).toBe(86_400);

    const token = key.slice('email-verify:'.length);
    expect(ctx.sendOwnerOnboardingEmail).toHaveBeenCalledWith(
      'owner@example.com',
      token,
      'Downtown Strength',
      'Olivia Owner',
      'en',
    );

    expect(result).toEqual({
      gymId: 'gym-1',
      subdomainSlug: 'downtown',
      ownerUserId: 'owner-1',
    });
  });

  it('rejects a duplicate subdomain with 409 SUBDOMAIN_TAKEN, without provisioning anything', async () => {
    ctx.gymFindUnique.mockResolvedValue({ id: 'existing-gym' });

    const error = await ctx.service.registerGym(VALID_GYM).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'SUBDOMAIN_TAKEN' });
    expect(ctx.$transaction).not.toHaveBeenCalled();
    expect(ctx.userCreate).not.toHaveBeenCalled();
    expect(ctx.set).not.toHaveBeenCalled();
  });

  it('rejects an already-registered email with 409 EMAIL_TAKEN, without provisioning anything', async () => {
    ctx.userFindUnique.mockResolvedValue({
      id: 'existing-owner',
      emailVerifiedAt: new Date(),
      name: 'Existing',
    });

    const error = await ctx.service.registerGym(VALID_GYM).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EMAIL_TAKEN' });
    expect(ctx.$transaction).not.toHaveBeenCalled();
    expect(ctx.userCreate).not.toHaveBeenCalled();
    expect(ctx.set).not.toHaveBeenCalled();
  });

  it('creates the owner without a password hash when none is supplied', async () => {
    const { password: _omit, ...noPassword } = VALID_GYM;

    await ctx.service.registerGym(noPassword);

    expect(argonHash).not.toHaveBeenCalled();
    expect(ctx.userCreate).toHaveBeenCalledWith({
      data: { email: 'owner@example.com', name: 'Olivia Owner', passwordHash: null },
      select: { id: true },
    });
  });

  it('still resolves when the onboarding email fails to send', async () => {
    ctx.sendOwnerOnboardingEmail.mockRejectedValue(new Error('resend down'));

    const result = await ctx.service.registerGym(VALID_GYM);

    expect(ctx.gymCreate).toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalled();
    expect(result).toMatchObject({ gymId: 'gym-1', ownerUserId: 'owner-1' });
  });

  it('maps a P2002 subdomain race to 409 SUBDOMAIN_TAKEN', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['slug'] },
    });
    ctx.$transaction.mockRejectedValue(conflict);

    const error = await ctx.service.registerGym(VALID_GYM).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'SUBDOMAIN_TAKEN' });
  });

  it('maps a P2002 email race to 409 EMAIL_TAKEN (via the violated target)', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    ctx.$transaction.mockRejectedValue(conflict);

    const error = await ctx.service.registerGym(VALID_GYM).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EMAIL_TAKEN' });
  });
});
