import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';
import { prisma, resetDb, disconnect } from '../test/integration-db';

/**
 * `register-gym` transaction atomicity, proven against a real Postgres (T2.11):
 * the user + gym + OWNER membership are created all-or-nothing, and a rejected
 * provision (duplicate subdomain / email) leaves no orphan rows behind. Only the
 * DB-touching collaborators are real (Prisma + argon2 via the service); Redis and
 * mail are stubbed since the atomicity guarantee is purely about the write path.
 */
function makeAuthService(): AuthService {
  const redis = {
    client: {
      set: () => Promise.resolve('OK'),
      get: () => Promise.resolve(null),
      del: () => Promise.resolve(1),
    },
  } as unknown as RedisService;
  const email = {
    sendOwnerOnboardingEmail: () => Promise.resolve(undefined),
  } as unknown as EmailService;
  const noop = {} as unknown as TokenService;
  return new AuthService(
    new PrismaService(),
    redis,
    noop,
    email,
    {} as unknown as GoogleOAuthService,
    {} as unknown as AppleOAuthService,
  );
}

const INPUT = {
  gymName: 'Downtown Strength',
  subdomainSlug: 'downtown',
  ownerEmail: 'owner@example.com',
  ownerName: 'Olivia Owner',
  password: 'supersecret',
};

describe('registerGym atomicity (integration)', () => {
  const auth = makeAuthService();

  beforeEach(resetDb);
  afterAll(disconnect);

  it('creates the user, gym, and OWNER membership together', async () => {
    const res = await auth.registerGym(INPUT);

    expect(res).toMatchObject({ subdomainSlug: 'downtown' });
    const [users, gyms, members] = await Promise.all([
      prisma.user.count(),
      prisma.gym.count(),
      prisma.gymMember.count(),
    ]);
    expect({ users, gyms, members }).toEqual({ users: 1, gyms: 1, members: 1 });

    const owner = await prisma.gymMember.findFirst({ where: { gymId: res.gymId } });
    expect(owner?.role).toBe('OWNER');
  });

  it('rejects a duplicate subdomain and writes nothing (no orphan owner)', async () => {
    await auth.registerGym(INPUT);
    const usersBefore = await prisma.user.count();

    await expect(
      auth.registerGym({ ...INPUT, ownerEmail: 'someone-else@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);

    // The new owner was never created — the provision is all-or-nothing.
    expect(await prisma.user.count()).toBe(usersBefore);
    expect(await prisma.gym.count()).toBe(1);
  });

  it('rejects a duplicate email and never creates the second gym', async () => {
    await auth.registerGym(INPUT);

    await expect(auth.registerGym({ ...INPUT, subdomainSlug: 'uptown' })).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(await prisma.gym.count()).toBe(1);
  });
});
