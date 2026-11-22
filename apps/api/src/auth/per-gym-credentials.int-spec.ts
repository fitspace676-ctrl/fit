import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { GymMemberStatus, GymStatus, Role } from '@fit/db';
import { GYM_SELECTION_REQUIRED_CODE } from '@fit/types';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { TenantMiddleware } from '../common/tenant/tenant.middleware';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import {
  clearRequestAccessResolver,
  registerRequestAccessResolver,
} from '../common/rbac/request-access';
import { defaultsRequestAccessResolver } from '../test/request-access-stub';
import { CheckoutController } from '../catalogue/checkout.controller';
import { CheckoutService } from '../catalogue/checkout.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { TokenService, type SessionClaims } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';
import { prisma, resetDb, disconnect } from '../test/integration-db';
import { PLATFORM_REALM, gymRealm, type AccountAudience } from './account-realm';

/**
 * Per-gym, per-audience accounts (T1.25 + the account split), proven against a
 * real Postgres: one address, a member account at two gyms with two passwords,
 * and (where a test adds it) a staff account at one of them with a third. Everything that touches the DB is real — Prisma, argon2,
 * the `TokenService` (so a reset's session revocation is exercised against real
 * `refresh_tokens` rows). Redis is an in-memory map so the emailed tokens can be
 * read back; mail is captured rather than sent.
 */
function harness() {
  const store = new Map<string, string>();
  const redis = {
    client: {
      set: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      },
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      del: (key: string) => Promise.resolve(store.delete(key) ? 1 : 0),
    },
  } as unknown as RedisService;

  const mail: { kind: string; to: string; token: string; gymSlug?: string | null }[] = [];
  const email = {
    sendVerificationEmail: (to: string, token: string, _n: unknown, _l: unknown, slug?: string) => {
      mail.push({ kind: 'verify', to, token, gymSlug: slug });
      return Promise.resolve();
    },
    sendOwnerOnboardingEmail: (
      to: string,
      token: string,
      _g: unknown,
      _n: unknown,
      _l: unknown,
      slug?: string,
    ) => {
      mail.push({ kind: 'onboarding', to, token, gymSlug: slug });
      return Promise.resolve();
    },
    sendPasswordResetEmail: (
      to: string,
      token: string,
      _n: unknown,
      _l: unknown,
      slug?: string | null,
    ) => {
      mail.push({ kind: 'reset', to, token, gymSlug: slug });
      return Promise.resolve();
    },
  } as unknown as EmailService;

  const prismaService = new PrismaService();
  const tokens = new TokenService(prismaService);
  const auth = new AuthService(
    prismaService,
    redis,
    tokens,
    email,
    {} as unknown as GoogleOAuthService,
    {} as unknown as AppleOAuthService,
  );

  /** The last mail of `kind` sent to `to`, popped so a second one can be awaited. */
  const lastMail = (kind: string, to: string) => {
    const index = mail.map((m) => m.kind === kind && m.to === to).lastIndexOf(true);
    expect(index, `no ${kind} mail to ${to}`).toBeGreaterThanOrEqual(0);
    return mail.splice(index, 1)[0]!;
  };

  return { auth, tokens, mail, lastMail, store };
}

const EMAIL = 'sam@example.com';
const DOWNTOWN_PASSWORD = 'downtown-secret-1';
const RIVERSIDE_PASSWORD = 'riverside-secret-2';
const STAFF_PASSWORD = 'downtown-staff-3';
const PLATFORM_PASSWORD = 'platform-secret-4';

