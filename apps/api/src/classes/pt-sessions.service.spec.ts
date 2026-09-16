import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InstanceStatus } from '@fit/db';
import type { CreatePtSessionData, ListAdminPtSessionsQuery } from '@fit/types';
import { PtSessionsService } from './pt-sessions.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A fixed tenant context — the service stamps `gymId` on a session it creates. */
const tenantCtx = { gymId: 'gym-1' } as unknown as TenantContext;

/** A joined PT-session row as the projection selects it. */
interface PtRow {
  id: string;
  trainerId: string;
  classTypeId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: InstanceStatus;
  notes: string;
  locationId: string | null;
  trainer: { name: string };
  classType: { name: string; color: string } | null;
  location: { name: string } | null;
}

const ptRow = (over?: Partial<PtRow>): PtRow => ({
  id: 'pt-1',
  trainerId: 'tr-1',
  classTypeId: 'ct-1',
  startsAt: new Date('2026-07-20T09:00:00.000Z'),
  endsAt: new Date('2026-07-20T10:00:00.000Z'),
  status: InstanceStatus.SCHEDULED,
  notes: 'Focus on squat form',
  locationId: 'loc-1',
  trainer: { name: 'Ana G.' },
  classType: { name: 'Strength', color: '#2563eb' },
  location: { name: 'Vake' },
  ...over,
});

function setup(over?: {
  findMany?: PtRow[];
  findFirst?: PtRow | null;
  trainer?: { id: string; staffId?: string | null } | null;
  classType?: { id: string } | null;
  /** The branches the coach's staff record is rostered at. */
  assignments?: string[];
  /** Whether a branch id the caller sent resolves to one of this gym's. */
  locationExists?: boolean;
}) {
  const ptSession = {
    findMany: vi.fn<(args: unknown) => Promise<PtRow[]>>(() =>
      Promise.resolve(over?.findMany ?? []),
    ),
    findFirst: vi.fn<(args: unknown) => Promise<PtRow | { id: string } | null>>(() =>
      Promise.resolve(over && 'findFirst' in over ? (over.findFirst ?? null) : ptRow()),
    ),
    create: vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
      Promise.resolve({ id: 'pt-1' }),
    ),
    update: vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve({ id: 'pt-1' })),
  };
  const trainer = {
    findFirst: vi.fn<(args: unknown) => Promise<{ id: string; staffId?: string | null } | null>>(
      () =>
        Promise.resolve(
          over?.trainer === undefined ? { id: 'tr-1', staffId: 'gm-1' } : over.trainer,
        ),
    ),
  };
  const location = {
    findFirst: vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
      Promise.resolve(over?.locationExists === false ? null : { id: 'loc-2' }),
    ),
  };
  const locationStaff = {
    findMany: vi.fn<(args: unknown) => Promise<{ locationId: string }[]>>(() =>
      Promise.resolve((over?.assignments ?? []).map((locationId) => ({ locationId }))),
    ),
  };
  const classType = {
    findFirst: vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
      Promise.resolve(over?.classType === undefined ? { id: 'ct-1' } : over.classType),
    ),
  };
  const client = { ptSession, trainer, classType, location, locationStaff } as unknown;
  const prisma = { client } as unknown as TenantPrismaService;
  return {
    service: new PtSessionsService(prisma, tenantCtx),
    ptSession,
    trainer,
    classType,
    location,
    locationStaff,
  };
}

const query = (over?: Partial<ListAdminPtSessionsQuery>): ListAdminPtSessionsQuery => ({
  from: '2026-07-20T00:00:00.000Z',
  to: '2026-07-27T00:00:00.000Z',
  trainerId: 'tr-1',
  ...over,
});

const createData = (over?: Partial<CreatePtSessionData>): CreatePtSessionData => ({
  trainerId: 'tr-1',
  classTypeId: 'ct-1',
  startsAt: '2026-07-20T09:00:00.000Z',
  durationMinutes: 60,
  notes: '',
  ...over,
});

