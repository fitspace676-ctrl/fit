import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as argon2 from 'argon2';
import { GymMemberStatus, GymStatus, Role } from '@fit/db';
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
 * Sign-in by phone number and password, against a real Postgres — the lookup is
 * raw SQL over numbers stored as typed, so only a real database proves it.
 */
function harness(): AuthService {
  const prismaService = new PrismaService();
  return new AuthService(
    prismaService,
    { client: {} } as unknown as RedisService,
    new TokenService(prismaService),
    {} as unknown as EmailService,
    {} as unknown as GoogleOAuthService,
    {} as unknown as AppleOAuthService,
  );
}

function claimsOf(accessToken: string): SessionClaims & { sub: string } {
  const payload = accessToken.split('.')[1]!;
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims & {
    sub: string;
  };
}

interface AccountOptions {
  email: string;
  password: string | null;
  /** The number on the gym's credential (what the gym knows the person by). */
  phone?: string | null;
  /** The number on the user row (what staff accounts and old rows carry). */
  userPhone?: string | null;
  verified?: boolean;
}

async function account(
  gymId: string,
  audience: AccountAudience,
  options: AccountOptions,
): Promise<string> {
  const passwordHash = options.password
    ? await argon2.hash(options.password, { type: argon2.argon2id })
    : null;
  const emailVerifiedAt = options.verified === false ? null : new Date();
  const user = await prisma.user.create({
    data: {
      email: options.email,
      realm: gymRealm(gymId, audience),
      phone: options.userPhone ?? null,
      passwordHash,
      emailVerifiedAt,
    },
  });
  await prisma.gymMember.create({
    data: {
      userId: user.id,
      gymId,
      role: audience === 'member' ? Role.MEMBER : Role.MANAGER,
      status: GymMemberStatus.ACTIVE,
    },
  });
  await prisma.gymCredential.create({
    data: { userId: user.id, gymId, passwordHash, emailVerifiedAt, phone: options.phone ?? null },
  });
  return user.id;
}

describe('sign-in by phone number (integration)', () => {
  const auth = harness();
  let downtownId: string;
  let riversideId: string;

  beforeEach(async () => {
    await resetDb();
    const [downtown, riverside] = await Promise.all([
      prisma.gym.create({ data: { name: 'Downtown', slug: 'downtown', status: GymStatus.ACTIVE } }),
      prisma.gym.create({
        data: { name: 'Riverside', slug: 'riverside', status: GymStatus.ACTIVE },
      }),
    ]);
    downtownId = downtown.id;
    riversideId = riverside.id;
  });

  afterAll(disconnect);

  it('signs a member in with the number on their account, however either side spells it', async () => {
    const id = await account(downtownId, 'member', {
      email: 'nino@example.com',
      password: 'nino-secret-1',
      phone: '599 12 34 56',
    });

    for (const phone of ['599123456', '+995 599 12-34-56', '995599123456', '0599 123456']) {
      const session = await auth.login(
        { phone, password: 'nino-secret-1', audience: 'member' },
        'downtown',
      );
      expect(claimsOf(session.accessToken), phone).toMatchObject({ sub: id, gymId: downtownId });
    }
    // The address still works.
    await expect(
      auth.login({ email: 'nino@example.com', password: 'nino-secret-1' }, 'downtown'),
    ).resolves.toBeDefined();
  });

  it('answers the same 401 for a wrong password, an unknown number and a number at another gym', async () => {
    await account(downtownId, 'member', {
      email: 'nino@example.com',
      password: 'nino-secret-1',
      phone: '599123456',
    });

    for (const [phone, password, slug] of [
      ['599123456', 'wrong-password', 'downtown'],
      ['599000000', 'nino-secret-1', 'downtown'],
      ['599123456', 'nino-secret-1', 'riverside'],
    ] as const) {
      await expect(auth.login({ phone, password }, slug)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    }
  });

  it('lets the password pick between accounts that share a number', async () => {
    const parent = await account(downtownId, 'member', {
      email: 'parent@example.com',
      password: 'parent-secret-1',
      phone: '599123456',
    });
    const child = await account(downtownId, 'member', {
      email: 'child@example.com',
      password: 'child-secret-2',
      phone: '+995599123456',
    });
    // No password yet (imported, never activated): the number alone opens nothing.
    await account(downtownId, 'member', {
      email: 'other@example.com',
      password: null,
      phone: '599123456',
    });

    const asParent = await auth.login(
      { phone: '599123456', password: 'parent-secret-1' },
      'downtown',
    );
    const asChild = await auth.login(
      { phone: '599123456', password: 'child-secret-2' },
      'downtown',
    );
    expect(claimsOf(asParent.accessToken).sub).toBe(parent);
    expect(claimsOf(asChild.accessToken).sub).toBe(child);
  });

  it('keeps the audiences apart: a staff number opens the console, not the member app', async () => {
    const staff = await account(downtownId, 'staff', {
      email: 'desk@example.com',
      password: 'desk-secret-1',
      userPhone: '577 00 11 22',
    });

    const session = await auth.login(
      { phone: '577001122', password: 'desk-secret-1', audience: 'staff' },
      'downtown',
    );
    expect(claimsOf(session.accessToken).sub).toBe(staff);
    await expect(
      auth.login({ phone: '577001122', password: 'desk-secret-1', audience: 'member' }, 'downtown'),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('with no gym named, finds the one gym the number and password open', async () => {
    const id = await account(riversideId, 'member', {
      email: 'nino@example.com',
      password: 'nino-secret-1',
      phone: '599123456',
    });
    await account(downtownId, 'member', {
      email: 'someone@example.com',
      password: 'someone-secret-2',
      phone: '599123456',
    });

    const session = await auth.login({ phone: '599123456', password: 'nino-secret-1' });
    expect(claimsOf(session.accessToken)).toMatchObject({ sub: id, gymId: riversideId });
  });

  it('signs a platform account in by its number', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'root@example.com',
        realm: PLATFORM_REALM,
        phone: '+995 555 10 20 30',
        passwordHash: await argon2.hash('root-secret-1', { type: argon2.argon2id }),
        emailVerifiedAt: new Date(),
      },
    });

    const session = await auth.login({ phone: '555102030', password: 'root-secret-1' });
    expect(claimsOf(session.accessToken).sub).toBe(user.id);
  });

  it('still refuses an account whose address was never verified', async () => {
    await account(downtownId, 'member', {
      email: 'new@example.com',
      password: 'new-secret-1',
      phone: '599123456',
      verified: false,
    });

    await expect(
      auth.login({ phone: '599123456', password: 'new-secret-1' }, 'downtown'),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
  });
});
