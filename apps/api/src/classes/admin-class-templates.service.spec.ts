import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClassTemplateStatus } from '@fit/db';
import type {
  CreateClassTemplateData,
  ListAdminClassTemplatesQuery,
  UpdateClassTemplateData,
} from '@fit/types';
import { AdminClassTemplatesService } from './admin-class-templates.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A class-template row as the service's projection selects it. */
interface ClassTemplateRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  trainerId: string | null;
  locationId: string | null;
  room: string | null;
  capacity: number;
  durationMinutes: number;
  rrule: string;
  color: string;
  status: ClassTemplateStatus;
  validFrom: Date;
  validUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  trainer: { name: string } | null;
  location: { name: string } | null;
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

const row = (over?: Partial<ClassTemplateRecord>): ClassTemplateRecord => ({
  id: 'ct-1',
  title: 'Morning HIIT',
  description: 'High-intensity interval training.',
  category: 'Cardio',
  trainerId: 'tr-1',
  locationId: 'loc-1',
  room: 'Studio A',
  capacity: 20,
  durationMinutes: 45,
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  color: '#2563eb',
  status: ClassTemplateStatus.ACTIVE,
  validFrom: new Date('2026-06-01T00:00:00.000Z'),
  validUntil: new Date('2026-12-31T00:00:00.000Z'),
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
  trainer: { name: 'Jane Coach' },
  location: { name: 'Downtown' },
  ...over,
});

function setup(overrides?: {
  findMany?: ClassTemplateRecord[];
  count?: number;
  findFirst?: ClassTemplateRecord | null;
  trainer?: { id: string } | null;
  location?: { id: string } | null;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<ClassTemplateRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<ClassTemplateRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const create = vi.fn<(args: WhereArgs) => Promise<ClassTemplateRecord>>(() =>
    Promise.resolve(row()),
  );
  const update = vi.fn<(args: WhereArgs) => Promise<ClassTemplateRecord>>(() =>
    Promise.resolve(row()),
  );
  const trainerFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.trainer === undefined ? { id: 'tr-1' } : overrides.trainer),
  );
  const locationFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.location === undefined ? { id: 'loc-1' } : overrides.location),
  );

  const client: Record<string, unknown> = {
    classTemplate: { findMany, count, findFirst, create, update },
    trainer: { findFirst: trainerFindFirst },
    location: { findFirst: locationFindFirst },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new AdminClassTemplatesService(prisma, tenant),
    findMany,
    count,
    findFirst,
    create,
    update,
    trainerFindFirst,
    locationFindFirst,
  };
}

