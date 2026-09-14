import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LocationStatus, Prisma } from '@fit/db';
import {
  LOCATION_IS_DEFAULT_CODE,
  LOCATION_NOT_ACTIVE_CODE,
  locationHoursSchema,
  type CreateLocationData,
  type ListAdminLocationsQuery,
  type LocationHours,
  type UpdateLocationData,
} from '@fit/types';
import { AdminLocationsService } from './admin-locations.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { MediaCleanupService } from '../storage/media-cleanup.service';

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
  isDefault: boolean;
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
  isDefault: false,
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

  // Media cleanup is a best-effort side effect; stub it so these tests stay about
  // the service's own writes.
  const media = {
    discardUnreferenced: vi.fn(() => Promise.resolve()),
  } as unknown as MediaCleanupService;

  return {
    service: new AdminLocationsService(prisma, tenant, media),
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
            isDefault: false,
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
        isDefault: false,
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

    it('refuses to deactivate the active default branch with 409 LOCATION_IS_DEFAULT', async () => {
      const { service, update } = setup({ findFirst: row({ isDefault: true }) });

      const error = await service.deactivateLocation('l-1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: LOCATION_IS_DEFAULT_CODE,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('still reactivates the default branch', async () => {
      const { service, update } = setup({
        findFirst: row({ isDefault: true, status: LocationStatus.INACTIVE }),
      });

      await service.reactivateLocation('l-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ status: LocationStatus.ACTIVE });
    });
  });

  describe('makeDefaultLocation', () => {
    interface StoredLocation {
      id: string;
      gymId: string;
      status: LocationStatus;
      isDefault: boolean;
    }
    interface ScopedWhere {
      id?: string;
      gymId?: string;
      isDefault?: boolean;
    }

    /**
     * Two gyms' branches in one table, behind a client that honours the `where`
     * it is given — so a query that forgot to name its gym would visibly reach
     * the other one. The partial unique index is modelled too: a statement that
     * leaves a gym with two defaults throws the P2002 Postgres would.
     */
    function twoGyms(tenantGymId = 'gym-1') {
      const rows: StoredLocation[] = [
        { id: 'a-old', gymId: 'gym-1', status: LocationStatus.ACTIVE, isDefault: true },
        { id: 'a-new', gymId: 'gym-1', status: LocationStatus.ACTIVE, isDefault: false },
        { id: 'a-off', gymId: 'gym-1', status: LocationStatus.INACTIVE, isDefault: false },
        { id: 'b-main', gymId: 'gym-2', status: LocationStatus.ACTIVE, isDefault: true },
        { id: 'b-side', gymId: 'gym-2', status: LocationStatus.ACTIVE, isDefault: false },
      ];
      const matches = (location: StoredLocation, where: ScopedWhere) =>
        (where.id === undefined || location.id === where.id) &&
        (where.gymId === undefined || location.gymId === where.gymId) &&
        (where.isDefault === undefined || location.isDefault === where.isDefault);
      const writes: string[] = [];

      const tx = {
        location: {
          findFirst: vi.fn(({ where }: { where: ScopedWhere }) =>
            Promise.resolve(rows.find((location) => matches(location, where)) ?? null),
          ),
          updateMany: vi.fn(
            ({ where, data }: { where: ScopedWhere; data: { isDefault: boolean } }) => {
              const hit = rows.filter((location) => matches(location, where));
              for (const location of hit) {
                location.isDefault = data.isDefault;
                writes.push(`${location.id}=${String(data.isDefault)}`);
              }
              const gyms = new Set(rows.map((location) => location.gymId));
              for (const gym of gyms) {
                if (rows.filter((l) => l.gymId === gym && l.isDefault).length > 1) {
                  throw new Prisma.PrismaClientKnownRequestError('unique', {
                    code: 'P2002',
                    clientVersion: 'test',
                  });
                }
              }
              return Promise.resolve({ count: hit.length });
            },
          ),
        },
      };
      const client = {
        $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
        location: {
          // The detail re-read after the write.
          findFirst: vi.fn(({ where }: { where: ScopedWhere }) => {
            const found = rows.find((location) => matches(location, where));
            return Promise.resolve(
              found
                ? row({ id: found.id, status: found.status, isDefault: found.isDefault })
                : null,
            );
          }),
        },
      };
      const prisma = { client } as unknown as TenantPrismaService;
      const tenant = { gymId: tenantGymId } as unknown as TenantContext;
      const media = {} as unknown as MediaCleanupService;
      return { service: new AdminLocationsService(prisma, tenant, media), rows, writes, tx };
    }

    const defaultsOf = (rows: StoredLocation[]) =>
      rows.filter((location) => location.isDefault).map((location) => location.id);

    it('moves the flag, clearing the old default before setting the new one', async () => {
      const { service, rows, writes } = twoGyms();

      const result = await service.makeDefaultLocation('a-new');

      expect(result).toMatchObject({ id: 'a-new', isDefault: true });
      expect(writes).toEqual(['a-old=false', 'a-new=true']);
      expect(defaultsOf(rows)).toEqual(['a-new', 'b-main']);
    });

    it("names the caller's gym in every where, leaving the other gym's default alone", async () => {
      const { service, rows, tx } = twoGyms();

      await service.makeDefaultLocation('a-new');

      for (const [args] of tx.location.updateMany.mock.calls) {
        expect(args.where.gymId).toBe('gym-1');
      }
      expect(tx.location.findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ gymId: 'gym-1' });
      expect(rows.find((location) => location.id === 'b-main')?.isDefault).toBe(true);
    });

    it("is a 404 for another gym's branch, and writes nothing in either gym", async () => {
      const { service, rows, tx } = twoGyms('gym-1');

      const error = await service.makeDefaultLocation('b-side').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(tx.location.updateMany).not.toHaveBeenCalled();
      expect(defaultsOf(rows)).toEqual(['a-old', 'b-main']);
    });

    it('works the same from the other gym', async () => {
      const { service, rows } = twoGyms('gym-2');

      await service.makeDefaultLocation('b-side');
      const foreign = await service.makeDefaultLocation('a-new').catch((e: unknown) => e);

      expect(foreign).toBeInstanceOf(NotFoundException);
      expect(defaultsOf(rows)).toEqual(['a-old', 'b-side']);
    });

    it('refuses an inactive branch with 409 LOCATION_NOT_ACTIVE', async () => {
      const { service, rows, tx } = twoGyms();

      const error = await service.makeDefaultLocation('a-off').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: LOCATION_NOT_ACTIVE_CODE,
      });
      expect(tx.location.updateMany).not.toHaveBeenCalled();
      expect(defaultsOf(rows)).toEqual(['a-old', 'b-main']);
    });

    it('is a no-op on the branch that already is the default', async () => {
      const { service, tx } = twoGyms();

      const result = await service.makeDefaultLocation('a-old');

      expect(result.isDefault).toBe(true);
      expect(tx.location.updateMany).not.toHaveBeenCalled();
    });

    it('turns a concurrent move that trips the unique index into a 409', async () => {
      const { service, rows, tx } = twoGyms();
      // Another operator's transaction committed a different default between
      // this one's clear and its set.
      tx.location.updateMany.mockImplementationOnce(() => {
        const other = rows.find((location) => location.id === 'a-old');
        if (other) other.isDefault = false;
        const racer = rows.find((location) => location.id === 'a-off');
        if (racer) racer.isDefault = true;
        return Promise.resolve({ count: 1 });
      });

      const error = await service.makeDefaultLocation('a-new').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'LOCATION_DEFAULT_CONFLICT',
      });
    });
  });
});
