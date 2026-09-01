import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
  /**
   * The branch assignments as `STAFF_SELECT` reads them since Stage 6 — the
   * `LocationStaff` join, not the deprecated `assignedLocationIds` array. The wire
   * shape the projection produces is unchanged; its SOURCE is not, and that is
   * exactly what these tests pin.
   */
  locationAssignments: { locationId: string; location: { name: string } }[];
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
  locationAssignments: [],
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
  /** The ids of the gym's live branches, for the write paths' pre-flight check. */
  locations?: string[];
}) {
  const gymMemberFindMany = vi.fn(
    (_args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) =>
      Promise.resolve(overrides?.staffFindMany ?? []),
  );
  const gymMemberFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.staffFindFirst === undefined ? row() : overrides.staffFindFirst),
  );
  const gymMemberCount = vi.fn(() => Promise.resolve(overrides?.ownerCount ?? 1));
  const gymMemberUpdate = vi.fn(
    (_args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) =>
      Promise.resolve(row()),
  );
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

  // The gym's live branches, and the join table the assignments are written to.
  const locationFindMany = vi.fn(() =>
    Promise.resolve((overrides?.locations ?? []).map((id) => ({ id }))),
  );
  const locationStaffDeleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
  const locationStaffCreateMany = vi.fn((_args: { data?: Record<string, unknown>[] }) =>
    Promise.resolve({ count: 0 }),
  );
  const userCreate = vi.fn(() => Promise.resolve({ id: 'u-new' }));
  const gymMemberCreate = vi.fn(
    (_args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) =>
      Promise.resolve({ id: 'gm-new' }),
  );
  const shiftSlotCreateMany = vi.fn((_args: { data?: Record<string, unknown>[] }) =>
    Promise.resolve({ count: 0 }),
  );
  const shiftSlotDeleteMany = vi.fn(() => Promise.resolve({ count: 0 }));

  const client: Record<string, unknown> = {
    gymMember: {
      findMany: gymMemberFindMany,
      findFirst: gymMemberFindFirst,
      count: gymMemberCount,
      create: gymMemberCreate,
      update: gymMemberUpdate,
      delete: gymMemberDelete,
    },
    staffInvite: {
      findMany: inviteFindMany,
      deleteMany: inviteDeleteMany,
      create: inviteCreate,
    },
    gym: { findUnique: gymFindUnique },
    user: {
      update: userUpdate,
      create: userCreate,
      findUnique: vi.fn(() => Promise.resolve(null)),
    },
    trainer: {
      findFirst: trainerFindFirst,
      create: trainerCreate,
      update: trainerUpdate,
      updateMany: trainerUpdateMany,
    },
    location: { findMany: locationFindMany },
    locationStaff: {
      deleteMany: locationStaffDeleteMany,
      createMany: locationStaffCreateMany,
    },
    shiftSlot: { createMany: shiftSlotCreateMany, deleteMany: shiftSlotDeleteMany },
    // The write paths run inside one transaction; the mock hands the callback the
    // same client, so an assertion on `locationStaff.createMany` proves the
    // assignment landed in the SAME transaction as the member write beside it.
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(client))),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const sendStaffInviteEmail = vi.fn(() => Promise.resolve());
  const email = { sendStaffInviteEmail } as unknown as EmailService;
  const revokeAllForUser = vi.fn(() => Promise.resolve());
  const tokens = { revokeAllForUser } as unknown as TokenService;

  return {
    service: new StaffService(prisma, tenant, email, tokens),
    locationFindMany,
    gymMemberFindMany,
    locationStaffDeleteMany,
    locationStaffCreateMany,
    gymMemberCreate,
    shiftSlotCreateMany,
    shiftSlotDeleteMany,
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

    it('resolves branch ids AND names off the join table, in one round trip', async () => {
      const { service, locationFindMany } = setup({
        staffFindMany: [
          row({
            locationAssignments: [
              { locationId: 'loc-1', location: { name: 'Vake' } },
              { locationId: 'loc-2', location: { name: 'Saburtalo' } },
            ],
          }),
        ],
      });

      const result = await service.listStaff();

      expect(result.staff[0]?.assignedLocationIds).toEqual(['loc-1', 'loc-2']);
      expect(result.staff[0]?.locations).toEqual(['Vake', 'Saburtalo']);
      // The array forced a second `location.findMany` to turn ids into names, plus
      // a `.filter(Boolean)` to drop ids naming branches that no longer existed.
      // The relation returns both with the row and the FK cascade makes a dangling
      // id impossible, so neither is needed — asserted so a re-added lookup shows
      // up as a failing test rather than as an extra query nobody notices.
      expect(locationFindMany).not.toHaveBeenCalled();
    });

    it('narrows by branch through the ROSTER, never through the base-branch column', async () => {
      const { service, gymMemberFindMany } = setup({ staffFindMany: [] });

      await service.listStaff({ locationId: 'loc-1' });

      const where = gymMemberFindMany.mock.calls[0]?.[0]?.where ?? {};
      // "Who can work here" — the availability half of the Stage 6 rule.
      expect(where.locationAssignments).toEqual({ some: { locationId: 'loc-1' } });
      // And emphatically NOT `GymMember.locationId`. On a staff row that column is
      // the person's BASE branch: it partitions the payroll, so it is what a
      // head-count reads. Filtering the roster on it would answer a different
      // question with a number that looks the same.
      expect(where).not.toHaveProperty('locationId');
    });

    it('leaves the pending-invite list unfiltered under a branch filter', async () => {
      const { service } = setup({
        staffFindMany: [],
        inviteFindMany: [
          {
            id: 'inv-1',
            email: 'a@example.com',
            role: Role.MANAGER,
            expiresAt: new Date(Date.now() + 1000),
            createdAt: new Date(),
          },
        ],
      });

      // An invitation names an email and a role; the person has no membership yet,
      // so there are no assignments to filter on. The roster narrows and this does
      // not — the honest rendering of "nobody has said where they will work".
      const result = await service.listStaff({ locationId: 'loc-1' });
      expect(result.invites).toHaveLength(1);
    });
  });

  describe('branch assignments and shift branches (the Stage 6 write paths)', () => {
    const shift = { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', locationId: 'loc-1' };
    const createInput = {
      firstName: 'Nino',
      lastName: 'Beridze',
      role: 'TRAINER' as const,
      status: 'ACTIVE' as const,
      assignedLocationIds: ['loc-1'],
      workingHours: [shift],
    };

    it('writes a shift with locationId — NOT the free-text `location` Prisma now rejects', async () => {
      const { service, shiftSlotCreateMany } = setup({ locations: ['loc-1'] });

      await service.createStaff(createInput);

      const data = shiftSlotCreateMany.mock.calls[0]?.[0]?.data ?? [];
      expect(data).toEqual([
        {
          gymId: 'gym-1',
          staffId: 'gm-new',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          locationId: 'loc-1',
        },
      ]);
      // The regression this pins is INVISIBLE to the compiler: a `location:` key
      // inside a `createMany` array literal escapes excess-property checking
      // entirely, so the old code type-checked cleanly and threw
      // `Unknown argument \`location\`` at runtime on every staff create.
      expect(data[0]).not.toHaveProperty('location');
    });

    it('writes the join table AND the deprecated shadow array, in one transaction', async () => {
      const { service, locationStaffCreateMany, locationStaffDeleteMany, gymMemberCreate } = setup({
        locations: ['loc-1'],
      });

      await service.createStaff(createInput);

      // Authoritative.
      expect(locationStaffDeleteMany).toHaveBeenCalledWith({ where: { staffId: 'gm-new' } });
      expect(locationStaffCreateMany).toHaveBeenCalledWith({
        data: [{ gymId: 'gym-1', staffId: 'gm-new', locationId: 'loc-1' }],
      });
      // The shadow, written in the same transaction. `assignedLocationIds` is
      // deprecated and no read path touches it any more, but it is kept in step
      // rather than left to rot: the column exists to keep the PREVIOUS API image
      // working through a rolling deploy, and that image renders the roster's
      // branch column off it. Stale here means a staff member edited during the
      // deploy window silently loses their branches on the old screens.
      expect(gymMemberCreate.mock.calls[0]?.[0]?.data?.assignedLocationIds).toEqual(['loc-1']);
    });

    it('collapses a duplicated branch id rather than violating the pair unique', async () => {
      const { service, locationStaffCreateMany } = setup({ locations: ['loc-1'] });

      await service.createStaff({ ...createInput, assignedLocationIds: ['loc-1', 'loc-1'] });

      // A duplicate in the old `String[]` was silently legal and doubled the person
      // in anything counted off it. The join table's `@@unique([staffId, locationId])`
      // would reject it outright, so it is collapsed at the boundary.
      expect(locationStaffCreateMany.mock.calls[0]?.[0]?.data).toHaveLength(1);
    });

    it("422s a branch id that is not one of this gym's, on either field", async () => {
      const assignment = setup({ locations: ['loc-1'] });
      await expect(
        assignment.service.createStaff({ ...createInput, assignedLocationIds: ['loc-elsewhere'] }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      // Nothing was written: the check runs before the transaction opens.
      expect(assignment.locationStaffCreateMany).not.toHaveBeenCalled();

      const rota = setup({ locations: ['loc-1'] });
      await expect(
        rota.service.createStaff({
          ...createInput,
          workingHours: [{ ...shift, locationId: 'loc-elsewhere' }],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(rota.shiftSlotCreateMany).not.toHaveBeenCalled();
    });

    it('replaces both sources on an edit, and leaves them alone when the field is absent', async () => {
      const edited = setup({ locations: ['loc-1', 'loc-2'] });
      await edited.service.updateStaffProfile('gm-1', { assignedLocationIds: ['loc-2'] });

      expect(edited.locationStaffDeleteMany).toHaveBeenCalledWith({ where: { staffId: 'gm-1' } });
      expect(edited.locationStaffCreateMany).toHaveBeenCalledWith({
        data: [{ gymId: 'gym-1', staffId: 'gm-1', locationId: 'loc-2' }],
      });
      expect(edited.gymMemberUpdate.mock.calls[0]?.[0]?.data?.assignedLocationIds).toEqual([
        'loc-2',
      ]);

      // A partial update that does not mention branches must not clear them —
      // set-based replacement applies to a SENT list, not to an absent one.
      const renamed = setup({ locations: ['loc-1'] });
      await renamed.service.updateStaffProfile('gm-1', { firstName: 'Nina' });
      expect(renamed.locationStaffDeleteMany).not.toHaveBeenCalled();
    });

    it('clears every assignment when an explicitly empty list is sent', async () => {
      const { service, locationStaffDeleteMany, locationStaffCreateMany } = setup({
        locations: ['loc-1'],
      });

      await service.updateStaffProfile('gm-1', { assignedLocationIds: [] });

      // "Works nowhere" is a real state, and it is not the same as "unchanged":
      // such a person is on the gym-wide roster and under no branch filter.
      expect(locationStaffDeleteMany).toHaveBeenCalledWith({ where: { staffId: 'gm-1' } });
      expect(locationStaffCreateMany).not.toHaveBeenCalled();
    });

    it('writes locationId on the schedule half of an edit too', async () => {
      const { service, shiftSlotCreateMany } = setup({ locations: ['loc-1'] });

      await service.updateStaffProfile('gm-1', { workingHours: [shift] });

      // The second of the two `createMany` sites the rename broke, and the second
      // that only failed at runtime.
      const data = shiftSlotCreateMany.mock.calls[0]?.[0]?.data ?? [];
      expect(data[0]).toMatchObject({ staffId: 'gm-1', locationId: 'loc-1' });
      expect(data[0]).not.toHaveProperty('location');
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
