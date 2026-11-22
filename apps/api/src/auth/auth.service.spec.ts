import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { MemberSignupInput, TokenPair } from '@fit/types';

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
import { GymMemberStatus, Prisma, Role } from '@fit/db';
import type { AppleProfile, GoogleProfile } from '@fit/types';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';

/** A gym row as `signupMember`'s tenant lookup projects it. */
interface GymRow {
  id: string;
  slug: string;
  name?: string;
  settings: unknown;
}

/** One gym's credential as `login`'s `findUnique` projection nests it. */
interface StoredCredential {
  gymId: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  gym: { slug: string; name: string; status: string };
}

/** A user row as `login`'s `findUnique` projection returns it. */
interface StoredUser {
  id: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  isSuperAdmin?: boolean;
  credentials?: StoredCredential[];
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
  // Every realm's account for an address, as the sign-in / reset / social paths
  // read them in one query (accounts are per realm, see `./account-realm`).
  // Default: no account anywhere.
  const findMany = vi.fn<(args: unknown) => Promise<Record<string, unknown>[]>>(() =>
    Promise.resolve([]),
  );
  // "Does the address hold any account at all?" — the bare registration's check.
  const findFirst = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(null),
  );
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
  const sessionForRefreshToken = vi.fn<
    (token: string) => Promise<{ userId: string; gymId: string | null } | null>
  >(() => Promise.resolve(null));
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

  // Gym-membership lookups backing the suspension gate — and, on a sign-in that
  // named a gym it couldn't be given, the membership-status gate. Default to "no
  // memberships" so login/refresh succeed unless a test opts into a membership.
  const gymMemberFindFirst = vi.fn<
    (args: unknown) => Promise<{ id?: string; status?: string } | null>
  >(() => Promise.resolve(null));
  // The "are you already a member of this gym?" lookup `signupMember` runs on a
  // taken address. Default to "no membership" → the plain EMAIL_TAKEN answer.
  const gymMemberFindUnique = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
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

  // The tenant a public self-signup joins. Default to a live gym with no stored
  // settings, so `signupMember` sees the shipped defaults for every policy.
  const gymFindFirst = vi.fn<(args: unknown) => Promise<GymRow | null>>(() =>
    Promise.resolve({ id: 'gym-1', slug: 'iron', name: 'Iron Gym', settings: null }),
  );
  // The named-gym suspension check, which looks the slug up on its own. Default
  // to "unknown slug" → nothing to gate, exactly as before the check existed.
  const gymFindUnique = vi.fn<
    (args: unknown) => Promise<{ status?: string; slug?: string } | null>
  >(() => Promise.resolve(null));
  // Signup's account + membership transaction. The callback is handed a client
  // whose two creates are recorded, so a test can assert what was written.
  const gymMemberCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'gm-1' }),
  );
  // The per-gym credential (T1.25): what signup / invite / social write, and what
  // verify / activate / reset stamp and rewrite. Defaults to "no row yet".
  const credentialFindUnique = vi.fn<
    (args: unknown) => Promise<{
      emailVerifiedAt?: Date | null;
      name?: string | null;
      passwordHash?: string | null;
    } | null>
  >(() => Promise.resolve(null));
  const credentialFindFirst = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(null),
  );
  const credentialCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'cred-1' }),
  );
  const credentialUpdate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'cred-1' }),
  );
  const credentialUpdateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>(() =>
    Promise.resolve({ count: 1 }),
  );
  const credentialUpsert = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'cred-1' }),
  );
  const gymCredential = {
    findUnique: credentialFindUnique,
    findFirst: credentialFindFirst,
    create: credentialCreate,
    update: credentialUpdate,
    updateMany: credentialUpdateMany,
    upsert: credentialUpsert,
  };
  const userUpsert = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'user-1' }),
  );
  const gymMemberUpsert = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'gm-1' }),
  );
  const transaction = vi.fn(
    <T>(
      fn: (tx: { user: unknown; gymMember: unknown; gymCredential: unknown }) => Promise<T>,
    ): Promise<T> =>
      fn({
        user: { create, upsert: userUpsert },
        gymMember: { create: gymMemberCreate, upsert: gymMemberUpsert },
        gymCredential,
      }),
  );
  // Signup's home-branch lookups: the gym's default when the body names none, and
  // the named branch otherwise. Default to "the gym has a default, and any branch
  // the body names is one of its active ones".
  const locationFindFirst = vi.fn<
    (args: { where: { id?: string; isDefault?: boolean } }) => Promise<{ id: string } | null>
  >(({ where }) => Promise.resolve({ id: where.isDefault ? 'loc-default' : where.id! }));

  const prisma = {
    client: {
      location: { findFirst: locationFindFirst },
      user: { findUnique, findMany, findFirst, create, update, updateMany },
      gymMember: {
        findFirst: gymMemberFindFirst,
        findMany: gymMemberFindMany,
        findUnique: gymMemberFindUnique,
      },
      gymCredential,
      gym: { findFirst: gymFindFirst, findUnique: gymFindUnique },
      $transaction: transaction,
    },
  } as unknown as PrismaService;
  const redis = { client: { set, get, del } } as unknown as RedisService;
  const tokens = {
    issueTokenPair,
    rotateRefreshToken,
    sessionForRefreshToken,
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
    findMany,
    findFirst,
    create,
    update,
    updateMany,
    set,
    get,
    del,
    issueTokenPair,
    rotateRefreshToken,
    sessionForRefreshToken,
    revokeRefreshToken,
    revokeAllForUser,
    sendVerificationEmail,
    sendPasswordResetEmail,
    verifyIdToken,
    verifyAppleIdToken,
    gymMemberFindFirst,
    gymMemberFindMany,
    gymMemberFindUnique,
    gymFindFirst,
    gymFindUnique,
    gymMemberCreate,
    locationFindFirst,
    credentialFindUnique,
    credentialFindFirst,
    credentialCreate,
    credentialUpdate,
    credentialUpdateMany,
    credentialUpsert,
    userUpsert,
    gymMemberUpsert,
  };
}

/** The Redis value an emailed token resolves to — see `TokenSubject` in the service. */
function subject(userId: string, gymId: string | null = null): string {
  return JSON.stringify({ userId, gymId });
}

/**
 * The scope a session resolves to when the user has no active gym membership
 * (the default in most specs): a platform-level account — no tenant, least
 * privilege. {@link AuthService.resolveSessionScope} stamps this into the access
 * token, and it is the second argument every `issueTokenPair` / rotation call
 * now carries.
 */
const SCOPELESS = { gymId: null, gymSlug: null, role: Role.MEMBER, tokenVersion: 0 };

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

/**
 * Queue the *third* `gymMemberFindFirst`: the membership-status lookup
 * `resolveSessionScope` runs only when a sign-in named a gym it could not be
 * given. `null` means "no membership in that gym at all" (the silent fallback to
 * the primary), which is also the default when this isn't called. Call it after
 * {@link membership}, whose two `Once`s queue in front of it.
 */
function requestedMembership(ctx: ReturnType<typeof setup>, status: GymMemberStatus | null): void {
  ctx.gymMemberFindFirst.mockResolvedValueOnce(status ? { status } : null);
}

/** The gyms the account-realm specs use, by slug. */
const KNOWN_GYMS: Record<string, { id: string; slug: string; name: string; status: string }> = {
  downtown: { id: 'gym-downtown', slug: 'downtown', name: 'Downtown', status: 'ACTIVE' },
  riverside: { id: 'gym-riverside', slug: 'riverside', name: 'Riverside', status: 'ACTIVE' },
};

/**
 * Answer every `gym.findUnique({ where: { slug } })` from {@link KNOWN_GYMS}: the
 * realm look-up of a sign-in / reset and the suspension check both read it.
 */
