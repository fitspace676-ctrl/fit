import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@fit/db';
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
  name: 'Personal training — Nino Beridze',
  priceMinor: 5000,
  currency: 'GEL',
  durationMinutes: 60,
  description: '',
  schedule: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-08-25T10:00:00Z'),
  staff: staff(),
  ...over,
});

function setup(overrides?: {
  staffRow?: ReturnType<typeof staff> | null;
  rows?: ReturnType<typeof row>[];
  existing?: ReturnType<typeof row> | null;
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
  const memberFindFirst = vi.fn<(args: Args) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.staffRow === undefined ? staff() : overrides.staffRow),
  );
  const memberFindMany = vi.fn<(args: Args) => Promise<unknown[]>>(() =>
    Promise.resolve([staff(), staff({ id: 'gm-2', role: 'RECEPTIONIST', trainerProfile: null })]),
  );

  const client = {
    service: {
      findMany: serviceFindMany,
      count: serviceCount,
      groupBy: serviceGroupBy,
      findFirst: serviceFindFirst,
      create: serviceCreate,
      update: serviceUpdate,
    },
    gymMember: { findFirst: memberFindFirst, findMany: memberFindMany },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const locale = {
    get: vi.fn(() => Promise.resolve({ currency: 'GEL' })),
  } as unknown as GymLocaleService;

  return {
    service: new AdminServicesService(prisma, tenant, locale),
    serviceCreate,
    serviceUpdate,
    serviceFindMany,
    memberFindFirst,
  };
}

describe('personalTrainingName', () => {
  it('prefixes the trainer name', () => {
    expect(personalTrainingName('Nino Beridze')).toBe('Personal training — Nino Beridze');
  });
});

describe('AdminServicesService.createService', () => {
  afterEach(() => vi.clearAllMocks());

  it('names a PT service after its trainer and stamps the gym currency', async () => {
    const { service, serviceCreate } = setup();

    const created = await service.createService({
      type: 'PERSONAL_TRAINING',
      staffId: 'gm-1',
      priceMinor: 5000,
      durationMinutes: 60,
      description: '',
    });

    expect(serviceCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      gymId: 'gym-1',
      type: 'PERSONAL_TRAINING',
      name: 'Personal training — Nino Beridze',
      staffId: 'gm-1',
      currency: 'GEL',
      schedule: Prisma.JsonNull,
    });
    expect(created.staff).toEqual({
      id: 'gm-1',
      name: 'Nino Beridze',
      photoUrl: 'https://cdn/nino.jpg',
      isTrainer: true,
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
        staffId: 'gm-9',
        priceMinor: 8000,
        durationMinutes: 45,
        description: '',
        schedule: {
          freq: 'DAILY',
          weekdays: [],
          startDate: '2026-09-01',
          startTime: '10:00',
          until: null,
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_STAFF_INVALID' } });
  });

  it('stores a custom service with its own name and schedule', async () => {
    const { service, serviceCreate } = setup({
      staffRow: staff({ role: 'RECEPTIONIST', trainerProfile: null }),
    });
    const schedule = {
      freq: 'WEEKLY' as const,
      weekdays: ['MO' as const],
      startDate: '2026-09-01',
      startTime: '10:00',
      until: null,
    };

    await service.createService({
      type: 'CUSTOM',
      name: 'Massage',
      staffId: 'gm-2',
      priceMinor: 8000,
      durationMinutes: 45,
      description: 'Full body',
      schedule,
    });

    expect(serviceCreate.mock.calls[0]?.[0]?.data).toMatchObject({ name: 'Massage', schedule });
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
      name: 'Personal training — Giorgi K',
    });
  });

  it('404s an unknown service', async () => {
    const { service } = setup({ existing: null });
    await expect(service.updateService('nope', { priceMinor: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
