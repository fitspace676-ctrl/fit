import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the frozen env singleton (deterministic WEB_URL + TTL) and stub argon2 so
// the test neither loads the native addon nor pays hashing cost. Mirrors the
// approach in auth.service.spec.ts but scoped to the staff-invite (T4.7) paths.
const { mockEnv, argonHash } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {
    EMAIL_VERIFICATION_TTL: 86_400,
    WEB_URL: 'https://app.example.com',
    ADMIN_URL: 'https://app.example.com',
    ADMIN_BASE_PATH: '/admin',
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

import * as argon2 from 'argon2';
import { Role } from '@fit/db';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { TokenService } from './token.service';
import type { EmailService } from './email.service';
import type { GoogleOAuthService } from './google-oauth.service';
import type { AppleOAuthService } from './apple-oauth.service';

interface Invite {
  firstName?: string | null;
  lastName?: string | null;
  locationIds?: string[];
  id: string;
  email: string;
  role: Role;
  gymId: string;
  gym: { slug: string; name: string };
  expiresAt: Date;
  usedAt: Date | null;
}

function setup(opts?: {
  invite?: Invite | null;
  userExists?: boolean;
  credentialExists?: boolean;
  passwordHash?: string | null;
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
      firstName: opts?.invite?.firstName ?? null,
      lastName: opts?.invite?.lastName ?? null,
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
    Promise.resolve(
      opts?.credentialExists
        ? {
            id: 'cred-1',
            passwordHash: opts.passwordHash === undefined ? 'old-hash' : opts.passwordHash,
          }
        : null,
    ),
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

  const locationStaffDeleteMany = vi.fn(() => Promise.resolve({ count: 1 }));
  const locationStaffCreateMany = vi.fn((_args: unknown) => Promise.resolve({ count: 1 }));
  const userUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'u-new' }));
  const client = {
    location: { count: vi.fn(() => Promise.resolve(opts?.invite?.locationIds?.length ?? 0)) },
    locationStaff: { deleteMany: locationStaffDeleteMany, createMany: locationStaffCreateMany },
    user: {
      findUnique: userFindUnique,
      create: userCreate,
      updateMany: userUpdateMany,
      update: userUpdate,
    },
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
    locationStaffDeleteMany,
    locationStaffCreateMany,
    userUpdate,
    service: new AuthService(prisma, redis, tokens, email, google, apple),
    staffInviteFindUnique,
    staffInviteUpdateMany,
    gymMemberUpsert,
    trainerFindFirst,
    trainerCreate,
    trainerUpdate,
    userCreate,
    credentialFindFirst,
    credentialFindUnique,
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
  gym: { slug: 'downtown', name: 'Downtown Strength' },
  expiresAt: new Date(Date.now() + 1_000_000),
  usedAt: null,
  ...over,
});

