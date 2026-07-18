import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GymMemberStatus, Role } from '@fit/db';
import { StaffService } from './staff.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { EmailService } from '../auth/email.service';
import type { TokenService } from '../auth/token.service';

/** A staff membership row as the service's projection selects it (superset of every select). */
interface StaffRecord {
  id: string;
  userId: string;
  role: Role;
  status: GymMemberStatus;
  joinedAt: Date;
  firstName: string | null;
  lastName: string | null;
  assignedLocationIds: string[];
  user: { name: string | null; email: string; phone: string | null };
}

const row = (over?: Partial<StaffRecord>): StaffRecord => ({
  id: 'gm-1',
  userId: 'u-1',
  role: Role.MANAGER,
  status: GymMemberStatus.ACTIVE,
  joinedAt: new Date('2026-01-15T00:00:00.000Z'),
  firstName: null,
  lastName: null,
  assignedLocationIds: [],
  user: { name: 'Nino Beridze', email: 'nino@example.com', phone: null },
  ...over,
});

function setup(overrides?: {
  staffFindMany?: StaffRecord[];
  inviteFindMany?: Array<{
    id: string;
    email: string;
    role: Role;
    expiresAt: Date;
    createdAt: Date;
  }>;
  staffFindFirst?: StaffRecord | null;
  ownerCount?: number;
  deleteManyCount?: number;
}) {
  const gymMemberFindMany = vi.fn(() => Promise.resolve(overrides?.staffFindMany ?? []));
  const gymMemberFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.staffFindFirst === undefined ? row() : overrides.staffFindFirst),
  );
  const gymMemberCount = vi.fn(() => Promise.resolve(overrides?.ownerCount ?? 1));
  const gymMemberUpdate = vi.fn(() => Promise.resolve(row()));
  const gymMemberDelete = vi.fn(() => Promise.resolve(row()));

  const inviteFindMany = vi.fn(() => Promise.resolve(overrides?.inviteFindMany ?? []));
  const inviteDeleteMany = vi.fn(() => Promise.resolve({ count: overrides?.deleteManyCount ?? 1 }));
  const inviteCreate = vi.fn(() => Promise.resolve({ id: 'inv-1' }));

  const gymFindUnique = vi.fn(() => Promise.resolve({ name: 'Downtown Fitness' }));
  const userUpdate = vi.fn(() => Promise.resolve({ id: 'u-1' }));

  const client = {
    gymMember: {
      findMany: gymMemberFindMany,
      findFirst: gymMemberFindFirst,
      count: gymMemberCount,
      update: gymMemberUpdate,
      delete: gymMemberDelete,
    },
    staffInvite: {
      findMany: inviteFindMany,
      deleteMany: inviteDeleteMany,
      create: inviteCreate,
    },
    gym: { findUnique: gymFindUnique },
    user: { update: userUpdate },
    location: { findMany: vi.fn(() => Promise.resolve([] as { id: string; name: string }[])) },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const sendStaffInviteEmail = vi.fn(() => Promise.resolve());
  const email = { sendStaffInviteEmail } as unknown as EmailService;
  const revokeAllForUser = vi.fn(() => Promise.resolve());
  const tokens = { revokeAllForUser } as unknown as TokenService;

  return {
    service: new StaffService(prisma, tenant, email, tokens),
    gymMemberFindFirst,
    gymMemberCount,
    gymMemberUpdate,
    gymMemberDelete,
    inviteDeleteMany,
    inviteCreate,
    sendStaffInviteEmail,
    revokeAllForUser,
    userUpdate,
  };
}

