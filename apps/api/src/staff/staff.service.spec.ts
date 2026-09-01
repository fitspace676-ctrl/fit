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
  /** The linked coach profile (staff ⇄ trainer link), or `null` when they have none. */
  trainerProfile: { id: string } | null;
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
  trainerProfile: null,
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
  /** The coach profile already linked to the member under test, if any. */
  trainerFindFirst?: { id: string } | null;
  /** The caller's own role (an OWNER unless a test says otherwise). */
  callerRole?: Role;
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

  const gymFindUnique = vi.fn(() =>
    Promise.resolve({ name: 'Downtown Fitness', settings: { locale: { language: 'ka' } } }),
  );
  const userUpdate = vi.fn(() => Promise.resolve({ id: 'u-1' }));

  // Staff ⇄ trainer link: role changes and removals keep the coach profile in step.
  const trainerFindFirst = vi.fn(() => Promise.resolve(overrides?.trainerFindFirst ?? null));
  const trainerCreate = vi.fn(() => Promise.resolve({ id: 'tr-1' }));
  const trainerUpdate = vi.fn(() => Promise.resolve({ id: 'tr-1' }));
  const trainerUpdateMany = vi.fn(() => Promise.resolve({ count: 1 }));

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
    trainer: {
      findFirst: trainerFindFirst,
      create: trainerCreate,
      update: trainerUpdate,
      updateMany: trainerUpdateMany,
    },
    location: { findMany: vi.fn(() => Promise.resolve([] as { id: string; name: string }[])) },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = {
    gymId: 'gym-1',
    role: overrides?.callerRole ?? Role.OWNER,
  } as unknown as TenantContext;
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
    trainerFindFirst,
    trainerCreate,
    trainerUpdate,
    trainerUpdateMany,
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
          trainerId: null,
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
        // The gym's interface language decides the invite's language.
        'ka',
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

    it('creates the coach profile when someone becomes a TRAINER', async () => {
      const { service, trainerCreate } = setup({
        staffFindFirst: row({ role: Role.RECEPTIONIST, firstName: 'Nino', lastName: 'Beridze' }),
        trainerFindFirst: null,
      });

      await service.updateRole('gm-1', { role: 'TRAINER' });

      // Without this the person sits on the staff roster as a coach but cannot be
      // picked as a class trainer, because classes hang off `Trainer`.
      expect(trainerCreate).toHaveBeenCalledWith({
        data: { gymId: 'gym-1', name: 'Nino Beridze', staffId: 'gm-1' },
        select: { id: true },
      });
    });

    it('reactivates the profile they had before rather than creating a second one', async () => {
      const { service, trainerCreate, trainerUpdate } = setup({
        staffFindFirst: row({ role: Role.MANAGER }),
        trainerFindFirst: { id: 'tr-1' },
      });

      await service.updateRole('gm-1', { role: 'TRAINER' });

      expect(trainerCreate).not.toHaveBeenCalled();
      expect(trainerUpdate).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: { status: 'ACTIVE' },
      });
    });

    it('deactivates the coach profile when the TRAINER role is taken away', async () => {
      const { service, trainerUpdate } = setup({
        staffFindFirst: row({ role: Role.TRAINER }),
        trainerFindFirst: { id: 'tr-1' },
      });

      await service.updateRole('gm-1', { role: 'RECEPTIONIST' });

      // Deactivated, never deleted — the classes they taught still point at it.
      expect(trainerUpdate).toHaveBeenCalledWith({
        where: { id: 'tr-1' },
        data: { status: 'INACTIVE' },
      });
    });
  });

  describe('owner role restriction', () => {
    it('refuses a MANAGER promoting someone to OWNER with 403 OWNER_ROLE_RESTRICTED', async () => {
      const { service, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.MANAGER }),
        callerRole: Role.MANAGER,
      });

      await expect(service.updateRole('gm-1', { role: 'OWNER' })).rejects.toMatchObject({
        response: { code: 'OWNER_ROLE_RESTRICTED' },
      });
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });

    it('refuses a MANAGER re-roling an existing OWNER', async () => {
      const { service, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.OWNER }),
        ownerCount: 2,
        callerRole: Role.MANAGER,
      });

      await expect(service.updateRole('gm-1', { role: 'MANAGER' })).rejects.toMatchObject({
        response: { code: 'OWNER_ROLE_RESTRICTED' },
      });
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });

    it('refuses a MANAGER removing an OWNER', async () => {
      const { service, gymMemberDelete } = setup({
        staffFindFirst: row({ role: Role.OWNER }),
        ownerCount: 2,
        callerRole: Role.MANAGER,
      });

      await expect(service.removeStaff('gm-1')).rejects.toMatchObject({
        response: { code: 'OWNER_ROLE_RESTRICTED' },
      });
      expect(gymMemberDelete).not.toHaveBeenCalled();
    });

    it('refuses a MANAGER inviting an OWNER', async () => {
      const { service, inviteCreate } = setup({ callerRole: Role.MANAGER });

      await expect(
        service.inviteStaff({ email: 'boss@example.com', role: 'OWNER' }),
      ).rejects.toMatchObject({ response: { code: 'OWNER_ROLE_RESTRICTED' } });
      expect(inviteCreate).not.toHaveBeenCalled();
    });

    it('lets an OWNER promote a manager to OWNER', async () => {
      const { service, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.MANAGER }),
        callerRole: Role.OWNER,
      });

      await service.updateRole('gm-1', { role: 'OWNER' });
      expect(gymMemberUpdate).toHaveBeenCalledWith({
        where: { id: 'gm-1' },
        data: { role: 'OWNER' },
      });
    });

    it('lets a SUPER_ADMIN touch owners too', async () => {
      const { service, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.OWNER }),
        ownerCount: 2,
        callerRole: Role.SUPER_ADMIN,
      });

      await service.updateRole('gm-1', { role: 'MANAGER' });
      expect(gymMemberUpdate).toHaveBeenCalledOnce();
    });
  });

  describe('updateStaffProfile', () => {
    it('needs staff:assign-location to change assignedLocationIds', async () => {
      // A RECEPTIONIST never reaches this route (no staff:manage), but the check
      // is the service's own: it must not rely on the route guard.
      const { service, gymMemberUpdate } = setup({
        staffFindFirst: row({ role: Role.TRAINER }),
        callerRole: Role.RECEPTIONIST,
      });

      await expect(
        service.updateStaffProfile('gm-1', { assignedLocationIds: ['loc-1'] }),
      ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_PERMISSION' } });
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });
  });

  describe('removeStaff', () => {
    it('retires the coach profile before deleting the membership', async () => {
      const { service, trainerUpdateMany, gymMemberDelete } = setup({
        staffFindFirst: row({ role: Role.TRAINER }),
      });

      await service.removeStaff('gm-1');

      // The FK is SET NULL, so the profile survives the delete — but the person no
      // longer works here, so it must drop off the roster and the class picker.
      expect(trainerUpdateMany).toHaveBeenCalledWith({
        where: { staffId: 'gm-1' },
        data: { status: 'INACTIVE' },
      });
      expect(gymMemberDelete).toHaveBeenCalledOnce();
    });

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
