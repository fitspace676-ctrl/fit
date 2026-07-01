import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TrainerStatus } from '@fit/db';
import {
  weeklyAvailabilitySchema,
  type CreateTrainerData,
  type ListAdminTrainersQuery,
  type UpdateTrainerData,
} from '@fit/types';
import { AdminTrainersService } from './admin-trainers.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A trainer row as the service's projection selects it. */
interface TrainerRecord {
  id: string;
  name: string;
  headline: string;
  bio: string;
  photoUrl: string | null;
  specialties: string[];
  status: TrainerStatus;
  createdAt: Date;
  updatedAt: Date;
  rating: number;
  reviewCount: number;
  availability?: unknown;
}

interface FindManyArgs {
  where?: { status?: unknown; OR?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown };
  data?: Record<string, unknown>;
}

const row = (over?: Partial<TrainerRecord>): TrainerRecord => ({
  id: 't-1',
  name: 'Giorgi Maisuradze',
  headline: 'Strength coach',
  bio: 'Ten years of powerlifting coaching.',
  photoUrl: null,
  specialties: ['Strength', 'Powerlifting'],
  status: TrainerStatus.ACTIVE,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
  rating: 4.9,
  reviewCount: 128,
  ...over,
});

function setup(overrides?: {
  findMany?: TrainerRecord[];
  count?: number;
  findFirst?: TrainerRecord | null;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<TrainerRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<TrainerRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const create = vi.fn<(args: WhereArgs) => Promise<TrainerRecord>>(() => Promise.resolve(row()));
  const update = vi.fn<(args: WhereArgs) => Promise<TrainerRecord>>(() => Promise.resolve(row()));

  // The enrichment (KPI summary, per-trainer classes/next-class, show-up rate,
  // this-week counts) reads other models. These permissive stubs let the list /
  // detail projections resolve without a live DB; each returns an "empty" figure,
  // so the tests below assert the projection shape via `toMatchObject`.
  const aggregate = vi.fn(() => Promise.resolve({ _avg: { rating: null } }));
  const classInstance = {
    findMany: vi.fn(() => Promise.resolve([] as unknown[])),
    count: vi.fn(() => Promise.resolve(0)),
  };
  const booking = {
    count: vi.fn(() => Promise.resolve(0)),
    findMany: vi.fn(() => Promise.resolve([] as unknown[])),
  };
  const review = { count: vi.fn(() => Promise.resolve(0)) };

  const client: Record<string, unknown> = {
    trainer: { findMany, count, findFirst, create, update, aggregate },
    classInstance,
    booking,
    review,
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new AdminTrainersService(prisma, tenant),
    findMany,
    count,
    findFirst,
    create,
    update,
  };
}

function query(overrides?: Partial<ListAdminTrainersQuery>): ListAdminTrainersQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreateTrainerData>): CreateTrainerData => ({
  name: 'Giorgi Maisuradze',
  headline: 'Strength coach',
  bio: 'Ten years of powerlifting coaching.',
  photoUrl: null,
  specialties: ['Strength'],
  status: 'ACTIVE',
  ...over,
});

const updateInput = (over?: Partial<UpdateTrainerData>): UpdateTrainerData => ({
  name: 'Giorgi Maisuradze',
  headline: 'Head coach',
  bio: 'Updated bio.',
  photoUrl: 'https://cdn.example.com/g.jpg',
  specialties: ['Strength', 'Mobility'],
  ...over,
});

