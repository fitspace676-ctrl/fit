import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { GymMemberStatus, GymStatus, Role } from '@fit/db';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
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
function makeAuthService(): AuthService {
  const tokens = {
    issueTokenPair: () => Promise.resolve({ accessToken: 'access', refreshToken: 'refresh' }),
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