describe('AuthService — staff invites (T4.7)', () => {
  afterEach(() => vi.clearAllMocks());

  describe('acceptInvite', () => {
    it('routes a brand-new address to console acceptance with the token', async () => {
      const { service } = setup({ invite: liveInvite(), userExists: false });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toBe('https://app.example.com/admin/accept-invite?token=tok-123');
    });

    it('routes an existing account to the same console acceptance page', async () => {
      const { service, credentialFindFirst } = setup({
        invite: liveInvite(),
        userExists: true,
        credentialExists: true,
      });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toBe('https://app.example.com/admin/accept-invite?token=tok-123');
      await service.inspectStaffInvite('tok-123');
      // "Has an account" is asked of the INVITING gym's credential, not of the address.
      expect(credentialFindFirst).toHaveBeenCalledWith({
        where: { gymId: 'gym-1', user: { email: 'invitee@example.com' } },
        select: { passwordHash: true },
      });
    });

    it('keeps an address known only from another gym on console acceptance', async () => {
      const { service } = setup({
        invite: liveInvite(),
        userExists: true,
        credentialExists: false,
      });
      const { url } = await service.acceptInvite('tok-123');
      expect(url).toBe('https://app.example.com/admin/accept-invite?token=tok-123');
    });

    it('routes an unknown token to console acceptance with an inviteError flag', async () => {
      const { service } = setup({ invite: null });
      const { url } = await service.acceptInvite('nope');
      expect(url).toBe('https://app.example.com/admin/accept-invite?inviteError=invalid');
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
        expect(url).toBe('https://downtown.formacore.io/admin/accept-invite?token=tok-123');
      });

      it("sends a spent invite to that gym's acceptance error", async () => {
        mockEnv.PLATFORM_ROOT_DOMAIN = 'formacore.io';
        const { service } = setup({ invite: liveInvite({ usedAt: new Date() }) });
        const { url } = await service.acceptInvite('tok-123');
        expect(url).toBe('https://downtown.formacore.io/admin/accept-invite?inviteError=invalid');
      });

      it('falls back to WEB_URL for an unknown token, which names no gym', async () => {
        mockEnv.PLATFORM_ROOT_DOMAIN = 'formacore.io';
        const { service } = setup({ invite: null });
        const { url } = await service.acceptInvite('nope');
        expect(url).toBe('https://app.example.com/admin/accept-invite?inviteError=invalid');
      });
    });
  });

  describe('staff invitation setup', () => {
    it('requires setup for a credential row without a password', async () => {
      const { service } = setup({
        invite: liveInvite(),
        credentialExists: true,
        passwordHash: null,
      });
      expect((await service.inspectStaffInvite('tok-123')).needsPassword).toBe(true);
      await expect(service.completeStaffInvite({ token: 'tok-123' })).rejects.toThrow(
        'Choose a password',
      );
    });

    it('reports the existing-password mode when this gym already has a password', async () => {
      const { service } = setup({ invite: liveInvite(), credentialExists: true });
      expect((await service.inspectStaffInvite('tok-123')).needsPassword).toBe(false);
    });

    it('rejects missing and incorrect current passwords without consuming the invite', async () => {
      const { service, staffInviteUpdateMany, userCreate } = setup({
        invite: liveInvite(),
        credentialExists: true,
      });
      await expect(service.completeStaffInvite({ token: 'tok-123' })).rejects.toThrow(
        'Email or password is incorrect',
      );
      vi.mocked(argon2.verify).mockResolvedValueOnce(false);
      await expect(
        service.completeStaffInvite({ token: 'tok-123', currentPassword: 'wrongpass' }),
      ).rejects.toThrow('Email or password is incorrect');
      expect(staffInviteUpdateMany).not.toHaveBeenCalled();
      expect(userCreate).not.toHaveBeenCalled();
    });

    it.each([true, false])('redeems after password proof (existing: %s)', async (existing) => {
      const { service, staffInviteUpdateMany, credentialUpdate } = setup({
        invite: liveInvite(),
        userExists: existing,
        credentialExists: existing,
      });
      vi.spyOn(service as never, 'assertGymAccessNotSuspended' as never).mockResolvedValue(
        undefined,
      );
      vi.spyOn(service as never, 'resolveSessionScope' as never).mockResolvedValue({});
      await expect(
        service.completeStaffInvite({
          token: 'tok-123',
          ...(existing ? { currentPassword: 'oldpassword' } : { password: 'newpassword' }),
        }),
      ).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });
      expect(staffInviteUpdateMany).toHaveBeenCalledOnce();
      if (existing)
        expect(credentialUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ passwordHash: 'old-hash' }) as object,
          }),
        );
    });

    it('rejects stale password proof if the credential changes during redemption', async () => {
      const { service, credentialFindUnique, credentialUpdate } = setup({
        invite: liveInvite(),
        userExists: true,
        credentialExists: true,
      });
      vi.spyOn(service as never, 'assertGymAccessNotSuspended' as never).mockResolvedValue(
        undefined,
      );
      credentialFindUnique.mockResolvedValueOnce({
        passwordHash: 'reset-hash',
        emailVerifiedAt: new Date(),
        name: 'QA',
      });
      await expect(
        service.completeStaffInvite({ token: 'tok-123', currentPassword: 'oldpassword' }),
      ).rejects.toThrow();
      expect(credentialUpdate).not.toHaveBeenCalled();
    });

    it('rejects a token on another gym before it can be spent', async () => {
      const { service, staffInviteUpdateMany } = setup({ invite: liveInvite() });
      await expect(
        service.completeStaffInvite({ token: 'tok-123', password: 'password123' }, 'uptown'),
      ).rejects.toThrow('Wrong gym');
      expect(staffInviteUpdateMany).not.toHaveBeenCalled();
    });

    it.each([null, liveInvite({ usedAt: new Date() }), liveInvite({ expiresAt: new Date(0) })])(
      'refuses invalid, used and expired invitations',
      async (invite) => {
        const { service, userCreate, staffInviteUpdateMany } = setup({ invite });
        await expect(
          service.completeStaffInvite({ token: 'tok-123', password: 'password123' }),
        ).rejects.toThrow();
        expect(userCreate).not.toHaveBeenCalled();
        expect(staffInviteUpdateMany).not.toHaveBeenCalled();
      },
    );
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
        expect.objectContaining({
          where: { id: 'inv-1', usedAt: null, expiresAt: { gt: expect.any(Date) as Date } },
        }) as object,
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
        'Downtown Strength',
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