function knownGyms(
  ctx: ReturnType<typeof setup>,
  overrides: Record<string, { status: string }> = {},
): void {
  ctx.gymFindUnique.mockImplementation((args: unknown) => {
    const slug = (args as { where: { slug?: string } }).where.slug;
    const gym = slug ? KNOWN_GYMS[slug] : undefined;
    return Promise.resolve(gym ? { ...gym, ...overrides[slug!] } : null);
  });
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
    it('hashes the password, creates a platform account, stores a verify token, and emails it', async () => {
      const result = await ctx.service.register(VALID_REGISTER);

      expect(result).toEqual({ message: 'verification email sent' });
      expect(argonHash).toHaveBeenCalledWith('supersecret', expect.objectContaining({ type: 2 }));
      expect(ctx.create).toHaveBeenCalledWith({
        data: { email: 'a@b.com', realm: 'platform', name: 'Alice', passwordHash: 'argon2-hash' },
        select: { id: true },
      });

      // Token is stored under email-verify:<token> -> the whole identity (a bare
      // registration joins no gym) with a 24h TTL.
      const [key, value, ex, ttl] = ctx.set.mock.calls[0]!;
      expect(key).toMatch(/^email-verify:.+/);
      expect(value).toBe(subject('user-1'));
      expect(ex).toBe('EX');
      expect(ttl).toBe(86_400);

      const emailedToken = key.slice('email-verify:'.length);
      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith(
        'a@b.com',
        emailedToken,
        'Alice',
        'en',
        undefined,
        undefined,
      );
    });

    it('emails the verification link in the requested locale', async () => {
      await ctx.service.register(VALID_REGISTER, 'ka');

      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        'Alice',
        'ka',
        undefined,
        undefined,
      );
    });

    it('throws 409 EMAIL_TAKEN when the address holds any account, without creating a user', async () => {
      ctx.findFirst.mockResolvedValue({ id: 'existing' });

      const error = await ctx.service.register(VALID_REGISTER).catch((e: unknown) => e);

      // Any realm: a bare registration answers as it did before the split.
      expect(ctx.findFirst).toHaveBeenCalledWith({
        where: { email: 'a@b.com' },
        select: { id: true },
      });
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'EMAIL_TAKEN' });
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.set).not.toHaveBeenCalled();
    });

    it('still resolves 201 when the verification email fails to send', async () => {
      ctx.sendVerificationEmail.mockRejectedValue(new Error('resend down'));

      await expect(ctx.service.register(VALID_REGISTER)).resolves.toEqual({
        message: 'verification email sent',
      });
      // The account + token were still persisted.
      expect(ctx.create).toHaveBeenCalled();
      expect(ctx.set).toHaveBeenCalled();
    });
  });

  describe('register on a gym', () => {
    const input = { email: 'a@b.com', name: 'Alice', password: 'supersecret', gymSlug: 'iron' };

    it("creates the gym's member account, active membership and password without intake fields", async () => {
      await expect(ctx.service.register(input)).resolves.toEqual({
        message: 'verification email sent',
      });
      expect(ctx.userUpsert).toHaveBeenCalledWith({
        where: { email_realm: { email: input.email, realm: 'gym-1:member' } },
        create: {
          email: input.email,
          realm: 'gym-1:member',
          name: input.name,
          passwordHash: 'argon2-hash',
        },
        update: {},
        select: { id: true },
      });
      expect(ctx.gymMemberUpsert).toHaveBeenCalledWith({
        where: { userId_gymId: { userId: 'user-1', gymId: 'gym-1' } },
        create: {
          userId: 'user-1',
          gymId: 'gym-1',
          role: 'MEMBER',
          status: 'ACTIVE',
          locationId: 'loc-default',
        },
        update: {},
      });
      expect(ctx.credentialCreate).toHaveBeenCalledWith({
        data: { userId: 'user-1', gymId: 'gym-1', passwordHash: 'argon2-hash', name: 'Alice' },
      });
      expect(ctx.set).toHaveBeenCalledWith(
        expect.any(String),
        subject('user-1', 'gym-1'),
        'EX',
        86400,
      );
      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith(
        input.email,
        expect.any(String),
        'Alice',
        expect.any(String),
        'iron',
        'Iron Gym',
      );
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('only ever looks in this gym’s member realm, never at staff or other gyms', async () => {
      await ctx.service.register(input);
      expect(ctx.findFirst).not.toHaveBeenCalled();
      expect(ctx.findUnique).not.toHaveBeenCalled();
      expect(ctx.userUpsert).toHaveBeenCalledTimes(1);
      expect(ctx.userUpsert.mock.calls[0]?.[0]).toMatchObject({
        where: { email_realm: { realm: 'gym-1:member' } },
      });
    });

    it('finishes a staff-added member account without changing it', async () => {
      ctx.userUpsert.mockResolvedValue({ id: 'other-gym-user' });
      await expect(ctx.service.register(input)).resolves.toEqual({
        message: 'verification email sent',
      });
      expect(ctx.credentialFindUnique).toHaveBeenCalledWith({
        where: { userId_gymId: { userId: 'other-gym-user', gymId: 'gym-1' } },
        select: { passwordHash: true },
      });
      expect(ctx.credentialCreate).toHaveBeenCalledWith({
        data: {
          userId: 'other-gym-user',
          gymId: 'gym-1',
          passwordHash: 'argon2-hash',
          name: 'Alice',
        },
      });
      expect(ctx.update).not.toHaveBeenCalled();
    });

    it('refuses only a password already set in this gym', async () => {
      ctx.credentialFindUnique.mockResolvedValue({ passwordHash: 'existing-hash' });
      await expect(ctx.service.register(input)).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
      });
      expect(ctx.credentialCreate).not.toHaveBeenCalled();
      expect(ctx.credentialUpdateMany).not.toHaveBeenCalled();
      expect(ctx.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it.each([null, { passwordHash: null }])(
      'sets the first password for a staff-added credential %j',
      async (credential) => {
        ctx.credentialFindUnique.mockResolvedValue(credential);
        await expect(ctx.service.register(input)).resolves.toEqual({
          message: 'verification email sent',
        });
        expect(ctx.gymMemberUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
        if (credential) {
          expect(ctx.credentialUpdateMany).toHaveBeenCalledWith({
            where: { userId: 'user-1', gymId: 'gym-1', passwordHash: null },
            data: { passwordHash: 'argon2-hash', name: 'Alice', emailVerifiedAt: null },
          });
        } else {
          expect(ctx.credentialCreate).toHaveBeenCalled();
        }
        expect(ctx.sendVerificationEmail).toHaveBeenCalled();
      },
    );

    it('does not overwrite a password set by a concurrent registration', async () => {
      ctx.credentialFindUnique.mockResolvedValue({ passwordHash: null });
      ctx.credentialUpdateMany.mockResolvedValue({ count: 0 });
      await expect(ctx.service.register(input)).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
      });
      expect(ctx.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('rejects unknown or suspended gyms instead of falling back to platform registration', async () => {
      ctx.gymFindFirst.mockResolvedValue(null);
      await expect(ctx.service.register(input)).rejects.toMatchObject({
        response: { code: 'GYM_NOT_FOUND' },
      });
      expect(ctx.gymFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'iron', status: 'ACTIVE' } }),
      );
      expect(ctx.userUpsert).not.toHaveBeenCalled();
    });
  });

  describe('signupMember — start date', () => {
    // Carries every field the shipped intake defaults ask for, so these tests
    // fail on the start-date policy rather than on the intake check that runs
    // just before it.
    const VALID_SIGNUP = {
      gymId: 'gym-1',
      name: 'Nino',
      email: 'nino@example.com',
      password: 'supersecret',
      phone: '+995555000111',
      gender: 'FEMALE',
      dateOfBirth: '1994-03-02',
      personalId: '01001000000',
    } satisfies MemberSignupInput;

    // The window is counted in whole days in the GYM's zone, so "today" has to be
    // a fixed day or these would age out of it. Midday in `Asia/Tbilisi` (the
    // default zone) puts the server's instant and the gym's calendar day on the
    // same date, which is the case worth stating plainly.
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-01T08:00:00.000Z'));
      ctx.findUnique.mockResolvedValue(null);
    });
    afterEach(() => vi.useRealTimers());

    it('records a start date inside the window at UTC midnight, leaving joinedAt to say "today"', async () => {
      await ctx.service.signupMember({ ...VALID_SIGNUP, startDate: '2026-07-10' });

      const data = (ctx.gymMemberCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> })
        .data;
      expect(data.startDate).toEqual(new Date('2026-07-10T00:00:00.000Z'));
      // A recorded fact, nothing more: nothing here anchors billing or joining.
      expect(data).not.toHaveProperty('joinedAt');
    });

    it('leaves the column null when the body carries no start date', async () => {
      await ctx.service.signupMember(VALID_SIGNUP);

      const data = (ctx.gymMemberCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> })
        .data;
      expect(data.startDate).toBeNull();
    });

    it('rejects a date past the window with 400 START_DATE_OUT_OF_RANGE and creates nothing', async () => {
      // The default policy is 14 days ahead; this is a year out.
      const error = await ctx.service
        .signupMember({ ...VALID_SIGNUP, startDate: '2027-07-01' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'START_DATE_OUT_OF_RANGE',
        min: '2026-07-01',
        max: '2026-07-15',
      });
      expect(ctx.gymMemberCreate).not.toHaveBeenCalled();
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('rejects a backdated start date while the gym forbids one', async () => {
      await expect(
        ctx.service.signupMember({ ...VALID_SIGNUP, startDate: '2026-06-30' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an out-of-window date even though the gym never asks for one', async () => {
      // `memberIntake.startDate` is off by default, so nothing on the join form
      // would have collected this — which is exactly why the body reaching the
      // API cannot be trusted to have come from that form.
      ctx.gymFindFirst.mockResolvedValue({
        id: 'gym-1',
        slug: 'iron',
        settings: { memberIntake: { startDate: false } },
      });

      await expect(
        ctx.service.signupMember({ ...VALID_SIGNUP, startDate: '2027-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.gymMemberCreate).not.toHaveBeenCalled();
    });

    it('honours a gym that widened the window and allowed backdating', async () => {
      ctx.gymFindFirst.mockResolvedValue({
        id: 'gym-1',
        slug: 'iron',
        settings: { startDatePolicy: { maxDaysAhead: 90, allowPast: true } },
      });

      await ctx.service.signupMember({ ...VALID_SIGNUP, startDate: '2026-09-01' });

      const data = (ctx.gymMemberCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> })
        .data;
      expect(data.startDate).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    });

    it('reads "today" in the gym\'s zone, not the server\'s', async () => {
      // 22:00 UTC on the 1st is already 02:00 on the 2nd in Tbilisi (UTC+4), so
      // the 1st is yesterday there — and backdating is off by default.
      vi.setSystemTime(new Date('2026-07-01T22:00:00.000Z'));
      ctx.gymFindFirst.mockResolvedValue({
        id: 'gym-1',
        slug: 'iron',
        settings: { locale: { timezone: 'Asia/Tbilisi' } },
      });

      await expect(
        ctx.service.signupMember({ ...VALID_SIGNUP, startDate: '2026-07-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      // The gym's own "today" is accepted at the same instant.
      await expect(
        ctx.service.signupMember({ ...VALID_SIGNUP, startDate: '2026-07-02' }),
      ).resolves.toBeDefined();
    });
  });

  describe('signupMember — the home branch', () => {
    const VALID_SIGNUP = {
      gymId: 'gym-1',
      name: 'Nino',
      email: 'nino@example.com',
      password: 'supersecret',
      phone: '+995555000111',
      gender: 'FEMALE',
      dateOfBirth: '1994-03-02',
      personalId: '01001000000',
    } satisfies MemberSignupInput;

    const createdData = () =>
      (ctx.gymMemberCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

    it("files a member who names no branch under the gym's default", async () => {
      await ctx.service.signupMember(VALID_SIGNUP);

      expect(ctx.locationFindFirst).toHaveBeenCalledWith({
        where: { gymId: 'gym-1', isDefault: true },
        select: { id: true },
      });
      expect(createdData().locationId).toBe('loc-default');
    });

    it('leaves the home branch null when the gym has no default', async () => {
      ctx.locationFindFirst.mockResolvedValueOnce(null);

      await ctx.service.signupMember(VALID_SIGNUP);

      expect(createdData().locationId).toBeNull();
    });

    it('files the member under a branch they name, once it is an active one of this gym', async () => {
      await ctx.service.signupMember({ ...VALID_SIGNUP, locationId: 'loc-2' });

      expect(ctx.locationFindFirst).toHaveBeenCalledTimes(1);
      expect(ctx.locationFindFirst).toHaveBeenCalledWith({
        where: { id: 'loc-2', gymId: 'gym-1', status: 'ACTIVE' },
        select: { id: true },
      });
      expect(createdData().locationId).toBe('loc-2');
    });

    it("refuses another gym's branch with 400 LOCATION_NOT_FOUND before writing anything", async () => {
      // Pinned to `gymId: 'gym-1'`, the lookup cannot see a branch of another gym.
      ctx.locationFindFirst.mockResolvedValueOnce(null);

      const error = await ctx.service
        .signupMember({ ...VALID_SIGNUP, locationId: 'loc-other-gym' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'LOCATION_NOT_FOUND',
      });
      expect(ctx.locationFindFirst.mock.calls[0]?.[0].where).toMatchObject({ gymId: 'gym-1' });
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.gymMemberCreate).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('signupMember — the verification link', () => {
    const VALID_SIGNUP = {
      gymId: 'gym-1',
      name: 'Nino',
      email: 'nino@example.com',
      password: 'supersecret',
      phone: '+995555000111',
      gender: 'FEMALE',
      dateOfBirth: '1994-03-02',
      personalId: '01001000000',
    } satisfies MemberSignupInput;

    beforeEach(() => ctx.findUnique.mockResolvedValue(null));

    it("hands the joined gym's slug to the mailer, so the link comes back to that gym", async () => {
      await ctx.service.signupMember(VALID_SIGNUP);

      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith(
        'nino@example.com',
        expect.any(String),
        'Nino',
        'en',
        'iron',
        // The gym, not the platform, is who the mail is from.
        'Iron Gym',
      );
    });

    it('addresses a second gym at its own slug', async () => {
      ctx.gymFindFirst.mockResolvedValue({
        id: 'gym-2',
        slug: 'downtown',
        name: 'Downtown Strength',
        settings: null,
      });

      await ctx.service.signupMember({ ...VALID_SIGNUP, gymId: 'gym-2' });

      expect(ctx.sendVerificationEmail).toHaveBeenCalledWith(
        'nino@example.com',
        expect.any(String),
        'Nino',
        'en',
        'downtown',
        'Downtown Strength',
      );
    });
  });

  describe('signupMember — an address that already has an account', () => {
    // Same complete body the start-date block uses, so these fail on the 409
    // rather than on the intake check that runs before it.
    const VALID_SIGNUP = {
      gymId: 'gym-1',
      name: 'Nino',
      email: 'nino@example.com',
      password: 'supersecret',
      phone: '+995555000111',
      gender: 'FEMALE',
      dateOfBirth: '1994-03-02',
      personalId: '01001000000',
    } satisfies MemberSignupInput;

    beforeEach(() => {
      ctx.findUnique.mockResolvedValue({ id: 'user-existing' });
    });

    it('throws 409 ALREADY_MEMBER when the account already belongs to this gym', async () => {
      ctx.gymMemberFindUnique.mockResolvedValue({ id: 'gm-1' });

      const error = await ctx.service.signupMember(VALID_SIGNUP).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ALREADY_MEMBER' });
      // Asked about *this* gym's membership, not any membership anywhere.
      expect(ctx.gymMemberFindUnique).toHaveBeenCalledWith({
        where: { userId_gymId: { userId: 'user-existing', gymId: 'gym-1' } },
        select: { id: true },
      });
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.gymMemberCreate).not.toHaveBeenCalled();
    });

    it("looks the address up in this gym's member realm only", async () => {
      ctx.gymMemberFindUnique.mockResolvedValue({ id: 'gm-1' });

      await ctx.service.signupMember(VALID_SIGNUP).catch(() => undefined);

      expect(ctx.findUnique).toHaveBeenCalledWith({
        where: { email_realm: { email: 'nino@example.com', realm: 'gym-1:member' } },
        select: { id: true },
      });
    });

    it('rejoins a member account whose membership was purged, replacing its old password', async () => {
      ctx.gymMemberFindUnique.mockResolvedValue(null);

      const pair = await ctx.service.signupMember(VALID_SIGNUP);

      // The member account is reused, never re-created…
      expect(ctx.create).not.toHaveBeenCalled();
      // …its membership is new, and its credential carries the password just typed…
      expect(ctx.gymMemberCreate.mock.calls[0]?.[0]).toMatchObject({
        data: { userId: 'user-existing', gymId: 'gym-1', role: Role.MEMBER },
      });
      expect(ctx.credentialUpsert).toHaveBeenCalledWith({
        where: { userId_gymId: { userId: 'user-existing', gymId: 'gym-1' } },
        create: {
          userId: 'user-existing',
          gymId: 'gym-1',
          passwordHash: 'argon2-hash',
          name: 'Nino',
          phone: '+995555000111',
        },
        update: {
          passwordHash: 'argon2-hash',
          name: 'Nino',
          phone: '+995555000111',
          emailVerifiedAt: null,
        },
      });
      // …the verification link is for THIS gym's credential.
      expect(ctx.set.mock.calls[0]?.[1]).toBe(subject('user-existing', 'gym-1'));
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('creates a brand-new member account (an address known only as staff or elsewhere) with its credential', async () => {
      ctx.findUnique.mockResolvedValue(null);

      await ctx.service.signupMember(VALID_SIGNUP);

      expect(ctx.create).toHaveBeenCalledTimes(1);
      expect(ctx.create.mock.calls[0]?.[0]).toMatchObject({
        data: { email: 'nino@example.com', realm: 'gym-1:member' },
      });
      expect(ctx.credentialUpsert.mock.calls[0]?.[0]).toMatchObject({
        create: { userId: 'user-1', gymId: 'gym-1', passwordHash: 'argon2-hash' },
      });
      expect(ctx.set.mock.calls[0]?.[1]).toBe(subject('user-1', 'gym-1'));
    });
  });

  describe('verifyEmail', () => {
    it('consumes the token, stamps emailVerifiedAt, and issues a session', async () => {
      ctx.get.mockResolvedValue(subject('user-1'));

      const pair = await ctx.service.verifyEmail('tok');

      expect(ctx.del).toHaveBeenCalledWith('email-verify:tok');
      // Stamp only an unverified row, and `emailVerifiedAt` is a real Date.
      const update = ctx.updateMany.mock.calls[0]![0] as {
        where: unknown;
        data: { emailVerifiedAt: unknown };
      };
      expect(update.where).toEqual({ id: 'user-1', emailVerifiedAt: null });
      expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
      // A whole-identity token stamps every credential the account holds.
      expect(ctx.credentialUpdateMany.mock.calls[0]?.[0]).toMatchObject({
        where: { userId: 'user-1', emailVerifiedAt: null },
      });
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it("stamps only the token's gym credential, and binds the session to that gym", async () => {
      ctx.get.mockResolvedValue(subject('user-1', 'gym-riverside'));
      ctx.gymFindUnique.mockResolvedValue({ slug: 'riverside' });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-downtown',
          role: Role.MEMBER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE', slug: 'downtown' },
        },
        {
          gymId: 'gym-riverside',
          role: Role.MEMBER,
          joinedAt: new Date('2026-03-01'),
          gym: { status: 'ACTIVE', slug: 'riverside' },
        },
      ]);

      await ctx.service.verifyEmail('tok');

      expect(ctx.credentialUpdateMany.mock.calls[0]?.[0]).toMatchObject({
        where: { userId: 'user-1', gymId: 'gym-riverside', emailVerifiedAt: null },
      });
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-riverside',
        gymSlug: 'riverside',
        role: Role.MEMBER,
        tokenVersion: 0,
      });
    });

    it('still reads a token minted before subjects named a gym (a bare user id)', async () => {
      ctx.get.mockResolvedValue('user-legacy');

      await ctx.service.verifyEmail('tok');

      expect(ctx.updateMany.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'user-legacy', emailVerifiedAt: null },
      });
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-legacy', SCOPELESS);
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
      ctx.get.mockResolvedValue(subject('user-1'));
      ctx.del.mockResolvedValue(0);

      const error = await ctx.service.verifyEmail('tok').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.updateMany).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('requestPasswordReset', () => {
    /** A credential as `requestPasswordReset` reads it off an account. */
    const cred = (gymId: string, slug: string, name: string | null) => ({
      gymId,
      name,
      gym: { slug, name: slug === 'downtown' ? 'Downtown' : 'Riverside' },
    });
    const PLATFORM = {
      id: 'user-p',
      realm: 'platform',
      name: 'Sam',
      isSuperAdmin: false,
      credentials: [],
    };
    const DOWNTOWN_MEMBER = {
      id: 'user-dm',
      realm: 'gym-downtown:member',
      name: 'Sam',
      isSuperAdmin: false,
      credentials: [cred('gym-downtown', 'downtown', 'Sam D.')],
    };
    const DOWNTOWN_STAFF = {
      id: 'user-ds',
      realm: 'gym-downtown:staff',
      name: 'Sam',
      isSuperAdmin: false,
      credentials: [cred('gym-downtown', 'downtown', 'Coach Sam')],
    };
    const RIVERSIDE_MEMBER = {
      id: 'user-rm',
      realm: 'gym-riverside:member',
      name: 'Sam',
      isSuperAdmin: false,
      credentials: [cred('gym-riverside', 'riverside', null)],
    };

    beforeEach(() => knownGyms(ctx));

    it('mints a platform reset token for an address with no gym account, and emails it', async () => {
      ctx.findMany.mockResolvedValue([PLATFORM]);

      const result = await ctx.service.requestPasswordReset({ email: 'a@b.com' });

      expect(result).toEqual({
        message: 'If an account exists for that address, a reset link has been sent',
      });
      // Token stored under password-reset:<token> -> the platform account, 1h TTL.
      const [key, value, ex, ttl] = ctx.set.mock.calls[0]!;
      expect(key).toMatch(/^password-reset:.+/);
      expect(value).toBe(subject('user-p'));
      expect(ex).toBe('EX');
      expect(ttl).toBe(3_600);
      const emailedToken = key.slice('password-reset:'.length);
      expect(ctx.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@b.com',
        emailedToken,
        'Sam',
        'en',
        null,
        null,
        'member',
      );
    });

    it("resets the host gym's MEMBER account when no audience is sent, never the staff one", async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_STAFF, DOWNTOWN_MEMBER, RIVERSIDE_MEMBER]);

      await ctx.service.requestPasswordReset({ email: 'a@b.com' }, 'ka', 'downtown');

      expect(ctx.set).toHaveBeenCalledTimes(1);
      expect(ctx.set.mock.calls[0]?.[1]).toBe(subject('user-dm', 'gym-downtown'));
      expect(ctx.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        // The name that gym knows them by.
        'Sam D.',
        'ka',
        'downtown',
        'Downtown',
        'member',
      );
    });

    it("resets only the staff account for audience 'staff'", async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER, DOWNTOWN_STAFF]);

      await ctx.service.requestPasswordReset(
        { email: 'a@b.com', audience: 'staff' },
        null,
        'downtown',
      );

      expect(ctx.set).toHaveBeenCalledTimes(1);
      expect(ctx.set.mock.calls[0]?.[1]).toBe(subject('user-ds', 'gym-downtown'));
      // A staff account's link opens the admin console's reset page.
      expect(ctx.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        'Coach Sam',
        'en',
        'downtown',
        'Downtown',
        'staff',
      );
    });

    it('falls back to the staff account when the gym has no member account for the address', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_STAFF]);

      await ctx.service.requestPasswordReset({ email: 'a@b.com' }, null, 'downtown');

      expect(ctx.set.mock.calls[0]?.[1]).toBe(subject('user-ds', 'gym-downtown'));
    });

    it("prefers the gym the body names (the mobile app's remembered gym) over the host", async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER, RIVERSIDE_MEMBER]);

      await ctx.service.requestPasswordReset(
        { email: 'a@b.com', gymSlug: 'riverside' },
        null,
        'downtown',
      );

      expect(ctx.set.mock.calls[0]?.[1]).toBe(subject('user-rm', 'gym-riverside'));
      expect(ctx.sendPasswordResetEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        'Sam',
        'en',
        'riverside',
        'Riverside',
        'member',
      );
    });

    // The host is caller-chosen: it must not be able to steer a stranger's token
    // to a gym site the address has no account at.
    it('mints nothing when the host names a gym the address has no account at', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);

      const result = await ctx.service.requestPasswordReset(
        { email: 'a@b.com' },
        null,
        'riverside',
      );

      expect(result).toEqual({
        message: 'If an account exists for that address, a reset link has been sent',
      });
      expect(ctx.set).not.toHaveBeenCalled();
      expect(ctx.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('mints nothing for a member reset on a gym where the address is only staff', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_STAFF]);

      await ctx.service.requestPasswordReset(
        { email: 'a@b.com', audience: 'member' },
        null,
        'downtown',
      );

      expect(ctx.set).not.toHaveBeenCalled();
    });

    it('with no gym named, mails one single-account token per member account, each to its gym', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER, RIVERSIDE_MEMBER, DOWNTOWN_STAFF]);

      await ctx.service.requestPasswordReset({ email: 'a@b.com' });

      expect(ctx.set.mock.calls.map((call) => call[1])).toEqual([
        subject('user-dm', 'gym-downtown'),
        subject('user-rm', 'gym-riverside'),
      ]);
      expect(ctx.sendPasswordResetEmail.mock.calls.map((call) => call[4])).toEqual([
        'downtown',
        'riverside',
      ]);
    });

    it('returns the same generic message without minting a token when no account exists', async () => {
      const result = await ctx.service.requestPasswordReset({ email: 'ghost@b.com' });

      expect(result).toEqual({
        message: 'If an account exists for that address, a reset link has been sent',
      });
      expect(ctx.set).not.toHaveBeenCalled();
      expect(ctx.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('still resolves when the reset email fails to send (token already minted)', async () => {
      ctx.findMany.mockResolvedValue([{ ...PLATFORM, name: null }]);
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

    it('consumes a whole-identity token, sets every hash, revokes all sessions, and issues a session', async () => {
      ctx.get.mockResolvedValue(subject('user-1'));

      const pair = await ctx.service.resetPassword(VALID_RESET);

      expect(ctx.del).toHaveBeenCalledWith('password-reset:reset-tok');
      expect(argonHash).toHaveBeenCalledWith(
        'brand-new-secret',
        expect.objectContaining({ type: 2 }),
      );

      // New hash written to the resolved user — and to every gym credential it holds.
      const update = ctx.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { passwordHash: string };
      };
      expect(update.where).toEqual({ id: 'user-1' });
      expect(update.data.passwordHash).toBe('argon2-hash');
      expect(ctx.credentialUpdateMany.mock.calls[0]?.[0]).toEqual({
        where: { userId: 'user-1' },
        data: { passwordHash: 'argon2-hash' },
      });

      // Verification is stamped only on a still-unverified row.
      const stamp = ctx.updateMany.mock.calls[0]![0] as {
        where: unknown;
        data: { emailVerifiedAt: unknown };
      };
      expect(stamp.where).toEqual({ id: 'user-1', emailVerifiedAt: null });
      expect(stamp.data.emailVerifiedAt).toBeInstanceOf(Date);

      // All existing sessions are cut, then a fresh one is issued.
      expect(ctx.revokeAllForUser).toHaveBeenCalledWith('user-1', null);
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh', sessionIssued: true });
    });

    describe("a token minted for one gym's credential", () => {
      /** A member of both gyms, downtown the earlier-joined (primary) one. */
      const BOTH = [
        {
          gymId: 'gym-downtown',
          role: Role.MEMBER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE', slug: 'downtown' },
        },
        {
          gymId: 'gym-riverside',
          role: Role.TRAINER,
          joinedAt: new Date('2026-03-01'),
          gym: { status: 'ACTIVE', slug: 'riverside' },
        },
      ];

      beforeEach(() => {
        ctx.get.mockResolvedValue(subject('user-1', 'gym-riverside'));
        ctx.gymFindUnique.mockResolvedValue({ slug: 'riverside' });
        ctx.gymMemberFindMany.mockResolvedValue(BOTH);
      });

      it("rewrites only that gym's password and cuts only that gym's sessions", async () => {
        ctx.gymMemberFindFirst.mockResolvedValueOnce({ id: 'gm-riverside' });

        await ctx.service.resetPassword(VALID_RESET, 'riverside');

        expect(ctx.credentialUpsert).toHaveBeenCalledWith({
          where: { userId_gymId: { userId: 'user-1', gymId: 'gym-riverside' } },
          create: { userId: 'user-1', gymId: 'gym-riverside', passwordHash: 'argon2-hash' },
          update: { passwordHash: 'argon2-hash' },
        });
        // The platform credential and downtown's are untouched.
        expect(ctx.update).not.toHaveBeenCalled();
        expect(ctx.credentialUpdateMany.mock.calls[0]?.[0]).toMatchObject({
          where: { userId: 'user-1', gymId: 'gym-riverside', emailVerifiedAt: null },
        });
        expect(ctx.revokeAllForUser).toHaveBeenCalledWith('user-1', 'gym-riverside');
      });

      it("binds the session to the token's gym when completed on its own host", async () => {
        ctx.gymMemberFindFirst.mockResolvedValueOnce({ id: 'gm-riverside' });

        const result = await ctx.service.resetPassword(VALID_RESET, 'riverside');

        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
          gymId: 'gym-riverside',
          gymSlug: 'riverside',
          role: Role.TRAINER,
          tokenVersion: 0,
        });
        expect(result).toMatchObject({ sessionIssued: true });
      });

      it("also binds to the token's gym on a tenant-less host (the mobile app)", async () => {
        ctx.gymMemberFindFirst.mockResolvedValueOnce({ id: 'gm-riverside' });

        const result = await ctx.service.resetPassword(VALID_RESET, null);

        expect(ctx.issueTokenPair).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({
            gymSlug: 'riverside',
          }),
        );
        expect(result).toMatchObject({ sessionIssued: true });
      });

      it("changes the password but issues no session when completed on another gym's host", async () => {
        const result = await ctx.service.resetPassword(VALID_RESET, 'downtown');

        expect(ctx.credentialUpsert).toHaveBeenCalled();
        expect(ctx.issueTokenPair).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: true, sessionIssued: false });
      });
    });

    /** A member of both gyms, downtown the earlier-joined (primary) one. */
    const TWO_GYMS = [
      {
        gymId: 'gym-downtown',
        role: Role.MEMBER,
        joinedAt: new Date('2026-01-01'),
        gym: { status: 'ACTIVE', slug: 'downtown' },
      },
      {
        gymId: 'gym-riverside',
        role: Role.TRAINER,
        joinedAt: new Date('2026-03-01'),
        gym: { status: 'ACTIVE', slug: 'riverside' },
      },
    ];

    it("binds the session to the host's gym, not the primary, for a member there", async () => {
      ctx.get.mockResolvedValue(subject('user-1'));
      ctx.gymMemberFindFirst.mockResolvedValueOnce({ id: 'gm-riverside' });
      ctx.gymMemberFindMany.mockResolvedValue(TWO_GYMS);

      const result = await ctx.service.resetPassword(VALID_RESET, 'riverside');

      expect(ctx.gymMemberFindFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: GymMemberStatus.ACTIVE,
          gym: { slug: 'riverside', status: 'ACTIVE' },
        },
        select: { id: true },
      });
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-riverside',
        gymSlug: 'riverside',
        role: Role.TRAINER,
        tokenVersion: 0,
      });
      expect(result).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        sessionIssued: true,
      });
    });

    it('changes the password but issues no session on a gym the account is not active in', async () => {
      ctx.get.mockResolvedValue(subject('user-1'));
      // No active membership on riverside (none at all, or invited / suspended).
      ctx.gymMemberFindFirst.mockResolvedValueOnce(null);
      ctx.gymMemberFindMany.mockResolvedValue(TWO_GYMS.slice(0, 1));

      const result = await ctx.service.resetPassword(VALID_RESET, 'riverside');

      expect(ctx.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { passwordHash: 'argon2-hash' },
        }),
      );
      expect(ctx.revokeAllForUser).toHaveBeenCalledWith('user-1', null);
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, sessionIssued: false });
    });

    it('issues no session to a super-admin on a gym host', async () => {
      ctx.get.mockResolvedValue(subject('user-1'));
      ctx.findUnique.mockResolvedValue({ id: 'user-1', tokenVersion: 0, isSuperAdmin: true });
      ctx.gymMemberFindFirst.mockResolvedValueOnce({ id: 'gm-riverside' });
      ctx.gymMemberFindMany.mockResolvedValue(TWO_GYMS);

      const result = await ctx.service.resetPassword(VALID_RESET, 'riverside');

      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, sessionIssued: false });
    });

    it("resets ONE staff account's password and issues no session (the console signs in)", async () => {
      ctx.get.mockResolvedValue(subject('user-ds', 'gym-downtown'));
      ctx.findUnique.mockResolvedValue({ id: 'user-ds', realm: 'gym-downtown:staff' } as never);

      const result = await ctx.service.resetPassword({ token: 'tok', password: 'n3w-secret!' });

      expect(result).toEqual({ ok: true, sessionIssued: false });
      // That account's own gym credential, nothing else.
      expect(ctx.credentialUpsert).toHaveBeenCalledWith({
        where: { userId_gymId: { userId: 'user-ds', gymId: 'gym-downtown' } },
        create: { userId: 'user-ds', gymId: 'gym-downtown', passwordHash: 'argon2-hash' },
        update: { passwordHash: 'argon2-hash' },
      });
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.revokeAllForUser).toHaveBeenCalledWith('user-ds', 'gym-downtown');
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('keeps the primary-gym session on a tenant-less host', async () => {
      ctx.get.mockResolvedValue(subject('user-1'));
      ctx.gymMemberFindMany.mockResolvedValue(TWO_GYMS);

      const result = await ctx.service.resetPassword(VALID_RESET, null);

      expect(ctx.gymMemberFindFirst).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-1', {
        gymId: 'gym-downtown',
        gymSlug: 'downtown',
        role: Role.MEMBER,
        tokenVersion: 0,
      });
      expect(result).toMatchObject({ sessionIssued: true });
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
      ctx.get.mockResolvedValue(subject('user-1'));
      ctx.del.mockResolvedValue(0);

      const error = await ctx.service.resetPassword(VALID_RESET).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(argonHash).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.revokeAllForUser).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('activateAccount', () => {
    const VALID_ACTIVATE = { token: 'onboard-tok', password: 'brand-new-secret' };

    beforeEach(() => {
      // `activateAccount` reads the address back off the update so the console can
      // pre-fill sign-in; the shared stub answers with an id only.
      ctx.update.mockResolvedValue({ email: 'owner@example.com' } as unknown as { id: string });
    });

    it('consumes the verify token, sets the first password, stamps verification, and answers with the address', async () => {
      ctx.get.mockResolvedValue('owner-1');

      const result = await ctx.service.activateAccount(VALID_ACTIVATE);

      // Redeemed from the SAME namespace registerGym writes to, so the onboarding
      // link in the owner's mail is the token this consumes.
      expect(ctx.get).toHaveBeenCalledWith('email-verify:onboard-tok');
      expect(ctx.del).toHaveBeenCalledWith('email-verify:onboard-tok');
      expect(argonHash).toHaveBeenCalledWith(
        'brand-new-secret',
        expect.objectContaining({ type: 2 }),
      );

      const update = ctx.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { passwordHash: string };
        select: unknown;
      };
      expect(update.where).toEqual({ id: 'owner-1' });
      expect(update.data.passwordHash).toBe('argon2-hash');
      expect(update.select).toEqual({ email: true });

      const stamp = ctx.updateMany.mock.calls[0]![0] as {
        where: unknown;
        data: { emailVerifiedAt: unknown };
      };
      expect(stamp.where).toEqual({ id: 'owner-1', emailVerifiedAt: null });
      expect(stamp.data.emailVerifiedAt).toBeInstanceOf(Date);

      expect(result).toEqual({ email: 'owner@example.com' });
    });

    it('issues NO session — the owner signs in with the password they just chose', async () => {
      ctx.get.mockResolvedValue('owner-1');

      await ctx.service.activateAccount(VALID_ACTIVATE);

      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
      // A password set from an emailed token cuts anything already signed in,
      // exactly as a reset does.
      expect(ctx.revokeAllForUser).toHaveBeenCalledWith('owner-1', null);
    });

    describe("a token minted for the new gym's credential", () => {
      beforeEach(() => {
        ctx.get.mockResolvedValue(subject('owner-1', 'gym-1'));
        ctx.gymFindUnique.mockResolvedValue({ slug: 'downtown' });
        ctx.findUnique.mockResolvedValue({ id: 'owner-1', email: 'owner@example.com' } as never);
      });

      it("sets that gym's password and verification, leaving every other password alone", async () => {
        const result = await ctx.service.activateAccount(VALID_ACTIVATE, 'downtown');

        expect(ctx.credentialUpsert).toHaveBeenCalledWith({
          where: { userId_gymId: { userId: 'owner-1', gymId: 'gym-1' } },
          create: { userId: 'owner-1', gymId: 'gym-1', passwordHash: 'argon2-hash' },
          update: { passwordHash: 'argon2-hash' },
        });
        expect(ctx.update).not.toHaveBeenCalled();
        expect(ctx.credentialUpdateMany.mock.calls[0]?.[0]).toMatchObject({
          where: { userId: 'owner-1', gymId: 'gym-1', emailVerifiedAt: null },
        });
        expect(ctx.revokeAllForUser).toHaveBeenCalledWith('owner-1', 'gym-1');
        expect(result).toEqual({ email: 'owner@example.com' });
      });

      it("refuses 403 TENANT_MISMATCH on another gym's host by the token's own gym, without spending it", async () => {
        const error = await ctx.service
          .activateAccount(VALID_ACTIVATE, 'riverside')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toMatchObject({
          code: 'TENANT_MISMATCH',
        });
        // Decided from the token, not from a membership lookup.
        expect(ctx.gymMemberFindFirst).not.toHaveBeenCalled();
        expect(ctx.del).not.toHaveBeenCalled();
        expect(ctx.credentialUpsert).not.toHaveBeenCalled();
      });
    });

    it('throws 400 TOKEN_INVALID_OR_EXPIRED for an unknown / expired token', async () => {
      ctx.get.mockResolvedValue(null);

      const error = await ctx.service.activateAccount(VALID_ACTIVATE).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
      expect(ctx.del).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
    });

    it('rejects a token already consumed by a racing request (DEL returns 0)', async () => {
      ctx.get.mockResolvedValue('owner-1');
      ctx.del.mockResolvedValue(0);

      const error = await ctx.service.activateAccount(VALID_ACTIVATE).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(argonHash).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('refuses a second activation with the same link — the token is gone after the first', async () => {
      ctx.get.mockResolvedValueOnce('owner-1').mockResolvedValueOnce(null);

      await ctx.service.activateAccount(VALID_ACTIVATE);
      const error = await ctx.service.activateAccount(VALID_ACTIVATE).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
      expect(ctx.update).toHaveBeenCalledTimes(1);
    });

    it("activates on the owner's own gym host", async () => {
      ctx.get.mockResolvedValue('owner-1');
      ctx.gymMemberFindFirst.mockResolvedValue({ id: 'membership-1' });

      const result = await ctx.service.activateAccount(VALID_ACTIVATE, 'downtown');

      expect(ctx.gymMemberFindFirst).toHaveBeenCalledWith({
        where: { userId: 'owner-1', gym: { slug: 'downtown' } },
        select: { id: true },
      });
      expect(result).toEqual({ email: 'owner@example.com' });
    });

    it("refuses 403 TENANT_MISMATCH on another gym's host, without spending the token", async () => {
      ctx.get.mockResolvedValue('owner-1');
      ctx.gymMemberFindFirst.mockResolvedValue(null);

      const error = await ctx.service
        .activateAccount(VALID_ACTIVATE, 'riverside')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'TENANT_MISMATCH',
      });
      expect(ctx.del).not.toHaveBeenCalled();
      expect(argonHash).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const VALID_LOGIN = { email: 'a@b.com', password: 'supersecret' };
    const VERIFIED = new Date('2026-01-01');

    /** A gym credential as the sign-in projection nests it. */
    const credential = (
      slug: 'downtown' | 'riverside',
      passwordHash: string | null,
      overrides: Partial<StoredCredential> = {},
    ): StoredCredential => ({
      gymId: KNOWN_GYMS[slug]!.id,
      passwordHash,
      emailVerifiedAt: VERIFIED,
      gym: { slug, name: KNOWN_GYMS[slug]!.name, status: 'ACTIVE' },
      ...overrides,
    });

    /** One gym account: a user row in `<gymId>:<audience>`, holding its own credential. */
    const gymAccount = (
      id: string,
      slug: 'downtown' | 'riverside',
      audience: 'staff' | 'member',
      passwordHash: string | null,
      overrides: Partial<StoredCredential> = {},
    ) => ({
      id,
      realm: `${KNOWN_GYMS[slug]!.id}:${audience}`,
      passwordHash: 'platform-copy-never-checked',
      emailVerifiedAt: VERIFIED,
      isSuperAdmin: false,
      credentials: [credential(slug, passwordHash, overrides)],
    });

    /** A platform account: a bare registration (or a super-admin). */
    const platformAccount = (overrides: Record<string, unknown> = {}) => ({
      id: 'user-p',
      realm: 'platform',
      passwordHash: 'platform-hash',
      emailVerifiedAt: VERIFIED,
      isSuperAdmin: false,
      credentials: [],
      ...overrides,
    });

    const DOWNTOWN_MEMBER = gymAccount('user-dm', 'downtown', 'member', 'member-hash');
    const DOWNTOWN_STAFF = gymAccount('user-ds', 'downtown', 'staff', 'staff-hash');
    const RIVERSIDE_MEMBER = gymAccount('user-rm', 'riverside', 'member', 'riverside-hash');

    /** The one membership a gym account holds, as the scope resolver reads it. */
    const scopeMembership = (slug: 'downtown' | 'riverside', role: Role) => ({
      gymId: KNOWN_GYMS[slug]!.id,
      role,
      joinedAt: VERIFIED,
      gym: { status: 'ACTIVE', slug },
    });

    /** argon2 that accepts exactly these (hash, password) pairs. */
    function passwords(pairs: Record<string, string>): void {
      argonVerify.mockImplementation((hash, password) => Promise.resolve(pairs[hash] === password));
    }

    beforeEach(() => knownGyms(ctx));

    it('signs a platform account in with its own password, tenant-less', async () => {
      ctx.findMany.mockResolvedValue([platformAccount()]);
      passwords({ 'platform-hash': 'supersecret' });

      const pair = await ctx.service.login(VALID_LOGIN);

      // Every realm's account for the address is read in one query.
      expect(ctx.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'a@b.com' } }),
      );
      expect(argonVerify).toHaveBeenCalledWith('platform-hash', 'supersecret');
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-p', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    describe('one address, a staff account and a member account in the same gym', () => {
      beforeEach(() => {
        ctx.findMany.mockResolvedValue([DOWNTOWN_STAFF, DOWNTOWN_MEMBER]);
        passwords({ 'member-hash': 'member-pw', 'staff-hash': 'staff-pw' });
        membership(ctx, { hasAny: true, hasActive: true });
      });

      it("signs audience 'member' into the member account with the member password", async () => {
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MEMBER)]);

        await ctx.service.login(
          { email: 'a@b.com', password: 'member-pw', audience: 'member' },
          'downtown',
        );

        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-dm', {
          gymId: 'gym-downtown',
          gymSlug: 'downtown',
          role: Role.MEMBER,
          tokenVersion: 0,
        });
        // A member sign-in checks the member account and nothing else.
        expect(argonVerify).toHaveBeenCalledTimes(1);
      });

      it("signs audience 'staff' into the staff account with the staff password", async () => {
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MANAGER)]);

        await ctx.service.login(
          { email: 'a@b.com', password: 'staff-pw', audience: 'staff' },
          'downtown',
        );

        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-ds', {
          gymId: 'gym-downtown',
          gymSlug: 'downtown',
          role: Role.MANAGER,
          tokenVersion: 0,
        });
      });

      it("refuses the staff password on audience 'member' with the plain 401", async () => {
        const error = await ctx.service
          .login({ email: 'a@b.com', password: 'staff-pw', audience: 'member' }, 'downtown')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).getResponse()).toMatchObject({
          code: 'INVALID_CREDENTIALS',
        });
        expect(ctx.issueTokenPair).not.toHaveBeenCalled();
      });

      it("refuses the member password on audience 'staff' with the plain 401", async () => {
        const error = await ctx.service
          .login({ email: 'a@b.com', password: 'member-pw', audience: 'staff' }, 'downtown')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(ctx.issueTokenPair).not.toHaveBeenCalled();
      });

      it('with no audience, a member password lands on the member account', async () => {
        // The matched account's one membership, as the scope resolver reads it.
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MEMBER)]);

        await ctx.service.login({ email: 'a@b.com', password: 'member-pw' }, 'downtown');

        expect(ctx.issueTokenPair).toHaveBeenCalledWith(
          'user-dm',
          expect.objectContaining({ gymSlug: 'downtown', role: Role.MEMBER }),
        );
        // The scope is resolved for the account the password opened.
        expect(ctx.gymMemberFindMany.mock.calls[0]?.[0]).toMatchObject({
          where: { userId: 'user-dm' },
        });
      });

      it('with no audience, a staff password lands on the staff account (member tried first)', async () => {
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MANAGER)]);

        await ctx.service.login({ email: 'a@b.com', password: 'staff-pw' }, 'downtown');

        expect(ctx.issueTokenPair).toHaveBeenCalledWith(
          'user-ds',
          expect.objectContaining({ gymSlug: 'downtown', role: Role.MANAGER }),
        );
        expect(ctx.gymMemberFindMany.mock.calls[0]?.[0]).toMatchObject({
          where: { userId: 'user-ds' },
        });
        expect(argonVerify).toHaveBeenCalledWith('member-hash', 'staff-pw');
        expect(argonVerify).toHaveBeenCalledWith('staff-hash', 'staff-pw');
      });
    });

    it('with no audience and one password on both accounts, prefers the member account', async () => {
      ctx.findMany.mockResolvedValue([
        gymAccount('user-ds', 'downtown', 'staff', 'same-hash'),
        gymAccount('user-dm', 'downtown', 'member', 'same-hash'),
      ]);
      passwords({ 'same-hash': 'supersecret' });
      ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MEMBER)]);

      await ctx.service.login(VALID_LOGIN, 'downtown');

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-dm', expect.anything());
    });

    it('spends the same KDF work on a gym host whether or not any account exists', async () => {
      // No audience: the member slot, the staff slot and the super-admin slot.
      ctx.findMany.mockResolvedValue([]);
      argonVerify.mockResolvedValue(false);
      await ctx.service.login(VALID_LOGIN, 'downtown').catch(() => undefined);
      const unknownCount = argonVerify.mock.calls.length;

      argonVerify.mockClear();
      ctx.findMany.mockResolvedValue([DOWNTOWN_STAFF, DOWNTOWN_MEMBER]);
      await ctx.service.login(VALID_LOGIN, 'downtown').catch(() => undefined);

      expect(unknownCount).toBe(3);
      expect(argonVerify).toHaveBeenCalledTimes(unknownCount);
    });

    it('answers 401 on a gym where the address has no account, though it has one elsewhere', async () => {
      // A riverside member typing their riverside password on downtown's site.
      ctx.findMany.mockResolvedValue([RIVERSIDE_MEMBER]);
      passwords({ 'riverside-hash': 'supersecret' });

      const error = await ctx.service.login(VALID_LOGIN, 'downtown').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(argonVerify).not.toHaveBeenCalledWith('riverside-hash', expect.anything());
    });

    it('answers 401 on an unknown gym slug', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);
      passwords({ 'member-hash': 'supersecret' });

      const error = await ctx.service
        .login({ ...VALID_LOGIN, gymSlug: 'nowhere' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
    });

    it('takes the gym from the body over the tenant host', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER, RIVERSIDE_MEMBER]);
      passwords({ 'riverside-hash': 'supersecret', 'member-hash': 'supersecret' });
      ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('riverside', Role.MEMBER)]);

      await ctx.service.login({ ...VALID_LOGIN, gymSlug: 'riverside' }, 'downtown');

      expect(ctx.issueTokenPair).toHaveBeenCalledWith(
        'user-rm',
        expect.objectContaining({ gymSlug: 'riverside' }),
      );
    });

    describe('with no gym named (the mobile app)', () => {
      it('signs in at the one gym whose account the password opens', async () => {
        ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER, RIVERSIDE_MEMBER]);
        passwords({ 'riverside-hash': 'supersecret', 'member-hash': 'other' });
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('riverside', Role.MEMBER)]);

        await ctx.service.login(VALID_LOGIN);

        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-rm', {
          gymId: 'gym-riverside',
          gymSlug: 'riverside',
          role: Role.MEMBER,
          tokenVersion: 0,
        });
      });

      it('answers 409 GYM_SELECTION_REQUIRED listing only the gyms the password opened', async () => {
        const third = gymAccount('user-x', 'downtown', 'staff', 'wrong-hash');
        ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER, RIVERSIDE_MEMBER, third]);
        passwords({ 'member-hash': 'supersecret', 'riverside-hash': 'supersecret' });

        const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'GYM_SELECTION_REQUIRED',
          data: {
            gyms: [
              { slug: 'downtown', name: 'Downtown' },
              { slug: 'riverside', name: 'Riverside' },
            ],
          },
        });
        expect(ctx.issueTokenPair).not.toHaveBeenCalled();
      });

      it('counts one gym once when its member and staff accounts both match, landing on the member', async () => {
        ctx.findMany.mockResolvedValue([
          gymAccount('user-ds', 'downtown', 'staff', 'same-hash'),
          gymAccount('user-dm', 'downtown', 'member', 'same-hash'),
        ]);
        passwords({ 'same-hash': 'supersecret' });
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MEMBER)]);

        await ctx.service.login(VALID_LOGIN);

        expect(ctx.issueTokenPair).toHaveBeenCalledWith(
          'user-dm',
          expect.objectContaining({ gymSlug: 'downtown', role: Role.MEMBER }),
        );
      });

      it("ignores staff accounts for audience 'member'", async () => {
        ctx.findMany.mockResolvedValue([DOWNTOWN_STAFF]);
        passwords({ 'staff-hash': 'supersecret' });

        const error = await ctx.service
          .login({ ...VALID_LOGIN, audience: 'member' })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(argonVerify).not.toHaveBeenCalledWith('staff-hash', expect.anything());
      });

      it('skips accounts of suspended gyms and accounts without a password', async () => {
        ctx.findMany.mockResolvedValue([
          gymAccount('user-dm', 'downtown', 'member', 'member-hash', {
            gym: { slug: 'downtown', name: 'Downtown', status: 'SUSPENDED' },
          }),
          gymAccount('user-rm', 'riverside', 'member', null),
        ]);
        argonVerify.mockResolvedValue(false);

        const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

        // No gym account to check: the (absent) platform account is checked instead,
        // against the dummy hash.
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(argonVerify).toHaveBeenCalledTimes(1);
        expect(argonVerify).not.toHaveBeenCalledWith('member-hash', expect.anything());
      });

      it('falls back to the platform account when the address has no gym account', async () => {
        ctx.findMany.mockResolvedValue([platformAccount()]);
        passwords({ 'platform-hash': 'supersecret' });

        await ctx.service.login(VALID_LOGIN);

        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-p', SCOPELESS);
      });

      it('throws 401 INVALID_CREDENTIALS for an unknown email — but still runs a verify', async () => {
        argonVerify.mockResolvedValue(false);

        const error = await ctx.service.login(VALID_LOGIN).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(argonVerify).toHaveBeenCalledTimes(1);
        expect(ctx.issueTokenPair).not.toHaveBeenCalled();
      });
    });

    describe('a platform super-admin', () => {
      const SUPER = platformAccount({ id: 'user-sa', isSuperAdmin: true });

      beforeEach(() => {
        ctx.findUnique.mockResolvedValue({ id: 'user-sa', tokenVersion: 0, isSuperAdmin: true });
      });

      it('stays tenant-less when it signs in on a gym host with the platform password', async () => {
        ctx.findMany.mockResolvedValue([SUPER]);
        passwords({ 'platform-hash': 'supersecret' });
        membership(ctx, { hasAny: false, hasActive: false });

        await ctx.service.login({ ...VALID_LOGIN, audience: 'staff' }, 'riverside');

        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-sa', {
          gymId: null,
          gymSlug: null,
          role: Role.SUPER_ADMIN,
          tokenVersion: 0,
        });
      });

      it("is never considered for audience 'member'", async () => {
        ctx.findMany.mockResolvedValue([SUPER]);
        passwords({ 'platform-hash': 'supersecret' });

        const error = await ctx.service
          .login({ ...VALID_LOGIN, audience: 'member' }, 'riverside')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
      });

      it('wins over its own gym accounts on a tenant-less sign-in', async () => {
        ctx.findMany.mockResolvedValue([
          SUPER,
          gymAccount('user-ds', 'downtown', 'staff', 'platform-hash'),
        ]);
        passwords({ 'platform-hash': 'supersecret' });

        await ctx.service.login(VALID_LOGIN);

        expect(ctx.issueTokenPair).toHaveBeenCalledWith(
          'user-sa',
          expect.objectContaining({ role: Role.SUPER_ADMIN }),
        );
      });
    });

    it('throws 401 when the password is wrong', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);
      argonVerify.mockResolvedValue(false);

      await expect(ctx.service.login(VALID_LOGIN, 'downtown')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('treats a malformed-hash verify error as a failed login', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);
      argonVerify.mockRejectedValue(new Error('pchstr must contain a $ as first char'));

      await expect(ctx.service.login(VALID_LOGIN, 'downtown')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws 403 EMAIL_NOT_VERIFIED when the password is right but the address is unverified', async () => {
      ctx.findMany.mockResolvedValue([
        gymAccount('user-dm', 'downtown', 'member', 'member-hash', { emailVerifiedAt: null }),
      ]);
      passwords({ 'member-hash': 'supersecret' });

      const error = await ctx.service.login(VALID_LOGIN, 'downtown').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
      });
    });

    it('throws 403 GYM_SUSPENDED for a correct password on a suspended gym', async () => {
      knownGyms(ctx, { downtown: { status: 'SUSPENDED' } });
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);
      passwords({ 'member-hash': 'supersecret' });

      const error = await ctx.service.login(VALID_LOGIN, 'downtown').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('throws 403 MEMBERSHIP_NOT_ACTIVE for an account whose membership is only INVITED', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);
      passwords({ 'member-hash': 'supersecret' });
      membership(ctx, { hasAny: true, hasActive: true });
      requestedMembership(ctx, GymMemberStatus.INVITED);
      ctx.gymMemberFindMany.mockResolvedValue([]);

      const error = await ctx.service.login(VALID_LOGIN, 'downtown').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'MEMBERSHIP_NOT_ACTIVE',
      });
    });

    describe('a staff invite token on the sign-in', () => {
      it("redeems it for audience 'staff'", async () => {
        ctx.findMany.mockResolvedValue([DOWNTOWN_STAFF]);
        passwords({ 'staff-hash': 'supersecret' });
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MANAGER)]);
        const redeem = vi
          .spyOn(ctx.service as never, 'redeemStaffInvite' as never)
          .mockResolvedValue(null);

        await ctx.service.login(
          { ...VALID_LOGIN, audience: 'staff', inviteToken: 'invite-tok' },
          'downtown',
        );

        expect(redeem).toHaveBeenCalledWith('a@b.com', 'invite-tok', {
          passwordHash: 'argon2-hash',
        });
        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-ds', expect.anything());
      });

      it("never redeems it for audience 'member'", async () => {
        ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);
        passwords({ 'member-hash': 'supersecret' });
        ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MEMBER)]);
        const redeem = vi.spyOn(ctx.service as never, 'redeemStaffInvite' as never);

        await ctx.service.login(
          { ...VALID_LOGIN, audience: 'member', inviteToken: 'invite-tok' },
          'downtown',
        );

        expect(redeem).not.toHaveBeenCalled();
        expect(argonHash).not.toHaveBeenCalled();
        expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-dm', expect.anything());
      });
    });

    it('carries the account tokenVersion into the session scope', async () => {
      ctx.findMany.mockResolvedValue([DOWNTOWN_MEMBER]);
      passwords({ 'member-hash': 'supersecret' });
      ctx.findUnique.mockResolvedValue({ id: 'user-dm', tokenVersion: 7, isSuperAdmin: false });
      ctx.gymMemberFindMany.mockResolvedValue([scopeMembership('downtown', Role.MEMBER)]);

      await ctx.service.login(VALID_LOGIN, 'downtown');

      expect(ctx.issueTokenPair).toHaveBeenCalledWith(
        'user-dm',
        expect.objectContaining({ tokenVersion: 7 }),
      );
    });
  });

  describe('loginWithGoogle', () => {
    const VALID = { idToken: 'google-id-token' };
    /** An account as the social look-up projects it. */
    const social = (
      id: string,
      realm: string,
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      id,
      realm,
      isSuperAdmin: false,
      emailVerifiedAt: new Date('2026-01-01'),
      googleId: null,
      appleId: null,
      memberships:
        realm === 'platform'
          ? []
          : [{ joinedAt: new Date('2026-01-01'), gym: { status: 'ACTIVE' } }],
      ...overrides,
    });

    beforeEach(() => knownGyms(ctx));

    it('issues a session for an account already linked by googleId, without relinking', async () => {
      ctx.findMany.mockResolvedValue([social('user-9', 'platform', { googleId: 'g-1' })]);

      const pair = await ctx.service.loginWithGoogle(VALID);

      expect(ctx.verifyIdToken).toHaveBeenCalledWith('google-id-token');
      // One query for the subject id or the verified address, every realm.
      expect(ctx.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { OR: [{ googleId: 'g-1' }, { email: 'a@b.com' }] } }),
      );
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-9', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('links googleId onto a same-email account and stamps verification', async () => {
      ctx.findMany.mockResolvedValue([social('user-7', 'platform', { emailVerifiedAt: null })]);

      await ctx.service.loginWithGoogle(VALID);

      const update = ctx.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { googleId: string; emailVerifiedAt: unknown };
      };
      expect(update.where).toEqual({ id: 'user-7' });
      expect(update.data.googleId).toBe('g-1');
      expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('preserves an already-verified timestamp when linking', async () => {
      const verifiedAt = new Date('2025-01-01');
      ctx.findMany.mockResolvedValue([
        social('user-7', 'platform', { emailVerifiedAt: verifiedAt }),
      ]);

      await ctx.service.loginWithGoogle(VALID);

      const update = ctx.update.mock.calls[0]![0] as { data: { emailVerifiedAt: unknown } };
      expect(update.data.emailVerifiedAt).toBe(verifiedAt);
    });

    it('creates a verified platform account when no account matches and no gym is named', async () => {
      ctx.create.mockResolvedValue({ id: 'user-new' });

      const pair = await ctx.service.loginWithGoogle(VALID);

      const created = ctx.create.mock.calls[0]![0] as {
        data: {
          email: string;
          realm: string;
          name: string | null;
          googleId: string;
          emailVerifiedAt: unknown;
        };
      };
      expect(created.data.email).toBe('a@b.com');
      expect(created.data.realm).toBe('platform');
      expect(created.data.googleId).toBe('g-1');
      expect(created.data.name).toBe('Alice');
      expect(created.data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-new', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('never creates an account on a gym host: 403 NOT_A_MEMBER before any write', async () => {
      const error = await ctx.service
        .loginWithGoogle({ ...VALID, gymSlug: 'riverside' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
      expect(ctx.create).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it("signs a gym host's audience 'member' into the member account, leaving the staff one alone", async () => {
      ctx.findMany.mockResolvedValue([
        social('user-ds', 'gym-downtown:staff', { googleId: 'g-1' }),
        social('user-dm', 'gym-downtown:member'),
      ]);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-downtown',
          role: Role.MEMBER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE', slug: 'downtown' },
        },
      ]);

      await ctx.service.loginWithGoogle({ ...VALID, gymSlug: 'downtown', audience: 'member' });

      // The member account is linked (the staff one holds the id in its own realm).
      expect(ctx.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-dm' } }),
      );
      expect(ctx.issueTokenPair).toHaveBeenCalledWith(
        'user-dm',
        expect.objectContaining({ gymSlug: 'downtown', role: Role.MEMBER }),
      );
    });

    it('with no audience on a gym host, prefers the member account over the staff one', async () => {
      ctx.findMany.mockResolvedValue([
        social('user-ds', 'gym-downtown:staff'),
        social('user-dm', 'gym-downtown:member'),
      ]);
      membership(ctx, { hasAny: true, hasActive: true });

      await ctx.service.loginWithGoogle({ ...VALID, gymSlug: 'downtown' }).catch(() => undefined);

      expect(ctx.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-dm' } }),
      );
    });

    it("refuses audience 'staff' on a gym where the address is only a member", async () => {
      ctx.findMany.mockResolvedValue([social('user-dm', 'gym-downtown:member')]);

      const error = await ctx.service
        .loginWithGoogle({ ...VALID, gymSlug: 'downtown', audience: 'staff' })
        .catch((e: unknown) => e);

      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('with no gym named, picks the member account over a staff account', async () => {
      ctx.findMany.mockResolvedValue([
        social('user-ds', 'gym-downtown:staff', { googleId: 'g-1' }),
        social('user-rm', 'gym-riverside:member', { googleId: 'g-1' }),
      ]);

      await ctx.service.loginWithGoogle(VALID);

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-rm', expect.anything());
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
      expect(ctx.findMany).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('refuses a session when the resolved account’s gym is suspended', async () => {
      ctx.findMany.mockResolvedValue([
        social('user-9', 'gym-downtown:member', { googleId: 'g-1' }),
      ]);
      membership(ctx, { hasAny: true, hasActive: false });

      const error = await ctx.service.loginWithGoogle(VALID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
      expect(ctx.issueTokenPair).not.toHaveBeenCalled();
    });

    it('keeps a platform super-admin tenant-less on a gym host', async () => {
      ctx.findMany.mockResolvedValue([
        social('user-sa', 'platform', { isSuperAdmin: true, googleId: 'g-1' }),
      ]);
      ctx.findUnique.mockResolvedValue({ id: 'user-sa', tokenVersion: 0, isSuperAdmin: true });

      await ctx.service.loginWithGoogle({ ...VALID, gymSlug: 'downtown' });

      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-sa', {
        gymId: null,
        gymSlug: null,
        role: Role.SUPER_ADMIN,
        tokenVersion: 0,
      });
    });
  });

  describe('loginWithApple', () => {
    const VALID = { idToken: 'apple-id-token' };
    const social = (
      id: string,
      realm: string,
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      id,
      realm,
      isSuperAdmin: false,
      emailVerifiedAt: new Date('2026-01-01'),
      googleId: null,
      appleId: null,
      memberships:
        realm === 'platform'
          ? []
          : [{ joinedAt: new Date('2026-01-01'), gym: { status: 'ACTIVE' } }],
      ...overrides,
    });

    beforeEach(() => knownGyms(ctx));

    it('issues a session for an account already linked by appleId — without needing email', async () => {
      ctx.verifyAppleIdToken.mockResolvedValue({ appleId: 'ap-1', emailVerified: false });
      ctx.findMany.mockResolvedValue([social('user-9', 'platform', { appleId: 'ap-1' })]);

      await ctx.service.loginWithApple(VALID);

      // No usable address: matched by the subject id alone.
      expect(ctx.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { appleId: 'ap-1' } }),
      );
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-9', SCOPELESS);
    });

    it('links appleId onto a same-email account and stamps verification', async () => {
      ctx.findMany.mockResolvedValue([social('user-7', 'platform', { emailVerifiedAt: null })]);

      await ctx.service.loginWithApple(VALID);

      const update = ctx.update.mock.calls[0]![0] as {
        where: { id: string };
        data: { appleId: string; emailVerifiedAt: unknown };
      };
      expect(update.where).toEqual({ id: 'user-7' });
      expect(update.data.appleId).toBe('ap-1');
      expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('creates a verified platform account (using the forwarded name) when nothing matches', async () => {
      ctx.create.mockResolvedValue({ id: 'user-new' });

      await ctx.service.loginWithApple({ ...VALID, name: 'Ana' });

      const created = ctx.create.mock.calls[0]![0] as {
        data: { email: string; realm: string; name: string | null; appleId: string };
      };
      expect(created.data).toMatchObject({
        email: 'a@b.com',
        realm: 'platform',
        name: 'Ana',
        appleId: 'ap-1',
      });
      expect(ctx.issueTokenPair).toHaveBeenCalledWith('user-new', SCOPELESS);
    });

    it('creates an account with a null name when none is forwarded', async () => {
      await ctx.service.loginWithApple(VALID);

      const created = ctx.create.mock.calls[0]![0] as { data: { name: string | null } };
      expect(created.data.name).toBeNull();
    });

    it('never creates an account on a gym host: 403 NOT_A_MEMBER before any write', async () => {
      const error = await ctx.service
        .loginWithApple({ ...VALID, gymSlug: 'riverside' })
        .catch((e: unknown) => e);

      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('rejects a new identity when Apple withholds the email', async () => {
      ctx.verifyAppleIdToken.mockResolvedValue({ appleId: 'ap-1', emailVerified: false });

      const error = await ctx.service.loginWithApple(VALID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'APPLE_EMAIL_UNAVAILABLE',
      });
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('rejects a new identity whose Apple email is unverified, never linking by it', async () => {
      ctx.verifyAppleIdToken.mockResolvedValue({
        appleId: 'ap-1',
        email: 'a@b.com',
        emailVerified: false,
      });

      const error = await ctx.service.loginWithApple(VALID).catch((e: unknown) => e);

      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'APPLE_EMAIL_NOT_VERIFIED',
      });
      expect(ctx.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { appleId: 'ap-1' } }),
      );
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it("signs audience 'staff' on a gym host into that gym's staff account only", async () => {
      ctx.findMany.mockResolvedValue([
        social('user-dm', 'gym-downtown:member', { appleId: 'ap-1' }),
        social('user-ds', 'gym-downtown:staff'),
      ]);
      membership(ctx, { hasAny: true, hasActive: true });
      ctx.gymMemberFindMany.mockResolvedValue([
        {
          gymId: 'gym-downtown',
          role: Role.TRAINER,
          joinedAt: new Date('2026-01-01'),
          gym: { status: 'ACTIVE', slug: 'downtown' },
        },
      ]);

      await ctx.service.loginWithApple({ ...VALID, gymSlug: 'downtown', audience: 'staff' });

      expect(ctx.issueTokenPair).toHaveBeenCalledWith(
        'user-ds',
        expect.objectContaining({ role: Role.TRAINER }),
      );
    });
  });

  describe('refresh', () => {
    it('delegates to the token service rotation', async () => {
      const pair = await ctx.service.refresh({ refreshToken: 'rt-secret' });

      expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', SCOPELESS);
      expect(pair).toEqual({ accessToken: 'access2', refreshToken: 'refresh2' });
    });

    it('blocks the rotation when the token owner has only suspended gyms', async () => {
      ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: null });
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
      ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: null });
      membership(ctx, { hasAny: true, hasActive: true });

      await ctx.service.refresh({ refreshToken: 'rt-secret' });

      expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', SCOPELESS);
    });

    it('rotates without a suspension check for an unknown/expired token (lets rotation 401)', async () => {
      ctx.sessionForRefreshToken.mockResolvedValue(null);

      await ctx.service.refresh({ refreshToken: 'rt-secret' });

      expect(ctx.gymMemberFindFirst).not.toHaveBeenCalled();
      expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', SCOPELESS);
    });

    describe('the gym a refresh token is pinned to', () => {
      /** A member of downtown (primary, earliest-joined) and riverside. */
      function twoGyms(): void {
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
      }

      const RIVERSIDE = {
        gymId: 'gym-riverside',
        gymSlug: 'riverside',
        role: Role.TRAINER,
        tokenVersion: 0,
      };
      const DOWNTOWN = {
        gymId: 'gym-downtown',
        gymSlug: 'downtown',
        role: Role.OWNER,
        tokenVersion: 0,
      };

      it.each([true, false])(
        'preserves super-admin refresh scope (gym pinned: %s)',
        async (pinned) => {
          ctx.findUnique.mockResolvedValue({ id: 'user-1', isSuperAdmin: true });
          ctx.sessionForRefreshToken.mockResolvedValue({
            userId: 'user-1',
            gymId: pinned ? 'gym-riverside' : null,
          });
          if (pinned) ctx.gymFindUnique.mockResolvedValueOnce({ slug: 'riverside' });
          twoGyms();
          await ctx.service.refresh({ refreshToken: 'rt-secret' }, 'downtown');
          expect(ctx.rotateRefreshToken).toHaveBeenCalledWith(
            'rt-secret',
            pinned
              ? RIVERSIDE
              : {
                  gymId: null,
                  gymSlug: null,
                  role: Role.SUPER_ADMIN,
                  tokenVersion: 0,
                },
          );
        },
      );

      it('rejects a super-admin gym refresh after active membership is removed', async () => {
        ctx.findUnique.mockResolvedValue({ id: 'user-1', isSuperAdmin: true });
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: 'gym-riverside' });
        ctx.gymFindUnique.mockResolvedValueOnce({ slug: 'riverside' });
        await expect(ctx.service.refresh({ refreshToken: 'rt-secret' })).rejects.toMatchObject({
          response: { code: 'REFRESH_TOKEN_INVALID' },
        });
        expect(ctx.rotateRefreshToken).not.toHaveBeenCalled();
      });

      it('keeps a session on its pinned, non-primary gym', async () => {
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: 'gym-riverside' });
        ctx.gymFindUnique.mockResolvedValueOnce({ slug: 'riverside' });
        twoGyms();

        await ctx.service.refresh({ refreshToken: 'rt-secret' });

        expect(ctx.gymFindUnique).toHaveBeenNthCalledWith(1, {
          where: { id: 'gym-riverside' },
          select: { slug: true },
        });
        expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', RIVERSIDE);
      });

      it('ignores the tenant host once the token is pinned', async () => {
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: 'gym-riverside' });
        ctx.gymFindUnique.mockResolvedValueOnce({ slug: 'riverside' });
        twoGyms();

        await ctx.service.refresh({ refreshToken: 'rt-secret' }, 'downtown');

        expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', RIVERSIDE);
      });

      it('401s (and does not fall back to the primary) once the pinned membership is gone', async () => {
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: 'gym-riverside' });
        ctx.gymFindUnique.mockResolvedValueOnce({ slug: 'riverside' });
        membership(ctx, { hasAny: true, hasActive: true });
        // Still an active member of downtown — but not of riverside any more.
        ctx.gymMemberFindMany.mockResolvedValue([
          {
            gymId: 'gym-downtown',
            role: Role.OWNER,
            joinedAt: new Date('2026-01-01'),
            gym: { status: 'ACTIVE', slug: 'downtown' },
          },
        ]);

        const error = await ctx.service
          .refresh({ refreshToken: 'rt-secret' })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).getResponse()).toMatchObject({
          code: 'REFRESH_TOKEN_INVALID',
        });
        expect(ctx.rotateRefreshToken).not.toHaveBeenCalled();
      });

      it('401s when the pinned gym no longer exists', async () => {
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: 'gym-gone' });
        ctx.gymFindUnique.mockResolvedValueOnce(null);

        await expect(ctx.service.refresh({ refreshToken: 'rt-secret' })).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        expect(ctx.rotateRefreshToken).not.toHaveBeenCalled();
      });

      it('403s GYM_SUSPENDED when the pinned gym is suspended, even with another live gym', async () => {
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: 'gym-riverside' });
        ctx.gymFindUnique
          .mockResolvedValueOnce({ slug: 'riverside' })
          .mockResolvedValueOnce({ status: 'SUSPENDED' });
        twoGyms();

        const error = await ctx.service
          .refresh({ refreshToken: 'rt-secret' })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toMatchObject({
          code: 'GYM_SUSPENDED',
        });
        expect(ctx.rotateRefreshToken).not.toHaveBeenCalled();
      });

      it('re-scopes an unpinned (legacy) token to the primary gym', async () => {
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: null });
        twoGyms();

        await ctx.service.refresh({ refreshToken: 'rt-secret' });

        expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', DOWNTOWN);
      });

      it('lets the tenant host choose the gym for an unpinned token', async () => {
        ctx.sessionForRefreshToken.mockResolvedValue({ userId: 'user-1', gymId: null });
        twoGyms();

        await ctx.service.refresh({ refreshToken: 'rt-secret' }, 'riverside');

        expect(ctx.rotateRefreshToken).toHaveBeenCalledWith('rt-secret', RIVERSIDE);
      });
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
  const gymUpdate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'gym-1' }),
  );
  const gymMemberCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'member-1' }),
  );
  const credentialCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'cred-1' }),
  );

  // The transaction runs its callback against a `tx` exposing the write fakes.
  const tx = {
    user: { create: userCreate },
    gym: { create: gymCreate, update: gymUpdate },
    gymMember: { create: gymMemberCreate },
    gymCredential: { create: credentialCreate },
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
    gymUpdate,
    gymMemberCreate,
    credentialCreate,
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

  it('skips both activation token and activation email for operator live onboarding', async () => {
    await ctx.service.registerGym(VALID_GYM, 'operator-1', null, { skipOnboardingEmail: true });
    expect(ctx.gymCreate).toHaveBeenCalledOnce();
    expect(ctx.set).not.toHaveBeenCalled();
    expect(ctx.sendOwnerOnboardingEmail).not.toHaveBeenCalled();
  });

  it('creates a new owner, gym, and OWNER membership, then sends the onboarding email', async () => {
    const result = await ctx.service.registerGym(VALID_GYM);

    // The gym first, then the owner as a staff account of THAT gym, with the
    // hashed password and supplied name.
    expect(argonHash).toHaveBeenCalledWith('supersecret', expect.objectContaining({ type: 2 }));
    expect(ctx.gymCreate).toHaveBeenCalledWith({
      data: { name: 'Downtown Strength', slug: 'downtown' },
      select: { id: true },
    });
    expect(ctx.userCreate).toHaveBeenCalledWith({
      data: {
        email: 'owner@example.com',
        realm: 'gym-1:staff',
        name: 'Olivia Owner',
        passwordHash: 'argon2-hash',
      },
      select: { id: true },
    });
    // Gym records its owner and who provisioned it (the owner, for self-signup).
    expect(ctx.gymUpdate).toHaveBeenCalledWith({
      where: { id: 'gym-1' },
      data: { ownerId: 'owner-1', createdByUserId: 'owner-1' },
      select: { id: true },
    });
    expect(ctx.gymMemberCreate).toHaveBeenCalledWith({
      data: { userId: 'owner-1', gymId: 'gym-1', role: 'OWNER', status: 'ACTIVE' },
    });
    // The owner's credential FOR THIS GYM carries the password (T1.25).
    expect(ctx.credentialCreate).toHaveBeenCalledWith({
      data: {
        userId: 'owner-1',
        gymId: 'gym-1',
        passwordHash: 'argon2-hash',
        name: 'Olivia Owner',
      },
    });

    // Onboarding token stored under the same email-verify namespace verifyEmail
    // consumes, naming the new gym so activation sets ITS password.
    const [key, value, ex, ttl] = ctx.set.mock.calls[0]!;
    expect(key).toMatch(/^email-verify:.+/);
    expect(value).toBe(JSON.stringify({ userId: 'owner-1', gymId: 'gym-1' }));
    expect(ex).toBe('EX');
    expect(ttl).toBe(86_400);

    const token = key.slice('email-verify:'.length);
    expect(ctx.sendOwnerOnboardingEmail).toHaveBeenCalledWith(
      'owner@example.com',
      token,
      'Downtown Strength',
      'Olivia Owner',
      'en',
      // The slug addresses the link at the new gym's own console host.
      'downtown',
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

  it('gives an address known elsewhere a NEW staff account of the new gym, never reusing one', async () => {
    const result = await ctx.service.registerGym(VALID_GYM);

    // No look-up of existing accounts: the new gym's staff realm cannot hold one.
    expect(ctx.userFindUnique).not.toHaveBeenCalled();
    expect(ctx.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'owner@example.com',
          realm: 'gym-1:staff',
        }) as unknown,
      }),
    );
    expect(ctx.gymMemberCreate).toHaveBeenCalledWith({
      data: { userId: 'owner-1', gymId: 'gym-1', role: 'OWNER', status: 'ACTIVE' },
    });
    expect(result).toMatchObject({ ownerUserId: 'owner-1' });
  });

  it('records the operator as the creator when a super-admin provisions the gym', async () => {
    await ctx.service.registerGym(VALID_GYM, 'operator-1');

    expect(ctx.gymUpdate).toHaveBeenCalledWith({
      where: { id: 'gym-1' },
      data: { ownerId: 'owner-1', createdByUserId: 'operator-1' },
      select: { id: true },
    });
  });

  it('creates the owner without a password hash when none is supplied', async () => {
    const { password: _omit, ...noPassword } = VALID_GYM;

    await ctx.service.registerGym(noPassword);

    expect(argonHash).not.toHaveBeenCalled();
    expect(ctx.userCreate).toHaveBeenCalledWith({
      data: {
        email: 'owner@example.com',
        realm: 'gym-1:staff',
        name: 'Olivia Owner',
        passwordHash: null,
      },
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
