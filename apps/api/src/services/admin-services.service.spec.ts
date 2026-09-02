import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdminServicesService, personalTrainingName } from './admin-services.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { GymLocaleService } from '../gyms/gym-locale.service';

interface Args {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: unknown;
  orderBy?: unknown;
  skip?: number;
  take?: number;
}

/** A staff row as `STAFF_SELECT` projects it. */
const staff = (over: Record<string, unknown> = {}) => ({
  id: 'gm-1',
  role: 'TRAINER',
  firstName: 'Nino',
  lastName: 'Beridze',
  user: { name: 'Nino Beridze' },
  trainerProfile: { id: 'tr-1', photoUrl: 'https://cdn/nino.jpg' },
  ...over,
});

/** A service row as `SERVICE_SELECT` projects it. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 's-1',
  type: 'PERSONAL_TRAINING',
  name: 'Personal session - Nino Beridze',
  priceMinor: 5000,
  currency: 'GEL',
  durationMinutes: 60,
  description: '',
  coverUrl: null,
  category: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-08-25T10:00:00Z'),
  staff: staff(),
  ...over,
});

function setup(overrides?: {
  staffRow?: ReturnType<typeof staff> | null;
  rows?: ReturnType<typeof row>[];
  existing?: ReturnType<typeof row> | null;
  deliveredSessions?: number;
  /** The category `serviceCategory.findFirst` answers with (null = none). */
  category?: { id: string; name: string; _count?: { services: number } } | null;
}) {
  const serviceFindMany = vi.fn<(args: Args) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.rows ?? []),
  );
  const serviceCount = vi.fn<(args: Args) => Promise<number>>(() =>
    Promise.resolve(overrides?.rows?.length ?? 0),
  );
  const serviceGroupBy = vi.fn(() => Promise.resolve([]));
  const serviceFindFirst = vi.fn<(args: Args) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.existing === undefined ? row() : overrides.existing),
  );
  const serviceCreate = vi.fn<(args: Args) => Promise<unknown>>((args) =>
    Promise.resolve(row({ ...(args.data as object) })),
  );
  const serviceUpdate = vi.fn<(args: Args) => Promise<unknown>>((args) =>
    Promise.resolve(row({ ...(args.data as object) })),
  );
  const serviceDelete = vi.fn(() => Promise.resolve({ id: 's-1' }));
  const sessionCount = vi.fn(() => Promise.resolve(overrides?.deliveredSessions ?? 0));
  const memberFindFirst = vi.fn<(args: Args) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.staffRow === undefined ? staff() : overrides.staffRow),
  );
  const memberFindMany = vi.fn<(args: Args) => Promise<unknown[]>>(() =>
    Promise.resolve([staff(), staff({ id: 'gm-2', role: 'RECEPTIONIST', trainerProfile: null })]),
  );

  const categoryFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.category === undefined ? null : overrides.category),
  );
  const categoryFindMany = vi.fn(() => Promise.resolve([]));
  const categoryCount = vi.fn(() => Promise.resolve(0));
  const categoryCreate = vi.fn((args: Args) =>
    Promise.resolve({ id: 'cat-1', ...(args.data as object) }),
  );
  const categoryDelete = vi.fn(() => Promise.resolve({ id: 'cat-1' }));

  const client = {
    serviceCategory: {
      findFirst: categoryFindFirst,
      findMany: categoryFindMany,
      count: categoryCount,
      create: categoryCreate,
      delete: categoryDelete,
    },
    service: {
      findMany: serviceFindMany,
      count: serviceCount,
      groupBy: serviceGroupBy,
      findFirst: serviceFindFirst,
      create: serviceCreate,
      update: serviceUpdate,
      delete: serviceDelete,
    },
    serviceSession: { count: sessionCount, deleteMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    gymMember: { findFirst: memberFindFirst, findMany: memberFindMany },
  };
  Object.assign(client, { $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)) });
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const locale = {
    get: vi.fn(() => Promise.resolve({ currency: 'GEL', language: 'en' })),
  } as unknown as GymLocaleService;

  return {
    service: new AdminServicesService(prisma, tenant, locale),
    serviceCreate,
    serviceUpdate,
    serviceDelete,
    serviceFindMany,
    memberFindFirst,
    categoryFindFirst,
    categoryCreate,
    categoryDelete,
  };
}

describe('personalTrainingName', () => {
  it('prefixes the trainer name in the gym language, with a plain hyphen', () => {
    expect(personalTrainingName('Nino Beridze', 'en')).toBe('Personal session - Nino Beridze');
    expect(personalTrainingName('ნინო ბერიძე', 'ka')).toBe('პერსონალური სესია - ნინო ბერიძე');
    expect(personalTrainingName('Nino Beridze', 'ka')).not.toMatch(/[—–]/);
  });
});