describe('AdminTrainersService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listTrainers', () => {
    it('projects rows to denormalised AdminTrainerRows and echoes pagination totals', async () => {
      const { service } = setup({ findMany: [row()], count: 1 });

      const result = await service.listTrainers(query());

      // Core projection (matchObject tolerates the additive KPI fields —
      // rating/reviewCount/classesThisWeek/nextClass — and the `summary` block).
      expect(result).toMatchObject({
        data: [
          {
            id: 't-1',
            name: 'Giorgi Maisuradze',
            headline: 'Strength coach',
            photoUrl: null,
            specialties: ['Strength', 'Powerlifting'],
            status: 'ACTIVE',
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ status: 'INACTIVE' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'INACTIVE' });
    });

    it('builds a case-insensitive name/headline search', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ search: 'gio' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toEqual([
        { name: { contains: 'gio', mode: 'insensitive' } },
        { headline: { contains: 'gio', mode: 'insensitive' } },
      ]);
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listTrainers(query({ sort: 'name', dir: 'desc' }));
      await service.listTrainers(query({ sort: 'status', dir: 'asc' }));
      await service.listTrainers(query({ sort: 'createdAt', dir: 'desc' }));

      // The roster query is the only `trainer.findMany` that carries an `orderBy`
      // (the KPI-summary's id lookup does not), so filter to those to stay robust
      // against the enrichment's interleaved calls.
      const orderBys = findMany.mock.calls
        .map((c) => c[0]?.orderBy)
        .filter((o): o is NonNullable<typeof o> => Boolean(o));
      expect(orderBys).toEqual([{ name: 'desc' }, { status: 'asc' }, { createdAt: 'desc' }]);
    });
  });

  describe('getTrainer', () => {
    it('returns the full detail projection', async () => {
      const { service } = setup({ findFirst: row() });

      const result = await service.getTrainer('t-1');

      // Core detail projection (matchObject tolerates the additive KPI fields —
      // rating/reviewCount/hiredAt/showUpRate/thisWeek).
      expect(result).toMatchObject({
        id: 't-1',
        name: 'Giorgi Maisuradze',
        headline: 'Strength coach',
        photoUrl: null,
        specialties: ['Strength', 'Powerlifting'],
        status: 'ACTIVE',
        createdAt: '2026-02-01T00:00:00.000Z',
        bio: 'Ten years of powerlifting coaching.',
        updatedAt: '2026-02-02T00:00:00.000Z',
      });
    });

    it('throws 404 TRAINER_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getTrainer('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createTrainer', () => {
    it('stamps the tenant gymId and persists the profile fields', async () => {
      // `createTrainer` re-reads the created row via `getTrainer` to return the
      // enriched detail, so the mock must resolve that lookup.
      const { service, create } = setup({ findFirst: row() });

      await service.createTrainer(createInput({ name: 'New Coach', status: 'INACTIVE' }));

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: 'gym-1',
        name: 'New Coach',
        headline: 'Strength coach',
        status: 'INACTIVE',
        specialties: ['Strength'],
      });
    });
  });

  describe('updateTrainer', () => {
    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updateTrainer('t-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 't-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        name: 'Giorgi Maisuradze',
        headline: 'Head coach',
        photoUrl: 'https://cdn.example.com/g.jpg',
        specialties: ['Strength', 'Mobility'],
      });
      expect(data).not.toHaveProperty('status');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updateTrainer('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateTrainer / reactivateTrainer', () => {
    it('sets the status to INACTIVE on deactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.deactivateTrainer('t-1');

      expect(update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 't-1' },
        data: { status: TrainerStatus.INACTIVE },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.reactivateTrainer('t-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ status: TrainerStatus.ACTIVE });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.deactivateTrainer('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('getAvailability', () => {
    it('fills an empty stored availability to a complete fully-unavailable week', async () => {
      const { service } = setup({ findFirst: row({ availability: {} }) });

      const result = await service.getAvailability('t-1');

      expect(Object.keys(result.availability)).toEqual([
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
        'sat',
        'sun',
      ]);
      expect(result.availability.mon).toEqual({ available: false, windows: [] });
    });

    it('parses a stored partial week, defaulting absent days', async () => {
      const { service } = setup({
        findFirst: row({
          availability: { tue: { available: true, windows: [{ start: '09:00', end: '12:00' }] } },
        }),
      });

      const result = await service.getAvailability('t-1');

      expect(result.availability.tue).toEqual({
        available: true,
        windows: [{ start: '09:00', end: '12:00' }],
      });
      expect(result.availability.mon).toEqual({ available: false, windows: [] });
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getAvailability('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setAvailability', () => {
    it('persists the availability JSON after resolving the trainer, then returns it', async () => {
      const { service, findFirst, update } = setup({
        findFirst: row({
          availability: { mon: { available: true, windows: [{ start: '08:00', end: '10:00' }] } },
        }),
      });

      const result = await service.setAvailability('t-1', {
        availability: weeklyAvailabilitySchema.parse({
          mon: { available: true, windows: [{ start: '08:00', end: '10:00' }] },
        }),
      });

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 't-1' });
      expect(update.mock.calls[0]?.[0]).toMatchObject({ where: { id: 't-1' } });
      expect(update.mock.calls[0]?.[0]?.data).toHaveProperty('availability');
      expect(result.availability.mon).toEqual({
        available: true,
        windows: [{ start: '08:00', end: '10:00' }],
      });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(
        service.setAvailability('missing', { availability: weeklyAvailabilitySchema.parse({}) }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
