import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the frozen env singleton (deterministic WEB_URL + TTL) and stub argon2 so
// the test neither loads the native addon nor pays hashing cost. Mirrors the
// approach in auth.service.spec.ts but scoped to the staff-invite (T4.7) paths.
const { mockEnv, argonHash } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {
    EMAIL_VERIFICATION_TTL: 86_400,
    WEB_URL: 'https://app.example.com',
  };
  const argonHash = vi.fn(() => Promise.resolve('argon2-hash'));
  return { mockEnv, argonHash };
});
vi.mock('../config/env', () => ({ env: mockEnv }));
vi.mock('argon2', () => ({
  hash: argonHash,
  verify: vi.fn(() => Promise.resolve(true)),
  argon2id: 2,
}));

import { Role } from '@fit/db';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';

interface Invite {
  id: string;
  email: string;
  role: Role;
  gymId: string;
  gym: { slug: string };
  expiresAt: Date;
  usedAt: Date | null;
}

function setup(opts?: {
  invite?: Invite | null;
  userExists?: boolean;
  credentialExists?: boolean;
  inviteUpdateCount?: number;
}) {
  const staffInviteFindUnique = vi.fn(() => Promise.resolve(opts?.invite ?? null));
  const staffInviteUpdateMany = vi.fn(() =>
    Promise.resolve({ count: opts?.inviteUpdateCount ?? 1 }),
  );
  const gymMemberUpsert = vi.fn((_args: unknown) => Promise.resolve({ id: 'gm-1' }));
  // The staff <-> trainer sync reads the member back when it has to invent a
  // coach name, and writes the profile.
  const gymMemberFindFirst = vi.fn((_args: unknown) =>
    Promise.resolve({
      firstName: null,
      lastName: null,
      user: { name: 'Invitee', email: 'invitee@example.com' },
    }),
  );
  const trainerFindFirst = vi.fn((_args: unknown) => Promise.resolve(null));
  const trainerCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 't-1' }));
  const trainerUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 't-1' }));

  const userFindUnique = vi.fn(() =>
    Promise.resolve(opts?.userExists ? { id: 'u-existing' } : null),
  );
  const userCreate = vi.fn(() => Promise.resolve({ id: 'u-new' }));
  const userUpdateMany = vi.fn(() => Promise.resolve({ count: 1 }));
  // The inviting gym's credential (T1.25). `credentialExists` models an address
  // that already signs in to THIS gym; `userExists` alone is an account known
  // only from elsewhere.
  const credentialFindFirst = vi.fn((_args: unknown) =>
    Promise.resolve(opts?.credentialExists ? { id: 'cred-1' } : null),
  );
  const credentialFindUnique = vi.fn((_args: unknown) =>
    Promise.resolve(
      opts?.credentialExists
        ? { passwordHash: 'old-hash', emailVerifiedAt: new Date('2026-01-01'), name: 'Old' }
        : null,
    ),
  );
  const credentialCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'cred-1' }));
  const credentialUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'cred-1' }));

  const client = {
    user: { findUnique: userFindUnique, create: userCreate, updateMany: userUpdateMany },
    staffInvite: { findUnique: staffInviteFindUnique, updateMany: staffInviteUpdateMany },
    gymMember: { upsert: gymMemberUpsert, findFirst: gymMemberFindFirst },
    gymCredential: {
      findFirst: credentialFindFirst,
      findUnique: credentialFindUnique,
      create: credentialCreate,
      update: credentialUpdate,
    },
    trainer: { findFirst: trainerFindFirst, create: trainerCreate, update: trainerUpdate },
    $transaction: vi.fn((cb: (tx: typeof client) => unknown) => cb(client)),
  };

  const prisma = { client } as unknown as PrismaService;
  const set = vi.fn<(key: string, value: string, ex: string, ttl: number) => Promise<string>>(() =>
    Promise.resolve('OK'),
  );
  const redis = {
    client: { set, get: vi.fn(), del: vi.fn() },
  } as unknown as RedisService;
  const tokens = {
    issueTokenPair: vi.fn(() => Promise.resolve({ accessToken: 'a', refreshToken: 'r' })),
  } as unknown as TokenService;
  const sendVerificationEmail = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const email = { sendVerificationEmail } as unknown as EmailService;
  const google = {} as unknown as GoogleOAuthService;
  const apple = {} as unknown as AppleOAuthService;

  return {
    service: new AuthService(prisma, redis, tokens, email, google, apple),
    staffInviteFindUnique,
    staffInviteUpdateMany,
    gymMemberUpsert,
    trainerFindFirst,
    trainerCreate,
    trainerUpdate,
    userCreate,
    credentialFindFirst,
    credentialCreate,
    credentialUpdate,
    sendVerificationEmail,
    set,
  };
}