function query(overrides?: Partial<ListAdminClassTemplatesQuery>): ListAdminClassTemplatesQuery {
  return { page: 1, limit: 20, sort: 'title', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreateClassTemplateData>): CreateClassTemplateData => ({
  title: 'Morning HIIT',
  description: 'High-intensity interval training.',
  category: 'Cardio',
  trainerId: null,
  locationId: null,
  room: null,
  capacity: 20,
  durationMinutes: 45,
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  color: '#2563eb',
  status: 'ACTIVE',
  validFrom: '2026-06-01',
  validUntil: '2026-12-31',
  ...over,
});

const updateInput = (over?: Partial<UpdateClassTemplateData>): UpdateClassTemplateData => ({
  title: 'Evening HIIT',
  description: 'Updated copy.',
  category: 'Strength',
  trainerId: null,
  locationId: null,
  room: 'Studio B',
  capacity: 30,
  durationMinutes: 60,
  rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
  color: '#16a34a',
  validFrom: '2026-07-01',
  validUntil: null,
  ...over,
});

describe('AdminClassTemplatesService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listClassTemplates', () => {
    it('projects rows to denormalised rows with a human recurrence + relation names', async () => {
      const { service } = setup({ findMany: [row()], count: 1 });

      const result = await service.listClassTemplates(query());

      expect(result).toEqual({
        data: [
          {
            id: 'ct-1',
            title: 'Morning HIIT',
            category: 'Cardio',
            capacity: 20,
            durationMinutes: 45,
            recurrence: 'Every week on Mon, Wed, Fri',
            color: '#2563eb',
            trainerName: 'Jane Coach',
            locationName: 'Downtown',
            status: 'ACTIVE',
            validFrom: '2026-06-01',
            validUntil: '2026-12-31',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('reports null relation names + validUntil for a bare template', async () => {
      const { service } = setup({
        findMany: [row({ trainer: null, location: null, validUntil: null })],
        count: 1,
      });

      const result = await service.listClassTemplates(query());

      expect(result.data[0]).toMatchObject({
        trainerName: null,
        locationName: null,
        validUntil: null,
      });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listClassTemplates(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('builds a case-insensitive title/category search', async () => {
      const { service, findMany } = setup();

      await service.listClassTemplates(query({ search: 'hiit' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toEqual([
        { title: { contains: 'hiit', mode: 'insensitive' } },
        { category: { contains: 'hiit', mode: 'insensitive' } },
      ]);
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listClassTemplates(query({ sort: 'title', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ title: 'desc' });

      await service.listClassTemplates(query({ sort: 'capacity', dir: 'asc' }));
      expect(findMany.mock.calls[1]?.[0]?.orderBy).toEqual({ capacity: 'asc' });

      await service.listClassTemplates(query({ sort: 'validFrom', dir: 'asc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ validFrom: 'asc' });

      await service.listClassTemplates(query({ sort: 'createdAt', dir: 'desc' }));
      expect(findMany.mock.calls[3]?.[0]?.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('getClassTemplate', () => {
    it('returns the full detail projection with the raw rrule + relation ids', async () => {
      const { service } = setup({ findFirst: row() });

      const result = await service.getClassTemplate('ct-1');

      expect(result).toMatchObject({
        id: 'ct-1',
        title: 'Morning HIIT',
        recurrence: 'Every week on Mon, Wed, Fri',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        trainerId: 'tr-1',
        locationId: 'loc-1',
        room: 'Studio A',
        description: 'High-intensity interval training.',
        validFrom: '2026-06-01',
        validUntil: '2026-12-31',
        updatedAt: '2026-03-02T00:00:00.000Z',
      });
    });

    it('throws 404 CLASS_TEMPLATE_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getClassTemplate('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createClassTemplate', () => {
    it('stamps the tenant gymId and persists the profile fields as dates', async () => {
      const { service, create } = setup();

      await service.createClassTemplate(createInput({ status: 'PAUSED' }));

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: 'gym-1',
        title: 'Morning HIIT',
        capacity: 20,
        durationMinutes: 45,
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        color: '#2563eb',
        status: 'PAUSED',
        room: null,
      });
      const data = create.mock.calls[0]?.[0]?.data ?? {};
      expect((data.validFrom as Date).toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect((data.validUntil as Date).toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    it('stores a null validUntil for an open-ended template', async () => {
      const { service, create } = setup();

      await service.createClassTemplate(createInput({ validUntil: null }));

      expect(create.mock.calls[0]?.[0]?.data?.validUntil).toBeNull();
    });

    it('validates a provided trainerId against the gym (400 when missing)', async () => {
      const { service, create } = setup({ trainer: null });

      await expect(
        service.createClassTemplate(createInput({ trainerId: 'cross-tenant' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });

    it('validates a provided locationId against the gym (400 when missing)', async () => {
      const { service, create } = setup({ location: null });

      await expect(
        service.createClassTemplate(createInput({ locationId: 'cross-tenant' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('updateClassTemplate', () => {
    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updateClassTemplate('ct-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'ct-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        title: 'Evening HIIT',
        capacity: 30,
        durationMinutes: 60,
        rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
        color: '#16a34a',
        room: 'Studio B',
        validUntil: null,
      });
      expect(data).not.toHaveProperty('status');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updateClassTemplate('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('pauseClassTemplate / resumeClassTemplate', () => {
    it('sets the status to PAUSED on pause', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.pauseClassTemplate('ct-1');

      expect(update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'ct-1' },
        data: { status: ClassTemplateStatus.PAUSED },
      });
    });

    it('sets the status to ACTIVE on resume', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.resumeClassTemplate('ct-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ status: ClassTemplateStatus.ACTIVE });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.pauseClassTemplate('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
