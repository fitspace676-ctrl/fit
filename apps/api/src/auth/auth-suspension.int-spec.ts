import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { GymMemberStatus, GymStatus, Role } from '@fit/db';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { SessionClaims, TokenService } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';
import { prisma, resetDb, disconnect } from '../test/integration-db';

/**
 * The gym-suspension login gate, proven against a real Postgres (T2.12): a member
 * whose only gym is suspended cannot obtain a session, and can again once the gym
 * is reactivated. Password verification (argon2) and the membership/suspension
 * queries are real; only token *minting* is stubbed (issuing is covered by the
 * TokenService integration test).
 */
function makeAuthService(claims?: SessionClaims[]): AuthService {
  const tokens = {
    issueTokenPair: (_userId: string, scope: SessionClaims) => {
      claims?.push(scope);
      return Promise.resolve({ accessToken: 'access', refreshToken: 'refresh' });
    },
  } as unknown as TokenService;
  const redis = {
    client: {
      set: () => Promise.resolve('OK'),
      get: () => Promise.resolve(null),
      del: () => Promise.resolve(1),
    },
  } as unknown as RedisService;
  return new AuthService(
    new PrismaService(),
    redis,
    tokens,
    {} as unknown as EmailService,
    {} as unknown as GoogleOAuthService,
    {} as unknown as AppleOAuthService,
  );
}

const PASSWORD = 'supersecret';
const CREDS = { email: 'member@example.com', password: PASSWORD };

describe('login gym-suspension gate (integration)', () => {
  const auth = makeAuthService();
  let gymId: string;

  beforeEach(async () => {
    await resetDb();
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email: CREDS.email, passwordHash, emailVerifiedAt: new Date() },
    });
    const gym = await prisma.gym.create({
      data: { name: 'Suspended Gym', slug: 'suspended', status: GymStatus.SUSPENDED },
    });
    gymId = gym.id;
    await prisma.gymMember.create({
      data: { userId: user.id, gymId: gym.id, role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
    });
  });

  afterAll(disconnect);

  it('blocks login while the member’s only gym is suspended', async () => {
    const error = await auth.login(CREDS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
  });

  it('allows login once the gym is reactivated', async () => {
    await prisma.gym.update({ where: { id: gymId }, data: { status: GymStatus.ACTIVE } });
    await expect(auth.login(CREDS)).resolves.toMatchObject({ accessToken: 'access' });
  });
});

/**
 * The same gate for a member of *two* gyms, one of them suspended — where the
 * session-level question ("do I have any live gym?") and the tenant the sign-in
 * actually asked for come apart. Without the slug the member still has downtown
 * and signs in there; naming the suspended riverside has to be refused rather
 * than silently answered with a downtown session.
 */
describe('login gym-suspension gate — a member of two gyms (integration)', () => {
  const claims: SessionClaims[] = [];
  const auth = makeAuthService(claims);
  let downtownId: string;
  let riversideId: string;

  beforeEach(async () => {
    await resetDb();
    claims.length = 0;
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email: CREDS.email, passwordHash, emailVerifiedAt: new Date() },
    });
    const downtown = await prisma.gym.create({
      data: { name: 'Downtown', slug: 'downtown', status: GymStatus.ACTIVE },
    });
    const riverside = await prisma.gym.create({
      data: { name: 'Riverside', slug: 'riverside', status: GymStatus.SUSPENDED },
    });
    downtownId = downtown.id;
    riversideId = riverside.id;
    await prisma.gymMember.create({
      data: {
        userId: user.id,
        gymId: downtown.id,
        role: Role.OWNER,
        status: GymMemberStatus.ACTIVE,
        joinedAt: new Date('2026-01-01'),
      },
    });
    await prisma.gymMember.create({
      data: {
        userId: user.id,
        gymId: riverside.id,
        role: Role.TRAINER,
        status: GymMemberStatus.ACTIVE,
        joinedAt: new Date('2026-03-01'),
      },
    });
  });

  afterAll(disconnect);

  it('refuses a sign-in on the suspended gym’s subdomain', async () => {
    const error = await auth.login({ ...CREDS, gymSlug: 'riverside' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'GYM_SUSPENDED' });
    expect(claims).toHaveLength(0);
  });

  it('signs the same member into their live gym when no subdomain is named', async () => {
    await expect(auth.login(CREDS)).resolves.toMatchObject({ accessToken: 'access' });

    expect(claims[0]).toMatchObject({ gymId: downtownId, role: Role.OWNER });
  });

  it('binds to the named gym once it is reactivated', async () => {
    await prisma.gym.update({ where: { id: riversideId }, data: { status: GymStatus.ACTIVE } });

    await auth.login({ ...CREDS, gymSlug: 'riverside' });

    expect(claims[0]).toMatchObject({ gymId: riversideId, role: Role.TRAINER });
  });

  it('refuses the subdomain the member is only INVITED to', async () => {
    await prisma.gym.update({ where: { id: riversideId }, data: { status: GymStatus.ACTIVE } });
    await prisma.gymMember.update({
      where: { userId_gymId: { userId: (await member()).userId, gymId: riversideId } },
      data: { status: GymMemberStatus.INVITED },
    });

    const error = await auth.login({ ...CREDS, gymSlug: 'riverside' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'MEMBERSHIP_NOT_ACTIVE',
    });
    // Not quietly signed into downtown instead.
    expect(claims).toHaveLength(0);
  });

  /** The seeded member's row in the live gym — the only user these tests create. */
  async function member(): Promise<{ userId: string }> {
    const row = await prisma.gymMember.findFirstOrThrow({ where: { gymId: downtownId } });
    return { userId: row.userId };
  }
});