describe('StaffService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listStaff', () => {
    it('projects staff rows and computes invite expiry', async () => {
      const past = new Date(Date.now() - 1000);
      const future = new Date(Date.now() + 1_000_000);
      const { service } = setup({
        staffFindMany: [row({ id: 'gm-1', role: Role.OWNER })],
        inviteFindMany: [
          {
            id: 'inv-1',
            email: 'a@example.com',
            role: Role.MANAGER,
            expiresAt: future,
            createdAt: past,
          },
          {
            id: 'inv-2',
            email: 'b@example.com',
            role: Role.TRAINER,
            expiresAt: past,
            createdAt: past,
          },
        ],
      });

      const result = await service.listStaff();

      expect(result.staff).toEqual([
        {
          id: 'gm-1',
          userId: 'u-1',
          name: 'Nino Beridze',
          firstName: 'Nino',
          lastName: 'Beridze',
          email: 'nino@example.com',
          phone: null,
          role: 'OWNER',
          status: 'ACTIVE',
          assignedLocationIds: [],
          locations: [],
          joinedAt: '2026-01-15T00:00:00.000Z',
        },
      ]);
      expect(result.invites[0]?.expired).toBe(false);
      expect(result.invites[1]?.expired).toBe(true);
    });
  });

  describe('inviteStaff', () => {
    it('rejects an address that is already staff with 409 ALREADY_STAFF', async () => {
      const { service, inviteCreate } = setup({ staffFindFirst: row() });

      await expect(
        service.inviteStaff({ email: 'nino@example.com', role: 'MANAGER' }),
      ).rejects.toMatchObject({ response: { code: 'ALREADY_STAFF' } });
      expect(inviteCreate).not.toHaveBeenCalled();
    });

    it('replaces prior pending invites, stores the invite, and emails the link', async () => {
      const { service, inviteDeleteMany, inviteCreate, sendStaffInviteEmail } = setup({
        staffFindFirst: null,
      });

      const result = await service.inviteStaff({ email: 'new@example.com', role: 'TRAINER' });

      expect(result).toEqual({ inviteId: 'inv-1' });
      expect(inviteDeleteMany).toHaveBeenCalledWith({
        where: { email: 'new@example.com', usedAt: null },
      });
      expect(inviteCreate).toHaveBeenCalledOnce();
      expect(sendStaffInviteEmail).toHaveBeenCalledWith(
        'new@example.com',
        expect.any(String),
        'Downtown Fitness',
        'TRAINER',
      );
    });

    it('still succeeds when the invite email fails to send', async () => {
      const { service, sendStaffInviteEmail } = setup({ staffFindFirst: null });
      sendStaffInviteEmail.mockRejectedValueOnce(new Error('resend down'));

      await expect(
        service.inviteStaff({ email: 'new@example.com', role: 'TRAINER' }),
      ).resolves.toEqual({ inviteId: 'inv-1' });
    });
  });

  describe('revokeInvite', () => {
    it('404s when no pending invite matches', async () => {
      const { service } = setup({ deleteManyCount: 0 });
      await expect(service.revokeInvite('inv-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves when an invite is deleted', async () => {
      const { service } = setup({ deleteManyCount: 1 });
      await expect(service.revokeInvite('inv-1')).resolves.toBeUndefined();
    });
  });

  describe('updateRole', () => {
    it('404s an unknown staff id', async () => {
      const { service } = setup({ staffFindFirst: null });
      await expect(service.updateRole('gm-x', { role: 'MANAGER' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to downgrade the only owner with 403 LAST_OWNER', async () => {
      const { service, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.OWNER }),
        ownerCount: 1,
      });

      await expect(service.updateRole('gm-1', { role: 'MANAGER' })).rejects.toMatchObject({
        response: { code: 'LAST_OWNER' },
      });
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });

    it('allows downgrading an owner when another owner exists', async () => {
      const { service, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.OWNER }),
        ownerCount: 2,
      });

      await service.updateRole('gm-1', { role: 'MANAGER' });
      expect(gymMemberUpdate).toHaveBeenCalledWith({
        where: { id: 'gm-1' },
        data: { role: 'MANAGER' },
      });
    });

    it('does not run the owner guard for a non-owner change', async () => {
      const { service, gymMemberCount, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.RECEPTIONIST }),
      });

      await service.updateRole('gm-1', { role: 'MANAGER' });
      expect(gymMemberCount).not.toHaveBeenCalled();
      expect(gymMemberUpdate).toHaveBeenCalledOnce();
    });
  });

  describe('removeStaff', () => {
    it('404s an unknown staff id', async () => {
      const { service } = setup({ staffFindFirst: null });
      await expect(service.removeStaff('gm-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to remove the only owner with 403 LAST_OWNER', async () => {
      const { service, gymMemberDelete } = setup({
        staffFindFirst: row({ role: Role.OWNER }),
        ownerCount: 1,
      });

      await expect(service.removeStaff('gm-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(gymMemberDelete).not.toHaveBeenCalled();
    });

    it('deletes the membership and revokes the user’s sessions', async () => {
      const { service, gymMemberDelete, revokeAllForUser, userUpdate } = setup({
        staffFindFirst: row({ id: 'gm-1', userId: 'u-9', role: Role.RECEPTIONIST }),
      });

      await service.removeStaff('gm-1');

      expect(gymMemberDelete).toHaveBeenCalledWith({ where: { id: 'gm-1' } });
      expect(revokeAllForUser).toHaveBeenCalledWith('u-9');
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u-9' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });
});