const liveInvite = (over?: Partial<Invite>): Invite => ({
  id: 'inv-1',
  email: 'invitee@example.com',
  role: Role.MANAGER,
  gymId: 'gym-1',
  gym: { slug: 'downtown' },
  expiresAt: new Date(Date.now() + 1_000_000),
  usedAt: null,
  ...over,
});

describe('AuthService — staff invites (T4.7)', () => {
  afterEach(() => vi.clearAllMocks());

  describe('acceptInvite', () => {
    it('routes a brand-new address to the web register flow with the token', async () => {
      const { service } = setup({ invite: liveInvite(), userExists: false });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toBe('https://app.example.com/member/register?inviteToken=tok-123');
    });

    it('routes an address that already signs in to this gym to the login flow with the token', async () => {
      const { service, credentialFindFirst } = setup({
        invite: liveInvite(),
        userExists: true,
        credentialExists: true,
      });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toBe('https://app.example.com/member/login?inviteToken=tok-123');
      // "Has an account" is asked of the INVITING gym's credential, not of the address.
      expect(credentialFindFirst).toHaveBeenCalledWith({
        where: { gymId: 'gym-1', user: { email: 'invitee@example.com' } },
        select: { id: true },
      });
    });

    it('routes an address known only from another gym to register — it has no password here yet', async () => {
      const { service } = setup({
        invite: liveInvite(),
        userExists: true,
        credentialExists: false,
      });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toBe('https://app.example.com/member/register?inviteToken=tok-123');
    });

    it('routes an unknown token to login with an inviteError flag', async () => {
      const { service } = setup({ invite: null });
      const { url } = await service.acceptInvite('nope');
      expect(url).toBe('https://app.example.com/member/login?inviteError=invalid');
    });

    it('treats an expired invite as invalid', async () => {
      const { service } = setup({
        invite: liveInvite({ expiresAt: new Date(Date.now() - 1000) }),
      });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toContain('inviteError=invalid');
    });

    it('treats an already-used invite as invalid', async () => {
      const { service } = setup({ invite: liveInvite({ usedAt: new Date() }) });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toContain('inviteError=invalid');
    });

    describe('with a platform root domain', () => {
      afterEach(() => {
        delete mockEnv.PLATFORM_ROOT_DOMAIN;
      });

      it("redirects to the inviting gym's own host, not WEB_URL", async () => {
        mockEnv.PLATFORM_ROOT_DOMAIN = 'formacore.io';
        const { service } = setup({ invite: liveInvite(), userExists: false });
        const { url } = await service.acceptInvite('tok-123');
        expect(url).toBe('https://downtown.formacore.io/member/register?inviteToken=tok-123');
      });

      it("sends a spent invite to that gym's login", async () => {
        mockEnv.PLATFORM_ROOT_DOMAIN = 'formacore.io';
        const { service } = setup({ invite: liveInvite({ usedAt: new Date() }) });
        const { url } = await service.acceptInvite('tok-123');
        expect(url).toBe('https://downtown.formacore.io/member/login?inviteError=invalid');
      });

      it('falls back to WEB_URL for an unknown token, which names no gym', async () => {
        mockEnv.PLATFORM_ROOT_DOMAIN = 'formacore.io';
        const { service } = setup({ invite: null });
        const { url } = await service.acceptInvite('nope');
        expect(url).toBe('https://app.example.com/member/login?inviteError=invalid');
      });
    });
  });

  describe('redeemStaffInvite (via register)', () => {
    it('creates the staff membership and marks the invite used', async () => {
      const { service, gymMemberUpsert, staffInviteUpdateMany } = setup({
        invite: liveInvite({ email: 'invitee@example.com', role: Role.RECEPTIONIST }),
      });

      await service.register({
        name: 'Invitee',
        email: 'invitee@example.com',
        password: 'password123',
        inviteToken: 'tok-123',
      });

      // The invite is claimed single-use (guarded on usedAt: null)…
      expect(staffInviteUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1', usedAt: null } }),
      );
      // …and the gym-staff membership is upserted with the invited role.
      expect(gymMemberUpsert.mock.calls[0]?.[0]).toMatchObject({
        where: { userId_gymId: { userId: 'u-new', gymId: 'gym-1' } },
        create: { role: Role.RECEPTIONIST, status: 'ACTIVE' },
      });
    });

    it("writes the inviting gym's credential with the password just chosen, already verified", async () => {
      const { service, credentialCreate, set, sendVerificationEmail } = setup({
        invite: liveInvite({ email: 'invitee@example.com', role: Role.RECEPTIONIST }),
      });

      await service.register({
        name: 'Invitee',
        email: 'invitee@example.com',
        password: 'password123',
        inviteToken: 'tok-123',
      });

      const created = credentialCreate.mock.calls[0]?.[0] as {
        data: { userId: string; gymId: string; passwordHash: string; emailVerifiedAt: unknown };
      };
      expect(created.data).toMatchObject({
        userId: 'u-new',
        gymId: 'gym-1',
        passwordHash: 'argon2-hash',
        name: 'Invitee',
      });
      expect(created.data.emailVerifiedAt).toBeInstanceOf(Date);
      // The verification link names the gym it lands on.
      expect(set.mock.calls[0]?.[1]).toBe(JSON.stringify({ userId: 'u-new', gymId: 'gym-1' }));
      expect(sendVerificationEmail).toHaveBeenCalledWith(
        'invitee@example.com',
        expect.any(String),
        'Invitee',
        'en',
        'downtown',
      );
    });

    it('redeems onto an EXISTING address as a new password for this gym, with no 409 and no mail', async () => {
      const { service, userCreate, credentialCreate, gymMemberUpsert, sendVerificationEmail } =
        setup({
          invite: liveInvite({ email: 'invitee@example.com', role: Role.MANAGER }),
          userExists: true,
          credentialExists: false,
        });

      const result = await service.register({
        name: 'Invitee',
        email: 'invitee@example.com',
        password: 'password123',
        inviteToken: 'tok-123',
      });

      // Same answer as a brand-new registration: nothing says the address existed.
      expect(result).toEqual({ message: 'verification email sent' });
      expect(userCreate).not.toHaveBeenCalled();
      expect(gymMemberUpsert.mock.calls[0]?.[0]).toMatchObject({
        where: { userId_gymId: { userId: 'u-existing', gymId: 'gym-1' } },
      });
      expect(credentialCreate.mock.calls[0]?.[0]).toMatchObject({
        data: { userId: 'u-existing', gymId: 'gym-1', passwordHash: 'argon2-hash' },
      });
      // The invite proved inbox control; no verification mail is owed.
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('keeps the password an existing member of this gym already has when the invite promotes them', async () => {
      const { service, credentialCreate, credentialUpdate } = setup({
        invite: liveInvite({ email: 'invitee@example.com', role: Role.MANAGER }),
        userExists: true,
        credentialExists: true,
      });

      await service.register({
        name: 'Invitee',
        email: 'invitee@example.com',
        password: 'password123',
        inviteToken: 'tok-123',
      });

      expect(credentialCreate).not.toHaveBeenCalled();
      expect(credentialUpdate.mock.calls[0]?.[0]).toMatchObject({
        data: { passwordHash: 'old-hash', name: 'Old' },
      });
    });

    it('still answers 409 EMAIL_TAKEN for an existing address whose invite is stale', async () => {
      const { service, credentialCreate } = setup({
        invite: liveInvite({ email: 'invitee@example.com', usedAt: new Date() }),
        userExists: true,
      });

      await expect(
        service.register({
          name: 'Invitee',
          email: 'invitee@example.com',
          password: 'password123',
          inviteToken: 'tok-123',
        }),
      ).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
      expect(credentialCreate).not.toHaveBeenCalled();
    });

    it('creates the coach profile when the invited role is TRAINER', async () => {
      const { service, trainerCreate } = setup({
        invite: liveInvite({ email: 'invitee@example.com', role: Role.TRAINER }),
      });

      await service.register({
        name: 'Invitee',
        email: 'invitee@example.com',
        password: 'password123',
        inviteToken: 'tok-123',
      });

      // Without this a coach signs in, shows on the Staff roster, and is absent
      // from the Trainers roster and every class's trainer picker.
      expect(trainerCreate.mock.calls[0]?.[0]).toMatchObject({
        data: { gymId: 'gym-1', staffId: 'gm-1', name: 'Invitee' },
      });
    });

    it('creates no coach profile for a non-trainer role', async () => {
      const { service, trainerCreate } = setup({
        invite: liveInvite({ email: 'invitee@example.com', role: Role.RECEPTIONIST }),
      });

      await service.register({
        name: 'Invitee',
        email: 'invitee@example.com',
        password: 'password123',
        inviteToken: 'tok-123',
      });

      expect(trainerCreate).not.toHaveBeenCalled();
    });

    it('ignores an invite whose email does not match the account', async () => {
      const { service, gymMemberUpsert } = setup({
        invite: liveInvite({ email: 'someone-else@example.com' }),
      });

      await service.register({
        name: 'Invitee',
        email: 'invitee@example.com',
        password: 'password123',
        inviteToken: 'tok-123',
      });

      expect(gymMemberUpsert).not.toHaveBeenCalled();
    });

    it('does nothing when no invite token is supplied', async () => {
      const { service, staffInviteFindUnique } = setup({ invite: liveInvite() });

      await service.register({
        name: 'Plain',
        email: 'plain@example.com',
        password: 'password123',
      });

      expect(staffInviteFindUnique).not.toHaveBeenCalled();
    });
  });
});
