import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InstanceStatus } from '@fit/db';
import { ClassesService } from './classes.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A joined occurrence row as the service's detail projection selects it. */
interface InstanceRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacityOverride: number | null;
  bookedCount: number;
  status: InstanceStatus;
  template: {
    title: string;
    description: string;
    category: string;
    color: string;
    room: string | null;
    capacity: number;
    durationMinutes: number;
    trainer: { name: string } | null;
    location: { name: string } | null;
  };
}

interface FindFirstArgs {
  where?: { id?: unknown; gymId?: unknown };
  select?: unknown;
}

const row = (over?: Partial<InstanceRow>): InstanceRow => ({
  id: 'ci-1',
  startsAt: new Date('2026-06-01T09:00:00.000Z'),
  endsAt: new Date('2026-06-01T10:00:00.000Z'),
  capacityOverride: null,
  bookedCount: 4,
  status: InstanceStatus.SCHEDULED,
  template: {
    title: 'Morning Flow',
    description: 'A gentle vinyasa to start the day.',
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

interface FindManyArgs {
  where?: {
    gymId?: unknown;
    status?: unknown;
    startsAt?: { lt?: Date };
    endsAt?: { gt?: Date };
  };
  select?: unknown;
  orderBy?: unknown;
}

function setup(findFirstResult?: InstanceRow | null, findManyResult: InstanceRow[] = []) {
  const findFirst = vi.fn<(args: FindFirstArgs) => Promise<InstanceRow | null>>(() =>
    Promise.resolve(findFirstResult ?? null),
  );
  const findMany = vi.fn<(args: FindManyArgs) => Promise<InstanceRow[]>>(() =>
    Promise.resolve(findManyResult),
  );
  const client = { classInstance: { findFirst, findMany } } as unknown;
  const prisma = { client } as unknown as PrismaService;
  return { service: new ClassesService(prisma), findFirst, findMany };
}

describe('ClassesService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listInstances', () => {
    const window = {
      gymId: 'gym-1',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-08T00:00:00.000Z',
    };

    it('scopes to the gym, hides non-SCHEDULED occurrences, and orders by start', async () => {
      const { service, findMany } = setup(null, []);

      await service.listInstances(window);

      expect(findMany).toHaveBeenCalledTimes(1);
      const args = findMany.mock.calls[0]![0];
      expect(args.where?.gymId).toBe('gym-1');
      expect(args.where?.status).toBe('SCHEDULED');
      expect(args.orderBy).toEqual({ startsAt: 'asc' });
    });

    it('selects on OVERLAP so a class already running is still in the window', async () => {
      const { service, findMany } = setup(null, []);

      await service.listInstances(window);

      // `startsAt < to` AND `endsAt > from` — containment would drop the class
      // that began before the window opened but has not finished yet, which is
      // exactly the one a member checking "today" on arrival wants to see.
      const where = findMany.mock.calls[0]![0].where;
      expect(where?.startsAt).toEqual({ lt: new Date(window.to) });
      expect(where?.endsAt).toEqual({ gt: new Date(window.from) });
    });

    it('projects each row to a card, resolving the capacity override', async () => {
      const { service } = setup(null, [row({ capacityOverride: 8 })]);

      const result = await service.listInstances(window);

      expect(result).toEqual({
        instances: [
          {
            id: 'ci-1',
            title: 'Morning Flow',
            startsAt: '2026-06-01T09:00:00.000Z',
            endsAt: '2026-06-01T10:00:00.000Z',
            trainerName: 'Nino Beridze',
            locationName: 'Vake Branch',
            capacity: 8,
            bookedCount: 4,
            category: 'Yoga',
            color: '#2563eb',
          },
        ],
      });
    });

    it('returns an empty list for a gym with nothing scheduled in the window', async () => {
      const { service } = setup(null, []);
      await expect(service.listInstances(window)).resolves.toEqual({ instances: [] });
    });
  });

  describe('getInstance', () => {
    it('scopes the lookup to the id and gym, and projects the detail card', async () => {
      const { service, findFirst } = setup(row());

      const result = await service.getInstance('ci-1', { gymId: 'gym-1' });

      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(findFirst.mock.calls[0]![0].where).toEqual({ id: 'ci-1', gymId: 'gym-1' });
      expect(result).toEqual({
        instance: {
          id: 'ci-1',
          title: 'Morning Flow',
          description: 'A gentle vinyasa to start the day.',
          startsAt: '2026-06-01T09:00:00.000Z',
          endsAt: '2026-06-01T10:00:00.000Z',
          trainerName: 'Nino Beridze',
          locationName: 'Vake Branch',
          room: 'Studio A',
          capacity: 12,
          bookedCount: 4,
          durationMinutes: 60,
          category: 'Yoga',
          color: '#2563eb',
          status: 'SCHEDULED',
        },
      });
    });

    it('prefers the per-occurrence capacity override over the template capacity', async () => {
      const { service } = setup(row({ capacityOverride: 8 }));

      const { instance } = await service.getInstance('ci-1', { gymId: 'gym-1' });

      expect(instance.capacity).toBe(8);
    });

    it('flattens an absent trainer / location / room to empty strings', async () => {
      const { service } = setup(
        row({ template: { ...row().template, trainer: null, location: null, room: null } }),
      );

      const { instance } = await service.getInstance('ci-1', { gymId: 'gym-1' });

      expect(instance.trainerName).toBe('');
      expect(instance.locationName).toBe('');
      expect(instance.room).toBe('');
    });

    it('still resolves a non-scheduled occurrence, carrying its status', async () => {
      const { service } = setup(row({ status: InstanceStatus.CANCELED }));

      const { instance } = await service.getInstance('ci-1', { gymId: 'gym-1' });

      expect(instance.status).toBe('CANCELED');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service } = setup(null);

      const error = await service.getInstance('nope', { gymId: 'gym-1' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
    });
  });
});