describe('PtSessionsService', () => {
  describe('listPtSessions', () => {
    it('windows by [from, to) and the chosen trainer, and maps rows', async () => {
      const { service, ptSession } = setup({ findMany: [ptRow()] });

      const { sessions } = await service.listPtSessions(query());

      expect(ptSession.findMany).toHaveBeenCalledTimes(1);
      const args = ptSession.findMany.mock.calls[0]![0] as {
        where: { trainerId: string; startsAt: { gte: Date; lt: Date } };
      };
      expect(args.where.trainerId).toBe('tr-1');
      expect(args.where.startsAt.gte).toEqual(new Date('2026-07-20T00:00:00.000Z'));
      expect(args.where.startsAt.lt).toEqual(new Date('2026-07-27T00:00:00.000Z'));

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'pt-1',
        trainerName: 'Ana G.',
        classTypeId: 'ct-1',
        classTypeName: 'Strength',
        classTypeColor: '#2563eb',
        durationMinutes: 60,
        status: 'SCHEDULED',
      });
    });

    it('maps a since-deleted type to null name / colour', async () => {
      const { service } = setup({ findMany: [ptRow({ classTypeId: null, classType: null })] });
      const { sessions } = await service.listPtSessions(query());
      expect(sessions[0]).toMatchObject({
        classTypeId: null,
        classTypeName: null,
        classTypeColor: null,
      });
    });

    it('returns an empty list when the trainer has no sessions in the window', async () => {
      const { service } = setup({ findMany: [] });
      const { sessions } = await service.listPtSessions(query());
      expect(sessions).toEqual([]);
    });
  });

  describe('the branch a session runs at (Stage 6)', () => {
    it('narrows the calendar on the column, not on the coach', async () => {
      const { service, ptSession } = setup({ findMany: [] });

      await service.listPtSessions(query({ locationId: 'loc-1' }));

      const where = (ptSession.findMany.mock.calls[0]![0] as { where: Record<string, unknown> })
        .where;
      // The branch the hour was DELIVERED at. Before Stage 6 this model reached a
      // branch through nothing at all — not a column, not a relation — which is
      // why three surfaces were listed gym-wide on this one ground.
      expect(where.locationId).toBe('loc-1');
      // Not the coach's roster: a session is one hour at one door, and reaching it
      // through `LocationStaff` would leave "where is this" ambiguous for exactly
      // the coaches who cover two sites.
      expect(where).not.toHaveProperty('trainer');
    });

    it('projects the branch and its name onto the calendar block', async () => {
      const { service } = setup({ findMany: [ptRow()] });
      const { sessions } = await service.listPtSessions(query());
      expect(sessions[0]).toMatchObject({ locationId: 'loc-1', locationName: 'Vake' });
    });

    it('keeps a session whose branch was later closed, with no branch', async () => {
      // `SetNull` on delete: retiring a branch must not erase the coaching it
      // hosted. The row survives and falls out of every branch filter.
      const { service } = setup({ findMany: [ptRow({ locationId: null, location: null })] });
      const { sessions } = await service.listPtSessions(query());
      expect(sessions[0]).toMatchObject({ locationId: null, locationName: null });
    });

    it("stores the branch the caller sent, after checking it is this gym's", async () => {
      const { service, ptSession } = setup({ assignments: ['loc-1', 'loc-9'] });
      await service.createPtSession(createData({ locationId: 'loc-2' }));
      expect(
        (ptSession.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data,
      ).toMatchObject({ locationId: 'loc-2' });
    });

    it('422s a branch of another gym rather than dying on the foreign key', async () => {
      const { service, ptSession } = setup({ locationExists: false });
      await expect(
        service.createPtSession(createData({ locationId: 'loc-elsewhere' })),
      ).rejects.toMatchObject({ response: { code: 'LOCATION_INVALID' } });
      expect(ptSession.create).not.toHaveBeenCalled();
    });

    it('infers the branch when the coach is rostered at exactly one', async () => {
      const { service, ptSession } = setup({ assignments: ['loc-1'] });
      await service.createPtSession(createData());
      expect(
        (ptSession.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data,
      ).toMatchObject({ locationId: 'loc-1' });
    });

    it('leaves it null for a two-branch coach, an unrostered one, or an orphan profile', async () => {
      const two = setup({ assignments: ['loc-1', 'loc-2'] });
      await two.service.createPtSession(createData());
      expect(
        (two.ptSession.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data,
      ).toMatchObject({ locationId: null });

      const none = setup({ assignments: [] });
      await none.service.createPtSession(createData());
      expect(
        (none.ptSession.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data,
      ).toMatchObject({ locationId: null });

      // `Trainer.staffId` is `SetNull`, so a profile survives the person leaving
      // the directory and reaches no roster at all.
      const orphan = setup({ trainer: { id: 'tr-1', staffId: null } });
      await orphan.service.createPtSession(createData());
      expect(
        (orphan.ptSession.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data,
      ).toMatchObject({ locationId: null });
      expect(orphan.locationStaff.findMany).not.toHaveBeenCalled();
    });

    it("never falls back to the gym's default branch", async () => {
      const { service, location } = setup({ assignments: [] });
      await service.createPtSession(createData());
      // Stages 2 and 3 defaulted, because a member and a check-in are facts that
      // happened. A PT session is a PLAN: defaulting one puts an hour of coaching
      // at a door nobody booked, and the utilisation figures downstream would
      // reconcile perfectly against something that never happened.
      expect(location.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('createPtSession', () => {
    it('derives endsAt from durationMinutes and stamps the tenant gym', async () => {
      const { service, ptSession } = setup();

      await service.createPtSession(createData({ durationMinutes: 45 }));

      const args = ptSession.create.mock.calls[0]![0] as {
        data: {
          gymId: string;
          classTypeId: string;
          startsAt: Date;
          endsAt: Date;
          status: InstanceStatus;
        };
      };
      expect(args.data.gymId).toBe('gym-1');
      expect(args.data.classTypeId).toBe('ct-1');
      expect(args.data.startsAt).toEqual(new Date('2026-07-20T09:00:00.000Z'));
      // 45 minutes after the start.
      expect(args.data.endsAt).toEqual(new Date('2026-07-20T09:45:00.000Z'));
      expect(args.data.status).toBe(InstanceStatus.SCHEDULED);
    });

    it('404s when the trainer is unknown / cross-tenant', async () => {
      const { service, ptSession } = setup({ trainer: null });
      await expect(service.createPtSession(createData())).rejects.toBeInstanceOf(NotFoundException);
      expect(ptSession.create).not.toHaveBeenCalled();
    });

    it('404s when the workout type is unknown / cross-tenant', async () => {
      const { service, ptSession } = setup({ classType: null });
      await expect(service.createPtSession(createData())).rejects.toBeInstanceOf(NotFoundException);
      expect(ptSession.create).not.toHaveBeenCalled();
    });
  });

  describe('status transitions', () => {
    it('cancel sets status CANCELED', async () => {
      const { service, ptSession } = setup();
      await service.cancelPtSession('pt-1');
      const args = ptSession.update.mock.calls[0]![0] as { data: { status: InstanceStatus } };
      expect(args.data.status).toBe(InstanceStatus.CANCELED);
    });

    it('complete sets status COMPLETED', async () => {
      const { service, ptSession } = setup();
      await service.completePtSession('pt-1');
      const args = ptSession.update.mock.calls[0]![0] as { data: { status: InstanceStatus } };
      expect(args.data.status).toBe(InstanceStatus.COMPLETED);
    });

    it('404s when the session to cancel does not exist', async () => {
      const { service, ptSession } = setup({ findFirst: null });
      await expect(service.cancelPtSession('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(ptSession.update).not.toHaveBeenCalled();
    });
  });

  describe('getPtSession', () => {
    it('404s when the session does not exist', async () => {
      const { service } = setup({ findFirst: null });
      await expect(service.getPtSession('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
