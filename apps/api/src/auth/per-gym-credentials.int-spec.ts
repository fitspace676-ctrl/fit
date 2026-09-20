import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { GymMemberStatus, GymStatus, Role } from '@fit/db';
import { GYM_SELECTION_REQUIRED_CODE } from '@fit/types';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { TokenService, type SessionClaims } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';
import { prisma, resetDb, disconnect } from '../test/integration-db';

/**
 * Per-gym credentials (T1.25), proven against a real Postgres: one address, two
 * gyms, two passwords. Everything that touches the DB is real — Prisma, argon2,
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

describe('per-gym credentials (integration)', () => {
  const h = harness();
  let downtownId: string;
  let riversideId: string;
  let userId: string;

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

    // The state the backfill leaves an existing two-gym member in — except that
    // the two passwords already differ, which is the whole point.
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: 'Sam',
        passwordHash: await argon2.hash(DOWNTOWN_PASSWORD, { type: argon2.argon2id }),
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
    await prisma.gymMember.createMany({
      data: [
        { userId, gymId: downtownId, role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
        { userId, gymId: riversideId, role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
      ],
    });
    await prisma.gymCredential.createMany({
      data: [
        {
          userId,
          gymId: downtownId,
          passwordHash: await argon2.hash(DOWNTOWN_PASSWORD, { type: argon2.argon2id }),
          emailVerifiedAt: new Date(),
          name: 'Sam (Downtown)',
        },
        {
          userId,
          gymId: riversideId,
          passwordHash: await argon2.hash(RIVERSIDE_PASSWORD, { type: argon2.argon2id }),
          emailVerifiedAt: new Date(),
          name: 'Sam (Riverside)',
        },
      ],
    });
  });

  afterAll(disconnect);

  describe('login', () => {
    it("each gym's host takes only that gym's password", async () => {
      const onDowntown = await h.auth.login(
        { email: EMAIL, password: DOWNTOWN_PASSWORD },
        'downtown',
      );
      expect(claimsOf(onDowntown.accessToken)).toMatchObject({ gymId: downtownId });

      const onRiverside = await h.auth.login(
        { email: EMAIL, password: RIVERSIDE_PASSWORD },
        'riverside',
      );
      expect(claimsOf(onRiverside.accessToken)).toMatchObject({ gymId: riversideId });
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
      expect(claimsOf(pair.accessToken)).toMatchObject({ gymId: riversideId });
    });

    it('with no gym named, a password shared by two gyms asks which one', async () => {
      await prisma.gymCredential.update({
        where: { userId_gymId: { userId, gymId: riversideId } },
        data: { passwordHash: await argon2.hash(DOWNTOWN_PASSWORD, { type: argon2.argon2id }) },
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

    it('a member with no credential on the host gym is a 401, not NOT_A_MEMBER', async () => {
      await prisma.gymCredential.delete({
        where: { userId_gymId: { userId, gymId: riversideId } },
      });
      const error = await h.auth
        .login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'riverside')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
    });

    it('a stranger to the host gym is still NOT_A_MEMBER after the password checks out', async () => {
      // A credential row with no membership behind it (the invite path's
      // "credential first, membership later" is not a thing, but the gate must
      // hold regardless of how the row came to be).
      await prisma.gymMember.delete({ where: { userId_gymId: { userId, gymId: riversideId } } });
      const error = await h.auth
        .login({ email: EMAIL, password: RIVERSIDE_PASSWORD }, 'riverside')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_A_MEMBER' });
    });
  });

  describe('password reset', () => {
    it("on a gym's host resets that gym's password and leaves the other gym's alone", async () => {
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

    it("revokes the reset gym's sessions and keeps the other gym's", async () => {
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

    it('mints nothing for a host gym the address has no credential in', async () => {
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

    it('with no gym at all, a multi-gym address gets a whole-identity reset', async () => {
      await h.auth.requestPasswordReset({ email: EMAIL });
      const { token, gymSlug } = h.lastMail('reset', EMAIL);
      expect(gymSlug).toBeNull();

      await h.auth.resetPassword({ token, password: 'same-everywhere' });

      await expect(
        h.auth.login({ email: EMAIL, password: 'same-everywhere' }, 'downtown'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: 'same-everywhere' }, 'riverside'),
      ).resolves.toBeDefined();
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await expect(argon2.verify(user.passwordHash!, 'same-everywhere')).resolves.toBe(true);
    });
  });

  describe('onboarding an address that already exists', () => {
    it('signup on a third gym reuses the user and gets its own password', async () => {
      const uptown = await prisma.gym.create({ data: { name: 'Uptown', slug: 'uptown' } });

      const pair = await h.auth.signupMember({
        gymId: uptown.id,
        name: 'Sam U.',
        email: EMAIL,
        password: 'uptown-secret-3',
        ...INTAKE,
      });
      expect(claimsOf(pair.accessToken)).toMatchObject({ gymId: uptown.id });
      expect(await prisma.user.count()).toBe(1);

      const credential = await prisma.gymCredential.findUniqueOrThrow({
        where: { userId_gymId: { userId, gymId: uptown.id } },
      });
      expect(credential.emailVerifiedAt).toBeNull();
      expect(credential.name).toBe('Sam U.');

      // Verifying from the mailed link stamps that gym only.
      const { token, gymSlug } = h.lastMail('verify', EMAIL);
      expect(gymSlug).toBe('uptown');
      await h.auth.verifyEmail(token);
      const verified = await prisma.gymCredential.findUniqueOrThrow({
        where: { userId_gymId: { userId, gymId: uptown.id } },
      });
      expect(verified.emailVerifiedAt).not.toBeNull();

      await expect(
        h.auth.login({ email: EMAIL, password: 'uptown-secret-3' }, 'uptown'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'downtown'),
      ).resolves.toBeDefined();
    });

    it('signup on a gym the address already belongs to is ALREADY_MEMBER', async () => {
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

    it('register-gym for an existing owner email creates the gym and mails an activation link', async () => {
      const res = await h.auth.registerGym({
        gymName: 'Uptown',
        subdomainSlug: 'uptown',
        ownerEmail: EMAIL,
      });
      expect(res.ownerUserId).toBe(userId);

      const { token, gymSlug } = h.lastMail('onboarding', EMAIL);
      expect(gymSlug).toBe('uptown');

      // The link opened on another gym's console is refused before it is spent.
      const wrongHost = await h.auth
        .activateAccount({ token, password: 'uptown-owner-1' }, 'downtown')
        .catch((e: unknown) => e);
      expect(wrongHost).toBeInstanceOf(ForbiddenException);

      await h.auth.activateAccount({ token, password: 'uptown-owner-1' }, 'uptown');
      await expect(
        h.auth.login({ email: EMAIL, password: 'uptown-owner-1' }, 'uptown'),
      ).resolves.toBeDefined();
      await expect(
        h.auth.login({ email: EMAIL, password: DOWNTOWN_PASSWORD }, 'downtown'),
      ).resolves.toBeDefined();
    });

    it("a staff invite for an existing address sends it to register, and register sets the new gym's password", async () => {
      const uptown = await prisma.gym.create({ data: { name: 'Uptown', slug: 'uptown' } });
      const invite = await prisma.staffInvite.create({
        data: {
          gymId: uptown.id,
          email: EMAIL,
          role: Role.TRAINER,
          token: 'invite-token-1',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const { url } = await h.auth.acceptInvite(invite.token);
      expect(url).toContain('/member/register');

      await h.auth.register({
        name: 'Sam T.',
        email: EMAIL,
        password: 'uptown-trainer-1',
        inviteToken: invite.token,
      });

      await expect(
        h.auth.login({ email: EMAIL, password: 'uptown-trainer-1' }, 'uptown'),
      ).resolves.toBeDefined();
      const membership = await prisma.gymMember.findUniqueOrThrow({
        where: { userId_gymId: { userId, gymId: uptown.id } },
      });
      expect(membership.role).toBe(Role.TRAINER);

      // And the address, now holding a credential there, is sent to login next time.
      const again = await prisma.staffInvite.create({
        data: {
          gymId: uptown.id,
          email: EMAIL,
          role: Role.RECEPTIONIST,
          token: 'invite-token-2',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      expect((await h.auth.acceptInvite(again.token)).url).toContain('/member/login');
    });
  });
});