describe('invited identity and branch assignments', () => {
  it('restores membership and replaces assignments, naming the trainer from the invitation', async () => {
    const {
      service,
      gymMemberUpsert,
      locationStaffDeleteMany,
      locationStaffCreateMany,
      credentialUpdate,
      trainerCreate,
      userUpdate,
    } = setup({
      invite: liveInvite({
        role: Role.TRAINER,
        firstName: 'Nino',
        lastName: 'Beridze',
        locationIds: ['loc-1', 'loc-2'],
      }),
      userExists: true,
      credentialExists: true,
    });
    await service.register({
      email: 'invitee@example.com',
      name: 'Account name',
      password: 'password123',
      inviteToken: 'tok-123',
    });
    expect(gymMemberUpsert.mock.calls[0]?.[0]).toMatchObject({
      update: {
        firstName: 'Nino',
        lastName: 'Beridze',
        archivedAt: null,
        status: 'ACTIVE',
        assignedLocationIds: ['loc-1', 'loc-2'],
      },
    });
    expect(locationStaffDeleteMany).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', staffId: 'gm-1' },
    });
    expect(locationStaffCreateMany).toHaveBeenCalledWith({
      data: [
        { gymId: 'gym-1', staffId: 'gm-1', locationId: 'loc-1' },
        { gymId: 'gym-1', staffId: 'gm-1', locationId: 'loc-2' },
      ],
    });
    expect(trainerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { gymId: 'gym-1', staffId: 'gm-1', name: 'Nino Beridze' } }),
    );
    expect(credentialUpdate.mock.calls[0]?.[0]).toMatchObject({
      data: { name: 'Nino Beridze', passwordHash: 'old-hash' },
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it('names a newly registered account from its invitation', async () => {
    const { service, userUpdate, credentialCreate } = setup({
      invite: liveInvite({ firstName: 'Nino', lastName: 'Beridze', locationIds: ['loc-1'] }),
    });
    await service.register({
      email: 'invitee@example.com',
      name: 'Typed name',
      password: 'password123',
      inviteToken: 'tok-123',
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u-new' },
      data: { name: 'Nino Beridze' },
    });
    expect(credentialCreate.mock.calls[0]?.[0]).toMatchObject({ data: { name: 'Nino Beridze' } });
  });
});
