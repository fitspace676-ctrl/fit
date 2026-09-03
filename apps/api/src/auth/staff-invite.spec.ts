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
  expiresAt: Date;
  usedAt: Date | null;
}

function setup(opts?: {
  invite?: Invite | null;
  userExists?: boolean;
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

  const client = {
    user: { findUnique: userFindUnique, create: userCreate, updateMany: userUpdateMany },
    staffInvite: { findUnique: staffInviteFindUnique, updateMany: staffInviteUpdateMany },
    gymMember: { upsert: gymMemberUpsert, findFirst: gymMemberFindFirst },
    trainer: { findFirst: trainerFindFirst, create: trainerCreate, update: trainerUpdate },
    $transaction: vi.fn((cb: (tx: typeof client) => unknown) => cb(client)),
  };

  const prisma = { client } as unknown as PrismaService;
  const redis = {
    client: { set: vi.fn(() => Promise.resolve('OK')), get: vi.fn(), del: vi.fn() },
  } as unknown as RedisService;
  const tokens = {
    issueTokenPair: vi.fn(() => Promise.resolve({ accessToken: 'a', refreshToken: 'r' })),
  } as unknown as TokenService;
  const email = {
    sendVerificationEmail: vi.fn(() => Promise.resolve()),
  } as unknown as EmailService;
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
  };
}

const liveInvite = (over?: Partial<Invite>): Invite => ({
  id: 'inv-1',
  email: 'invitee@example.com',
  role: Role.MANAGER,
  gymId: 'gym-1',
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

    it('routes an existing address to the login flow with the token', async () => {
      const { service } = setup({ invite: liveInvite(), userExists: true });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toBe('https://app.example.com/member/login?inviteToken=tok-123');
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
