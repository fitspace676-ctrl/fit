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
  trainer: { name: string };
  classType: { name: string; color: string } | null;
}

const ptRow = (over?: Partial<PtRow>): PtRow => ({
  id: 'pt-1',
  trainerId: 'tr-1',
  classTypeId: 'ct-1',
  startsAt: new Date('2026-07-20T09:00:00.000Z'),
  endsAt: new Date('2026-07-20T10:00:00.000Z'),
  status: InstanceStatus.SCHEDULED,
  notes: 'Focus on squat form',
  trainer: { name: 'Ana G.' },
  classType: { name: 'Strength', color: '#2563eb' },
  ...over,
});

function setup(over?: {
  findMany?: PtRow[];
  findFirst?: PtRow | null;
  trainer?: { id: string } | null;
  classType?: { id: string } | null;
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
    findFirst: vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
      Promise.resolve(over?.trainer === undefined ? { id: 'tr-1' } : over.trainer),
    ),
  };
  const classType = {
    findFirst: vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
      Promise.resolve(over?.classType === undefined ? { id: 'ct-1' } : over.classType),
    ),
  };
  const client = { ptSession, trainer, classType } as unknown;
  const prisma = { client } as unknown as TenantPrismaService;
  return { service: new PtSessionsService(prisma, tenantCtx), ptSession, trainer, classType };
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
