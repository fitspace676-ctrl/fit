import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstanceStatus } from '@fit/db';
import type { AdminScheduleQuery } from '@fit/types';
import { AdminScheduleService } from './admin-schedule.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** A joined occurrence row as the schedule projection selects it. */
interface ScheduleRow {
  id: string;
  templateId: string;
  startsAt: Date;
  endsAt: Date;
  capacityOverride: number | null;
  bookedCount: number;
  status: InstanceStatus;
  template: {
    title: string;
    category: string;
    color: string;
    room: string | null;
    capacity: number;
    durationMinutes: number;
    trainer: { name: string } | null;
    location: { name: string } | null;
  };
}

interface FindManyArgs {
  where?: {
    startsAt?: { gte?: Date; lt?: Date };
    template?: { trainerId?: unknown; locationId?: unknown };
  };
  orderBy?: unknown;
  select?: unknown;
}

const row = (over?: Partial<ScheduleRow>): ScheduleRow => ({
  id: 'ci-1',
  templateId: 'ct-1',
  startsAt: new Date('2026-06-01T09:00:00.000Z'),
  endsAt: new Date('2026-06-01T10:00:00.000Z'),
  capacityOverride: null,
  bookedCount: 4,
  status: InstanceStatus.SCHEDULED,
  template: {
    title: 'Morning Flow',
    category: 'Yoga',
    color: '#2563eb',
    room: 'Studio A',
    capacity: 12,
    durationMinutes: 60,
    trainer: { name: 'Nino Beridze' },
    location: { name: 'Vake Branch' },
  },
  ...over,
});

function setup(findManyResult: ScheduleRow[] = []) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<ScheduleRow[]>>(() =>
    Promise.resolve(findManyResult),
  );
  const client = { classInstance: { findMany } } as unknown;
  const prisma = { client } as unknown as TenantPrismaService;
  return { service: new AdminScheduleService(prisma), findMany };
}

const query = (over?: Partial<AdminScheduleQuery>): AdminScheduleQuery => ({
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-08T00:00:00.000Z',
  ...over,
});

describe('AdminScheduleService', () => {
  afterEach(() => vi.clearAllMocks());

  it('windows the query to [from, to) on startsAt and orders by start then id', async () => {
    const { service, findMany } = setup([row()]);

    await service.listSchedule(query());

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0]![0];
    expect(args.where?.startsAt).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lt: new Date('2026-06-08T00:00:00.000Z'),
    });
    // No template filter when neither trainer nor location is requested.
    expect(args.where?.template).toBeUndefined();
    expect(args.orderBy).toEqual([{ startsAt: 'asc' }, { id: 'asc' }]);
  });

  it('projects an occurrence to the denormalised calendar block', async () => {
    const { service } = setup([row()]);

    const { instances } = await service.listSchedule(query());

    expect(instances).toEqual([
      {
        id: 'ci-1',
        templateId: 'ct-1',
        title: 'Morning Flow',
        category: 'Yoga',
        color: '#2563eb',
        startsAt: '2026-06-01T09:00:00.000Z',
        endsAt: '2026-06-01T10:00:00.000Z',
        durationMinutes: 60,
        trainerName: 'Nino Beridze',
        locationName: 'Vake Branch',
        room: 'Studio A',
        capacity: 12,
        bookedCount: 4,
        status: 'SCHEDULED',
      },
    ]);
  });

  it('prefers the per-occurrence capacity override over the template capacity', async () => {
    const { service } = setup([row({ capacityOverride: 8 })]);

    const { instances } = await service.listSchedule(query());

    expect(instances[0]!.capacity).toBe(8);
  });

  it('flattens an absent trainer / location / room to null (the admin convention)', async () => {
    const { service } = setup([
      row({ template: { ...row().template, trainer: null, location: null, room: null } }),
    ]);

    const { instances } = await service.listSchedule(query());

    expect(instances[0]!.trainerName).toBeNull();
    expect(instances[0]!.locationName).toBeNull();
    expect(instances[0]!.room).toBeNull();
  });

  it('returns occurrences of every status, not just SCHEDULED', async () => {
    const { service } = setup([
      row({ id: 'ci-a', status: InstanceStatus.SCHEDULED }),
      row({ id: 'ci-b', status: InstanceStatus.CANCELED }),
      row({ id: 'ci-c', status: InstanceStatus.COMPLETED }),
    ]);

    const { instances } = await service.listSchedule(query());

    expect(instances.map((i) => i.status)).toEqual(['SCHEDULED', 'CANCELED', 'COMPLETED']);
  });

  it('narrows through the template relation when a trainer filter is set', async () => {
    const { service, findMany } = setup();

    await service.listSchedule(query({ trainerId: 'tr-9' }));

    expect(findMany.mock.calls[0]![0].where?.template).toEqual({ trainerId: 'tr-9' });
  });

  it('narrows on both trainer and location together', async () => {
    const { service, findMany } = setup();

    await service.listSchedule(query({ trainerId: 'tr-9', locationId: 'loc-3' }));

    expect(findMany.mock.calls[0]![0].where?.template).toEqual({
      trainerId: 'tr-9',
      locationId: 'loc-3',
    });
  });

  it('returns an empty window as a normal result', async () => {
    const { service } = setup([]);

    await expect(service.listSchedule(query())).resolves.toEqual({ instances: [] });
  });
});