/** An argon2id digest, as the real sign-in verifies it. */
function hash(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * One gym account for {@link EMAIL}: a user row in the gym's staff or member realm,
 * its single membership, and its credential. Returns the user id.
 */
async function account(
  gymId: string,
  audience: AccountAudience,
  password: string | null,
  options: { role?: Role; name?: string; status?: GymMemberStatus } = {},
): Promise<string> {
  const role = options.role ?? (audience === 'member' ? Role.MEMBER : Role.MANAGER);
  const passwordHash = password ? await hash(password) : null;
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      realm: gymRealm(gymId, audience),
      name: options.name ?? 'Sam',
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.gymMember.create({
    data: { userId: user.id, gymId, role, status: options.status ?? GymMemberStatus.ACTIVE },
  });
  await prisma.gymCredential.create({
    data: {
      userId: user.id,
      gymId,
      passwordHash,
      emailVerifiedAt: new Date(),
      name: options.name ?? 'Sam',
    },
  });
  return user.id;
}

/** The profile a gym's default join form demands (`gymPublicMemberIntake`). */
const INTAKE = {
  phone: '+995555000111',
  gender: 'OTHER' as const,
  dateOfBirth: '1995-05-05',
  personalId: '01001000001',
};

/** Decode the gym a session was issued for out of the access JWT (unverified). */
function claimsOf(accessToken: string): SessionClaims {
  const payload = accessToken.split('.')[1]!;
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims;
}

describe('per-gym, per-audience accounts (integration)', () => {
  const h = harness();
  let downtownId: string;
  let riversideId: string;
  /** Sam's member account at Downtown. */
  let downtownMember: string;
  /** Sam's member account at Riverside. */
  let riversideMember: string;

  beforeEach(async () => {
    await resetDb();
    h.mail.length = 0;
    h.store.clear();
    const [downtown, riverside] = await Promise.all([
      prisma.gym.create({ data: { name: 'Downtown', slug: 'downtown', status: GymStatus.ACTIVE } }),
      prisma.gym.create({
        data: { name: 'Riverside', slug: 'riverside', status: GymStatus.ACTIVE },
      }),
    ]);
    downtownId = downtown.id;
    riversideId = riverside.id;

    // What the account-realm migration leaves an existing two-gym member as: one
    // member account per gym, each with its own password.
    downtownMember = await account(downtownId, 'member', DOWNTOWN_PASSWORD, {
      name: 'Sam (Downtown)',
    });
    riversideMember = await account(riversideId, 'member', RIVERSIDE_PASSWORD, {
      name: 'Sam (Riverside)',
    });
  });

  afterAll(disconnect);

  describe('register', () => {
    it('registers one email in two gyms as two member accounts with separate passwords', async () => {
      const email = 'registered@example.com';
      for (const [gymSlug, password] of [
        ['downtown', DOWNTOWN_PASSWORD],
        ['riverside', RIVERSIDE_PASSWORD],
      ]) {
        await expect(
          h.auth.register({ email, name: `Member ${gymSlug}`, password: password!, gymSlug }),
        ).resolves.toEqual({ message: 'verification email sent' });
      }
      const accounts = await prisma.user.findMany({
        where: { email },
        include: { memberships: true, credentials: true },
      });
      expect(accounts.map((a) => a.realm).sort()).toEqual(
        [gymRealm(downtownId, 'member'), gymRealm(riversideId, 'member')].sort(),
      );
      for (const a of accounts) {
        expect(a.memberships).toHaveLength(1);
        expect(a.credentials).toHaveLength(1);
      }

      const riversideMail = h.lastMail('verify', email);
      const downtownMail = h.lastMail('verify', email);
      expect(riversideMail.gymSlug).toBe('riverside');
      const downtown = await h.auth.verifyEmail(downtownMail.token);
      expect(claimsOf(downtown.accessToken)).toMatchObject({ gymId: downtownId });
      await expect(
        h.auth.login({ email, password: RIVERSIDE_PASSWORD }, 'riverside'),
      ).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
      await h.auth.verifyEmail(riversideMail.token);

      for (const [gymSlug, password, wrongPassword, gymId] of [
        ['downtown', DOWNTOWN_PASSWORD, RIVERSIDE_PASSWORD, downtownId],
        ['riverside', RIVERSIDE_PASSWORD, DOWNTOWN_PASSWORD, riversideId],
      ]) {
        const session = await h.auth.login({ email, password: password! }, gymSlug);
        expect(claimsOf(session.accessToken)).toMatchObject({ gymId });
        await expect(
          h.auth.login({ email, password: wrongPassword! }, gymSlug),
        ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
        await expect(
          h.auth.register({ email, name: 'Duplicate', password: 'replacement-password', gymSlug }),
        ).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
      }
    });

    it('sets the first password of a staff-added member account, touching no other account', async () => {
      await prisma.gymCredential.update({
        where: { userId_gymId: { userId: riversideMember, gymId: riversideId } },
        data: { passwordHash: null },
      });
      const before = await prisma.gymCredential.findUniqueOrThrow({
        where: { userId_gymId: { userId: downtownMember, gymId: downtownId } },
      });

      await h.auth.register({
        email: EMAIL,
        name: 'Sam Riverside',
        password: 'new-riverside-password',
        gymSlug: 'riverside',
      });
      await h.auth.verifyEmail(h.lastMail('verify', EMAIL).token);
      const session = await h.auth.login(
        { email: EMAIL, password: 'new-riverside-password' },
        'riverside',
      );
      expect(claimsOf(session.accessToken)).toMatchObject({
        sub: riversideMember,
        gymId: riversideId,
        role: Role.MEMBER,
      });
      expect(
        await prisma.gymCredential.findUniqueOrThrow({
          where: { userId_gymId: { userId: downtownMember, gymId: downtownId } },
        }),
      ).toEqual(before);
      expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(2);
    });

    it("a member registration never touches the gym's staff account of the same address", async () => {
      const staff = await account(downtownId, 'staff', STAFF_PASSWORD);
      await prisma.gymMember.delete({
        where: { userId_gymId: { userId: downtownMember, gymId: downtownId } },
      });
      await prisma.user.delete({ where: { id: downtownMember } });

      await h.auth.register({
        email: EMAIL,
        name: 'Sam',
        password: 'member-password-9',
        gymSlug: 'downtown',
      });

      const member = await prisma.user.findUniqueOrThrow({
        where: { email_realm: { email: EMAIL, realm: gymRealm(downtownId, 'member') } },
      });
      expect(member.id).not.toBe(staff);
      const staffCredential = await prisma.gymCredential.findUniqueOrThrow({
        where: { userId_gymId: { userId: staff, gymId: downtownId } },
      });
      await expect(argon2.verify(staffCredential.passwordHash!, STAFF_PASSWORD)).resolves.toBe(
        true,
      );
    });

    it('allows concurrent registrations of a new email in different gyms', async () => {
      const email = 'concurrent@example.com';
      const results = await Promise.all([
        h.auth.register({
          email,
          name: 'Downtown',
          password: DOWNTOWN_PASSWORD,
          gymSlug: 'downtown',
        }),
        h.auth.register({
          email,
          name: 'Riverside',
          password: RIVERSIDE_PASSWORD,
          gymSlug: 'riverside',
        }),
      ]);
      expect(results).toEqual([
        { message: 'verification email sent' },
        { message: 'verification email sent' },
      ]);
      expect(await prisma.user.count({ where: { email } })).toBe(2);
      expect(await prisma.gymCredential.count({ where: { user: { email } } })).toBe(2);
    });
  });

  describe('a staff account and a member account in the same gym', () => {
    let downtownStaff: string;

    beforeEach(async () => {
      downtownStaff = await account(downtownId, 'staff', STAFF_PASSWORD, {
        role: Role.MANAGER,
        name: 'Coach Sam',
      });
    });

    it('each audience signs into its own account with its own password', async () => {
      const member = await h.auth.login(
        { email: EMAIL, password: DOWNTOWN_PASSWORD, audience: 'member' },
        'downtown',
      );
      expect(claimsOf(member.accessToken)).toMatchObject({
        sub: downtownMember,
        gymId: downtownId,
        role: Role.MEMBER,
      });

      const staff = await h.auth.login(
        { email: EMAIL, password: STAFF_PASSWORD, audience: 'staff' },
        'downtown',
      );
      expect(claimsOf(staff.accessToken)).toMatchObject({
        sub: downtownStaff,
        gymId: downtownId,
        role: Role.MANAGER,
      });

      // Two live sessions side by side: refreshing one leaves the other alone.
      await expect(
        h.auth.refresh({ refreshToken: member.refreshToken }, 'downtown'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.refresh({ refreshToken: staff.refreshToken }, 'downtown'),
      ).resolves.toBeDefined();
    });

    it("neither password opens the other audience's account", async () => {
      await expect(
        h.auth.login({ email: EMAIL, password: STAFF_PASSWORD, audience: 'member' }, 'downtown'),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD, audience: 'staff' }, 'downtown'),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    });

    it('a client that sends no audience gets the member account first, then the staff one', async () => {
      const viaMember = await h.auth.login(
        { email: EMAIL, password: DOWNTOWN_PASSWORD },
        'downtown',
      );
      expect(claimsOf(viaMember.accessToken)).toMatchObject({ sub: downtownMember });

      const viaStaff = await h.auth.login({ email: EMAIL, password: STAFF_PASSWORD }, 'downtown');
      expect(claimsOf(viaStaff.accessToken)).toMatchObject({
        sub: downtownStaff,
        role: Role.MANAGER,
      });

      // One password on both accounts: the member account wins.
      await prisma.gymCredential.update({
        where: { userId_gymId: { userId: downtownStaff, gymId: downtownId } },
        data: { passwordHash: await hash(DOWNTOWN_PASSWORD) },
      });
      const shared = await h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'downtown');
      expect(claimsOf(shared.accessToken)).toMatchObject({ sub: downtownMember });
    });

    it('with no gym named, the staff password signs in only without a member audience', async () => {
      await expect(
        h.auth.login({ email: EMAIL, password: STAFF_PASSWORD, audience: 'member' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const session = await h.auth.login({ email: EMAIL, password: STAFF_PASSWORD });
      expect(claimsOf(session.accessToken)).toMatchObject({
        sub: downtownStaff,
        gymId: downtownId,
        role: Role.MANAGER,
      });
    });

    it('a reset of the member account leaves the staff account and its sessions alone', async () => {
      const staffSession = await h.auth.login(
        { email: EMAIL, password: STAFF_PASSWORD, audience: 'staff' },
        'downtown',
      );

      await h.auth.requestPasswordReset({ email: EMAIL, audience: 'member' }, null, 'downtown');
      expect(h.mail).toHaveLength(1);
      const { token } = h.lastMail('reset', EMAIL);
      await h.auth.resetPassword({ token, password: 'new-member-password' }, 'downtown');

      await expect(
        h.auth.login(
          { email: EMAIL, password: 'new-member-password', audience: 'member' },
          'downtown',
        ),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: STAFF_PASSWORD, audience: 'staff' }, 'downtown'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.refresh({ refreshToken: staffSession.refreshToken }, 'downtown'),
      ).resolves.toBeDefined();
    });

    it('a staff reset touches only the staff account and issues no session', async () => {
      await h.auth.requestPasswordReset({ email: EMAIL, audience: 'staff' }, null, 'downtown');
      expect(h.mail).toHaveLength(1);
      const { token } = h.lastMail('reset', EMAIL);
      const result = await h.auth.resetPassword(
        { token, password: 'new-staff-password' },
        'downtown',
      );
      expect(result).toEqual({ ok: true, sessionIssued: false });

      await expect(
        h.auth.login(
          { email: EMAIL, password: 'new-staff-password', audience: 'staff' },
          'downtown',
        ),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD, audience: 'member' }, 'downtown'),
      ).resolves.toBeDefined();
    });
  });

  describe('super-admin member checkout', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      registerRequestAccessResolver(defaultsRequestAccessResolver());
      const moduleRef = await Test.createTestingModule({
        controllers: [CheckoutController],
        providers: [
          TenantContext,
          TenantGuard,
          PermissionsGuard,
          {
            provide: CheckoutService,
            // Purchase mechanics have their own tests; exercise the real HTTP guards here.
            useValue: {
              checkout: () =>
                Promise.resolve({
                  productType: 'credit_pack',
                  orderId: 'order-1',
                  subscriptionId: null,
                }),
            },
          },
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      const middleware = new TenantMiddleware(h.tokens);
      app.use((req: Request, res: Response, next: NextFunction) => middleware.use(req, res, next));
      await app.listen(3005, '127.0.0.1');
      baseUrl = await app.getUrl();
    });

    afterAll(async () => {
      await app?.close();
      clearRequestAccessResolver();
    });

    /** The operator's platform account, same address as the member accounts. */
    async function superAdmin(): Promise<string> {
      const user = await prisma.user.create({
        data: {
          email: EMAIL,
          realm: PLATFORM_REALM,
          isSuperAdmin: true,
          passwordHash: await hash(PLATFORM_PASSWORD),
          emailVerifiedAt: new Date(),
        },
      });
      return user.id;
    }

    it('signs the gym password into the member account and the platform password into the operator', async () => {
      const operator = await superAdmin();
      const gymSession = await h.auth.login({
        email: EMAIL,
        password: RIVERSIDE_PASSWORD,
        gymSlug: 'riverside',
      });
      expect(claimsOf(gymSession.accessToken)).toMatchObject({
        sub: riversideMember,
        gymId: riversideId,
        role: Role.MEMBER,
      });
      const refreshedGym = await h.auth.refresh(
        { refreshToken: gymSession.refreshToken },
        'downtown',
      );
      expect(claimsOf(refreshedGym.accessToken)).toMatchObject({
        gymId: riversideId,
        role: Role.MEMBER,
      });
      for (const session of [gymSession, refreshedGym]) {
        const response = await fetch(`${baseUrl}/checkout`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ productType: 'credit_pack', productId: 'prod-1' }),
        });
        expect(response.status).toBe(201);
      }

      const platformSession = await h.auth.login({
        email: EMAIL,
        password: PLATFORM_PASSWORD,
        gymSlug: 'riverside',
      });
      const refreshedPlatform = await h.auth.refresh(
        { refreshToken: platformSession.refreshToken },
        'riverside',
      );
      for (const session of [platformSession, refreshedPlatform]) {
        expect(claimsOf(session.accessToken)).toMatchObject({
          sub: operator,
          role: Role.SUPER_ADMIN,
        });
        expect(claimsOf(session.accessToken).gymId).toBeUndefined();
      }

      // Tenant-less, the platform password still wins over the gym accounts.
      const tenantless = await h.auth.login({ email: EMAIL, password: PLATFORM_PASSWORD });
      expect(claimsOf(tenantless.accessToken)).toMatchObject({ role: Role.SUPER_ADMIN });
    });

    it.each([GymMemberStatus.INVITED, GymMemberStatus.SUSPENDED])(
      'refuses a %s member account on its gym, and the platform password still works there',
      async (status) => {
        await superAdmin();
        await prisma.gymMember.update({
          where: { userId_gymId: { userId: riversideMember, gymId: riversideId } },
          data: { status },
        });
        await expect(
          h.auth.login({ email: EMAIL, password: RIVERSIDE_PASSWORD, gymSlug: 'riverside' }),
        ).rejects.toMatchObject({ response: { code: 'MEMBERSHIP_NOT_ACTIVE' } });
        const session = await h.auth.login({
          email: EMAIL,
          password: PLATFORM_PASSWORD,
          gymSlug: 'riverside',
        });
        expect(claimsOf(session.accessToken)).toMatchObject({ role: Role.SUPER_ADMIN });
        expect(claimsOf(session.accessToken).gymId).toBeUndefined();
      },
    );
  });

  describe('login', () => {
    it("each gym's host takes only that gym's password", async () => {
      const onDowntown = await h.auth.login(
        { email: EMAIL, password: DOWNTOWN_PASSWORD },
        'downtown',
      );
      expect(claimsOf(onDowntown.accessToken)).toMatchObject({
        sub: downtownMember,
        gymId: downtownId,
      });

      const onRiverside = await h.auth.login(
        { email: EMAIL, password: RIVERSIDE_PASSWORD },
        'riverside',
      );
      expect(claimsOf(onRiverside.accessToken)).toMatchObject({
        sub: riversideMember,
        gymId: riversideId,
      });
    });

    it("refuses the other gym's password on a host with the plain 401", async () => {
      const error = await h.auth
        .login({ email: EMAIL, password: RIVERSIDE_PASSWORD }, 'downtown')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('with no gym named, a password that opens one gym signs in there', async () => {
      const pair = await h.auth.login({ email: EMAIL, password: RIVERSIDE_PASSWORD });
      expect(claimsOf(pair.accessToken)).toMatchObject({
        sub: riversideMember,
        gymId: riversideId,
      });
    });

    it('with no gym named, a password shared by two gyms asks which one', async () => {
      await prisma.gymCredential.update({
        where: { userId_gymId: { userId: riversideMember, gymId: riversideId } },
        data: { passwordHash: await hash(DOWNTOWN_PASSWORD) },
      });

      const error = await h.auth
        .login({ email: EMAIL, password: DOWNTOWN_PASSWORD })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as {
        code: string;
        data: { gyms: { slug: string }[] };
      };
      expect(body.code).toBe(GYM_SELECTION_REQUIRED_CODE);
      expect(body.data.gyms.map((g) => g.slug).sort()).toEqual(['downtown', 'riverside']);

      // Naming one resolves it.
      const pair = await h.auth.login({
        email: EMAIL,
        password: DOWNTOWN_PASSWORD,
        gymSlug: 'riverside',
      });
      expect(claimsOf(pair.accessToken)).toMatchObject({ gymId: riversideId });
    });

    it('an account with no credential on its gym is a 401, not NOT_A_MEMBER', async () => {
      await prisma.gymCredential.delete({
        where: { userId_gymId: { userId: riversideMember, gymId: riversideId } },
      });
      const error = await h.auth
        .login({ email: EMAIL, password: RIVERSIDE_PASSWORD }, 'riverside')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
    });

    it('an account whose membership is gone is NOT_A_MEMBER after the password checks out', async () => {
      await prisma.gymMember.delete({
        where: { userId_gymId: { userId: riversideMember, gymId: riversideId } },
      });
      const error = await h.auth
        .login({ email: EMAIL, password: RIVERSIDE_PASSWORD }, 'riverside')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
    });
  });

  describe('password reset', () => {
    it("on a gym's host resets that gym's account and leaves the other gym's alone", async () => {
      await h.auth.requestPasswordReset({ email: EMAIL }, null, 'downtown');
      const { token, gymSlug } = h.lastMail('reset', EMAIL);
      expect(gymSlug).toBe('downtown');

      const result = await h.auth.resetPassword(
        { token, password: 'brand-new-downtown' },
        'downtown',
      );
      expect(result).toMatchObject({ sessionIssued: true });
      expect('accessToken' in result).toBe(true);

      await expect(
        h.auth.login({ email: EMAIL, password: 'brand-new-downtown' }, 'downtown'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: RIVERSIDE_PASSWORD }, 'riverside'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'downtown'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("revokes the reset account's sessions and keeps the other gym's", async () => {
      const downtownSession = await h.auth.login(
        { email: EMAIL, password: DOWNTOWN_PASSWORD },
        'downtown',
      );
      const riversideSession = await h.auth.login(
        { email: EMAIL, password: RIVERSIDE_PASSWORD },
        'riverside',
      );

      await h.auth.requestPasswordReset({ email: EMAIL, gymSlug: 'downtown' });
      const { token } = h.lastMail('reset', EMAIL);
      await h.auth.resetPassword({ token, password: 'brand-new-downtown' }, 'downtown');

      await expect(
        h.auth.refresh({ refreshToken: downtownSession.refreshToken }, 'downtown'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        h.auth.refresh({ refreshToken: riversideSession.refreshToken }, 'riverside'),
      ).resolves.toBeDefined();
    });

    it('mints nothing for a host gym the address has no account at', async () => {
      await prisma.gym.create({ data: { name: 'Uptown', slug: 'uptown' } });
      await h.auth.requestPasswordReset({ email: EMAIL }, null, 'uptown');
      expect(h.mail).toHaveLength(0);
      expect(h.store.size).toBe(0);
    });

    it("a reset link completed on another gym's site sets the password but no session", async () => {
      await h.auth.requestPasswordReset({ email: EMAIL }, null, 'downtown');
      const { token } = h.lastMail('reset', EMAIL);

      const result = await h.auth.resetPassword(
        { token, password: 'brand-new-downtown' },
        'riverside',
      );
      expect(result).toEqual({ ok: true, sessionIssued: false });
      await expect(
        h.auth.login({ email: EMAIL, password: 'brand-new-downtown' }, 'downtown'),
      ).resolves.toBeDefined();
    });

    it('with no gym at all, each member account gets its own link, and each resets one account', async () => {
      await h.auth.requestPasswordReset({ email: EMAIL });
      expect(h.mail.map((m) => m.gymSlug).sort()).toEqual(['downtown', 'riverside']);
      const riversideMail = h.lastMail('reset', EMAIL);
      expect(riversideMail.gymSlug).toBe('riverside');

      await h.auth.resetPassword({ token: riversideMail.token, password: 'new-riverside-only' });

      await expect(
        h.auth.login({ email: EMAIL, password: 'new-riverside-only' }, 'riverside'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'downtown'),
      ).resolves.toBeDefined();
    });
  });

  describe('onboarding an address that already has accounts', () => {
    it('signup on a third gym creates a new member account with its own password', async () => {
      const uptown = await prisma.gym.create({ data: { name: 'Uptown', slug: 'uptown' } });

      const pair = await h.auth.signupMember({
        gymId: uptown.id,
        name: 'Sam U.',
        email: EMAIL,
        password: 'uptown-secret-3',
        ...INTAKE,
      });
      expect(claimsOf(pair.accessToken)).toMatchObject({ gymId: uptown.id });
      expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(3);
      const uptownMember = await prisma.user.findUniqueOrThrow({
        where: { email_realm: { email: EMAIL, realm: gymRealm(uptown.id, 'member') } },
      });

      const credential = await prisma.gymCredential.findUniqueOrThrow({
        where: { userId_gymId: { userId: uptownMember.id, gymId: uptown.id } },
      });
      expect(credential.emailVerifiedAt).toBeNull();
      expect(credential.name).toBe('Sam U.');

      const { token, gymSlug } = h.lastMail('verify', EMAIL);
      expect(gymSlug).toBe('uptown');
      await h.auth.verifyEmail(token);

      await expect(
        h.auth.login({ email: EMAIL, password: 'uptown-secret-3' }, 'uptown'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'downtown'),
      ).resolves.toBeDefined();
    });

    it('signup on a gym the address is already a member of is ALREADY_MEMBER', async () => {
      const error = await h.auth
        .signupMember({
          gymId: downtownId,
          name: 'Sam',
          email: EMAIL,
          password: 'x-y-z-1234',
          ...INTAKE,
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ALREADY_MEMBER' });
    });

    it('signup on a gym where the address is only staff creates a separate member account', async () => {
      const uptown = await prisma.gym.create({ data: { name: 'Uptown', slug: 'uptown' } });
      const staff = await account(uptown.id, 'staff', STAFF_PASSWORD, { role: Role.TRAINER });

      await h.auth.signupMember({
        gymId: uptown.id,
        name: 'Sam',
        email: EMAIL,
        password: 'uptown-member-5',
        ...INTAKE,
      });

      const member = await prisma.user.findUniqueOrThrow({
        where: { email_realm: { email: EMAIL, realm: gymRealm(uptown.id, 'member') } },
        include: { memberships: true },
      });
      expect(member.id).not.toBe(staff);
      expect(member.memberships.map((m) => m.role)).toEqual([Role.MEMBER]);
      const staffMembership = await prisma.gymMember.findUniqueOrThrow({
        where: { userId_gymId: { userId: staff, gymId: uptown.id } },
      });
      expect(staffMembership.role).toBe(Role.TRAINER);
    });

    it('register-gym for an address with accounts creates a NEW staff account as the owner', async () => {
      const res = await h.auth.registerGym({
        gymName: 'Uptown',
        subdomainSlug: 'uptown',
        ownerEmail: EMAIL,
      });
      expect([downtownMember, riversideMember]).not.toContain(res.ownerUserId);
      const owner = await prisma.user.findUniqueOrThrow({ where: { id: res.ownerUserId } });
      expect(owner.realm).toBe(gymRealm(res.gymId, 'staff'));

      const { token, gymSlug } = h.lastMail('onboarding', EMAIL);
      expect(gymSlug).toBe('uptown');

      // The link opened on another gym's console is refused before it is spent.
      const wrongHost = await h.auth
        .activateAccount({ token, password: 'uptown-owner-1' }, 'downtown')
        .catch((e: unknown) => e);
      expect(wrongHost).toBeInstanceOf(ForbiddenException);

      await h.auth.activateAccount({ token, password: 'uptown-owner-1' }, 'uptown');
      const ownerSession = await h.auth.login(
        { email: EMAIL, password: 'uptown-owner-1', audience: 'staff' },
        'uptown',
      );
      expect(claimsOf(ownerSession.accessToken)).toMatchObject({
        sub: res.ownerUserId,
        role: Role.OWNER,
      });
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'downtown'),
      ).resolves.toBeDefined();
    });

    it('a staff invitation for a member of the gym creates a separate staff account', async () => {
      const invite = await prisma.staffInvite.create({
        data: {
          gymId: downtownId,
          email: EMAIL,
          role: Role.TRAINER,
          token: 'invite-token-1',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const { url } = await h.auth.acceptInvite(invite.token);
      expect(url).toContain('/admin/accept-invite');
      // The member account's password does not count: the staff account is new.
      expect((await h.auth.inspectStaffInvite(invite.token)).needsPassword).toBe(true);

      await h.auth.completeStaffInvite(
        { token: invite.token, password: 'downtown-trainer-1' },
        'downtown',
      );
      await expect(h.auth.completeStaffInvite({ token: invite.token })).rejects.toThrow();

      const staff = await prisma.user.findUniqueOrThrow({
        where: { email_realm: { email: EMAIL, realm: gymRealm(downtownId, 'staff') } },
        include: { memberships: true },
      });
      expect(staff.id).not.toBe(downtownMember);
      expect(staff.memberships.map((m) => [m.gymId, m.role])).toEqual([[downtownId, Role.TRAINER]]);

      // Both accounts sign in, each with its own password; the member is untouched.
      const trainer = await h.auth.login(
        { email: EMAIL, password: 'downtown-trainer-1', audience: 'staff' },
        'downtown',
      );
      expect(claimsOf(trainer.accessToken)).toMatchObject({ sub: staff.id, role: Role.TRAINER });
      const member = await h.auth.login(
        { email: EMAIL, password: DOWNTOWN_PASSWORD, audience: 'member' },
        'downtown',
      );
      expect(claimsOf(member.accessToken)).toMatchObject({
        sub: downtownMember,
        role: Role.MEMBER,
      });

      // A second invitation now finds the staff account's password and asks for it.
      const again = await prisma.staffInvite.create({
        data: {
          gymId: downtownId,
          email: EMAIL,
          role: Role.RECEPTIONIST,
          token: 'invite-token-2',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      expect((await h.auth.inspectStaffInvite(again.token)).needsPassword).toBe(false);
      await expect(
        h.auth.completeStaffInvite(
          { token: again.token, currentPassword: DOWNTOWN_PASSWORD },
          'downtown',
        ),
      ).rejects.toThrow();
      await h.auth.completeStaffInvite(
        { token: again.token, currentPassword: 'downtown-trainer-1' },
        'downtown',
      );
      await expect(
        h.auth.login(
          { email: EMAIL, password: 'downtown-trainer-1', audience: 'staff' },
          'downtown',
        ),
      ).resolves.toBeDefined();
    });
  });
});
