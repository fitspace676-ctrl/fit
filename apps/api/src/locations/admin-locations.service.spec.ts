import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { LocationStatus } from '@fit/db';
import {
  locationHoursSchema,
  type CreateLocationData,
  type ListAdminLocationsQuery,
  type LocationHours,
  type UpdateLocationData,
} from '@fit/types';
import { AdminLocationsService } from './admin-locations.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const HOURS: LocationHours = locationHoursSchema.parse({
  mon: { closed: false, open: '06:00', close: '23:00' },
  sun: { closed: true },
});

/** A location row as the service's projection selects it. */
interface LocationRecord {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  photoUrl: string | null;
  amenities: string[];
  hours: unknown;
  status: LocationStatus;
  createdAt: Date;
  updatedAt: Date;
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

const row = (over?: Partial<LocationRecord>): LocationRecord => ({
  id: 'l-1',
  name: 'Downtown Branch',
  address: '12 Rustaveli Ave',
  phone: '+995 32 200 0000',
  photoUrl: null,
  amenities: ['Sauna', 'Parking'],
  hours: HOURS,
  status: LocationStatus.ACTIVE,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
  ...over,
});

function setup(overrides?: {
  findMany?: LocationRecord[];
  count?: number;
  findFirst?: LocationRecord | null;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<LocationRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<LocationRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const create = vi.fn<(args: WhereArgs) => Promise<LocationRecord>>(() => Promise.resolve(row()));
  const update = vi.fn<(args: WhereArgs) => Promise<LocationRecord>>(() => Promise.resolve(row()));

  const client: Record<string, unknown> = {
    location: { findMany, count, findFirst, create, update },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new AdminLocationsService(prisma, tenant),
    findMany,
    count,
    findFirst,
    create,
    update,
  };
}

function query(overrides?: Partial<ListAdminLocationsQuery>): ListAdminLocationsQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreateLocationData>): CreateLocationData => ({
  name: 'Downtown Branch',
  address: '12 Rustaveli Ave',
  phone: '+995 32 200 0000',
  photoUrl: null,
  amenities: ['Sauna'],
  hours: HOURS,
  status: 'ACTIVE',
  ...over,
});

const updateInput = (over?: Partial<UpdateLocationData>): UpdateLocationData => ({
  name: 'Downtown Branch',
  address: '15 Agmashenebeli Ave',
  phone: null,
  photoUrl: 'https://cdn.example.com/l.jpg',
  amenities: ['Sauna', 'Pool'],
  hours: HOURS,
  ...over,
});

describe('AdminLocationsService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listLocations', () => {
    it('projects rows to denormalised AdminLocationRows and echoes pagination totals', async () => {
      const { service } = setup({ findMany: [row()], count: 1 });

      const result = await service.listLocations(query());

      expect(result).toEqual({
        data: [
          {
            id: 'l-1',
            name: 'Downtown Branch',
            address: '12 Rustaveli Ave',
            phone: '+995 32 200 0000',
            photoUrl: null,
            amenities: ['Sauna', 'Parking'],
            hours: HOURS,
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

      await service.listLocations(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listLocations(query({ status: 'INACTIVE' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'INACTIVE' });
    });

    it('builds a case-insensitive name/address search', async () => {
      const { service, findMany } = setup();

      await service.listLocations(query({ search: 'down' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toEqual([
        { name: { contains: 'down', mode: 'insensitive' } },
        { address: { contains: 'down', mode: 'insensitive' } },
      ]);
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listLocations(query({ sort: 'name', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ name: 'desc' });

      await service.listLocations(query({ sort: 'status', dir: 'asc' }));
      expect(findMany.mock.calls[1]?.[0]?.orderBy).toEqual({ status: 'asc' });

      await service.listLocations(query({ sort: 'createdAt', dir: 'desc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('getLocation', () => {
    it('returns the full detail projection with normalised hours', async () => {
      const { service } = setup({ findFirst: row() });

      const result = await service.getLocation('l-1');

      expect(result).toEqual({
        id: 'l-1',
        name: 'Downtown Branch',
        address: '12 Rustaveli Ave',
        phone: '+995 32 200 0000',
        photoUrl: null,
        amenities: ['Sauna', 'Parking'],
        status: 'ACTIVE',
        createdAt: '2026-02-01T00:00:00.000Z',
        hours: HOURS,
        updatedAt: '2026-02-02T00:00:00.000Z',
      });
    });

    it('falls back to a default open week for an empty/malformed stored hours', async () => {
      const { service } = setup({ findFirst: row({ hours: {} }) });

      const result = await service.getLocation('l-1');

      expect(result.hours).toEqual(locationHoursSchema.parse({}));
    });

    it('throws 404 LOCATION_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getLocation('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createLocation', () => {
    it('stamps the tenant gymId and persists the profile fields + hours', async () => {
      const { service, create } = setup();

      await service.createLocation(createInput({ name: 'New Branch', status: 'INACTIVE' }));

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: 'gym-1',
        name: 'New Branch',
        address: '12 Rustaveli Ave',
        status: 'INACTIVE',
        amenities: ['Sauna'],
        hours: HOURS,
      });
    });
  });

  describe('updateLocation', () => {
    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updateLocation('l-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'l-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        name: 'Downtown Branch',
        address: '15 Agmashenebeli Ave',
        photoUrl: 'https://cdn.example.com/l.jpg',
        amenities: ['Sauna', 'Pool'],
        hours: HOURS,
      });
      expect(data).not.toHaveProperty('status');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updateLocation('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateLocation / reactivateLocation', () => {
    it('sets the status to INACTIVE on deactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.deactivateLocation('l-1');

      expect(update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'l-1' },
        data: { status: LocationStatus.INACTIVE },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.reactivateLocation('l-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ status: LocationStatus.ACTIVE });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.deactivateLocation('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