describe('AdminServicesService.createService', () => {
  afterEach(() => vi.clearAllMocks());

  it('names a PT service after its trainer and stamps the gym currency', async () => {
    const { service, serviceCreate } = setup();

    const created = await service.createService({
      type: 'PERSONAL_TRAINING',
      coverUrl: null,
      staffId: 'gm-1',
      priceMinor: 5000,
      durationMinutes: 60,
      description: '',
      categoryId: null,
    });

    expect(serviceCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      gymId: 'gym-1',
      type: 'PERSONAL_TRAINING',
      name: 'Personal session - Nino Beridze',
      staffId: 'gm-1',
      currency: 'GEL',
      categoryId: null,
    });
    expect(created.staff).toEqual({
      id: 'gm-1',
      name: 'Nino Beridze',
      photoUrl: 'https://cdn/nino.jpg',
      isTrainer: true,
    });
  });

  it("files a service under one of the gym's categories, and refuses one it does not have", async () => {
    const { service, serviceCreate } = setup({ category: { id: 'cat-1', name: 'Boxing' } });
    const input = {
      type: 'PERSONAL_TRAINING' as const,
      coverUrl: null,
      staffId: 'gm-1',
      priceMinor: 5000,
      durationMinutes: 60,
      description: '',
      categoryId: 'cat-1',
    };

    await service.createService(input);
    expect(serviceCreate.mock.calls[0]?.[0]?.data).toMatchObject({ categoryId: 'cat-1' });

    const { service: other } = setup({ category: null });
    await expect(other.createService(input)).rejects.toMatchObject({
      constructor: UnprocessableEntityException,
      response: { code: 'SERVICE_CATEGORY_INVALID' },
    });
  });

  it('refuses a PT service whose staff member is not a trainer', async () => {
    const { service } = setup({ staffRow: staff({ role: 'RECEPTIONIST', trainerProfile: null }) });

    await expect(
      service.createService({
        type: 'PERSONAL_TRAINING',
        staffId: 'gm-2',
        priceMinor: 5000,
        durationMinutes: 60,
        description: '',
        categoryId: null,
        coverUrl: null,
      }),
    ).rejects.toMatchObject({
      constructor: UnprocessableEntityException,
      response: { code: 'SERVICE_STAFF_NOT_TRAINER' },
    });
  });

  it('refuses a staff id that is not staff in this gym', async () => {
    const { service } = setup({ staffRow: null });

    await expect(
      service.createService({
        type: 'CUSTOM',
        name: 'Massage',
        coverUrl: null,
        staffId: 'gm-9',
        priceMinor: 8000,
        durationMinutes: 45,
        description: '',
        categoryId: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_STAFF_INVALID' } });
  });

  it('stores a custom service with its own name', async () => {
    const { service, serviceCreate } = setup({
      staffRow: staff({ role: 'RECEPTIONIST', trainerProfile: null }),
    });

    await service.createService({
      type: 'CUSTOM',
      name: 'Massage',
      coverUrl: null,
      staffId: 'gm-2',
      priceMinor: 8000,
      durationMinutes: 45,
      description: 'Full body',
      categoryId: null,
    });

    expect(serviceCreate.mock.calls[0]?.[0]?.data).toMatchObject({ name: 'Massage' });
  });

  it('stores a cover on a PT service', async () => {
    const { service, serviceCreate } = setup();

    await service.createService({
      type: 'PERSONAL_TRAINING',
      staffId: 'gm-1',
      priceMinor: 5000,
      durationMinutes: 60,
      description: '',
      categoryId: null,
      coverUrl: 'https://cdn/gym-1/services/pt.jpg',
    });

    expect(serviceCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      coverUrl: 'https://cdn/gym-1/services/pt.jpg',
    });
  });
});

describe('AdminServicesService.updateService', () => {
  afterEach(() => vi.clearAllMocks());

  it('regenerates a PT name when the trainer changes and ignores a sent name', async () => {
    const { service, serviceUpdate } = setup({
      staffRow: staff({
        id: 'gm-3',
        firstName: null,
        lastName: null,
        user: { name: 'Giorgi K' },
      }),
    });

    await service.updateService('s-1', { staffId: 'gm-3', name: 'Ignored' });

    expect(serviceUpdate.mock.calls[0]?.[0]?.data).toMatchObject({
      staffId: 'gm-3',
      name: 'Personal session - Giorgi K',
    });
  });

  it('404s an unknown service', async () => {
    const { service } = setup({ existing: null });
    await expect(service.updateService('nope', { priceMinor: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes the cover', async () => {
    const { service, serviceUpdate } = setup();

    await service.updateService('s-1', { coverUrl: null });

    expect(serviceUpdate.mock.calls[0]?.[0]?.data).toMatchObject({ coverUrl: null });
  });

  it('moves a service between categories, and takes it out of one', async () => {
    const { service, serviceUpdate } = setup({ category: { id: 'cat-2', name: 'Pilates' } });

    await service.updateService('s-1', { categoryId: 'cat-2' });
    expect(serviceUpdate.mock.calls[0]?.[0]?.data).toMatchObject({ categoryId: 'cat-2' });

    await service.updateService('s-1', { categoryId: null });
    expect(serviceUpdate.mock.calls[1]?.[0]?.data).toMatchObject({ categoryId: null });
  });
});

describe('AdminServicesService categories', () => {
  afterEach(() => vi.clearAllMocks());

  it('creates a category on the gym and refuses a duplicate name, whatever its case', async () => {
    const { service, categoryCreate } = setup({ category: null });
    const created = await service.createCategory({ name: 'Boxing' });
    expect(categoryCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      gymId: 'gym-1',
      name: 'Boxing',
    });
    expect(created).toEqual({ id: 'cat-1', name: 'Boxing', serviceCount: 0 });

    const { service: taken } = setup({ category: { id: 'cat-1', name: 'boxing' } });
    await expect(taken.createCategory({ name: 'Boxing' })).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'SERVICE_CATEGORY_EXISTS' },
    });
  });

  it('deletes an unused category and keeps one that still files services', async () => {
    const { service, categoryDelete } = setup({
      category: { id: 'cat-1', name: 'Boxing', _count: { services: 0 } },
    });
    await service.deleteCategory('cat-1');
    expect(categoryDelete).toHaveBeenCalledWith({ where: { id: 'cat-1' }, select: { id: true } });

    const { service: used, categoryDelete: usedDelete } = setup({
      category: { id: 'cat-1', name: 'Boxing', _count: { services: 3 } },
    });
    await expect(used.deleteCategory('cat-1')).rejects.toMatchObject({
      response: { code: 'SERVICE_CATEGORY_IN_USE' },
    });
    expect(usedDelete).not.toHaveBeenCalled();

    const { service: missing } = setup({ category: null });
    await expect(missing.deleteCategory('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminServicesService.listServices', () => {
  it('filters by status and type and pages', async () => {
    const { service, serviceFindMany } = setup({ rows: [row()] });

    const result = await service.listServices({
      page: 2,
      limit: 10,
      status: 'ACTIVE',
      type: 'PERSONAL_TRAINING',
      sort: 'price',
      dir: 'desc',
    });

    expect(serviceFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: 'ACTIVE', type: 'PERSONAL_TRAINING' },
      orderBy: { priceMinor: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(result.page).toBe(2);
    expect(result.data[0]?.createdAt).toBe('2026-08-25T10:00:00.000Z');
  });
});

describe('AdminServicesService.listStaffOptions', () => {
  it('lists non-member staff with an isTrainer flag', async () => {
    const { service } = setup();
    const { data } = await service.listStaffOptions();
    expect(data).toEqual([
      {
        id: 'gm-1',
        name: 'Nino Beridze',
        role: 'TRAINER',
        photoUrl: 'https://cdn/nino.jpg',
        isTrainer: true,
      },
      { id: 'gm-2', name: 'Nino Beridze', role: 'RECEPTIONIST', photoUrl: null, isTrainer: false },
    ]);
  });
});

describe('AdminServicesService.deleteService', () => {
  afterEach(() => vi.clearAllMocks());

  it('deletes an archived service that was never booked, along with its open slots', async () => {
    const { service, serviceDelete } = setup({ existing: row({ status: 'ARCHIVED' }) });
    await service.deleteService('s-1');
    expect(serviceDelete).toHaveBeenCalledWith({ where: { id: 's-1' }, select: { id: true } });
  });

  it('refuses an active service', async () => {
    const { service, serviceDelete } = setup();
    await expect(service.deleteService('s-1')).rejects.toMatchObject({
      response: { code: 'SERVICE_NOT_ARCHIVED' },
    });
    expect(serviceDelete).not.toHaveBeenCalled();
  });

  it('refuses a service with booked or completed sessions', async () => {
    const { service, serviceDelete } = setup({
      existing: row({ status: 'ARCHIVED' }),
      deliveredSessions: 2,
    });
    await expect(service.deleteService('s-1')).rejects.toMatchObject({
      response: { code: 'SERVICE_HAS_SESSIONS' },
    });
    expect(serviceDelete).not.toHaveBeenCalled();
  });
});
