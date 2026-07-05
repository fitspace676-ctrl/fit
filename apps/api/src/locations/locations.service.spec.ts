import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationStatus } from '@fit/db';
import { LocationsService } from './locations.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A location row as the public projection selects it. */
interface LocationRecord {
  id: string;
  name: string;
  address: string;
  photoUrl: string | null;
  amenities: string[];
  hours: unknown;
}

interface FindManyArgs {
  where?: { gymId?: string; status?: LocationStatus };
  orderBy?: unknown;
  select?: unknown;
}

const row = (over?: Partial<LocationRecord>): LocationRecord => ({
  id: 'l-1',
  name: 'Main Floor',
  address: '12 Rustaveli Ave',
  photoUrl: 'https://cdn.example.com/main.jpg',
  amenities: ['Showers', 'Parking'],
  hours: { mon: '06:00–23:00', sun: 'Closed' },
  ...over,
});

function setup(rows: LocationRecord[] = []) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<LocationRecord[]>>(() =>
    Promise.resolve(rows),
  );
  const prisma = { client: { location: { findMany } } } as unknown as PrismaService;
  return { service: new LocationsService(prisma), findMany };
}

describe('LocationsService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listLocations', () => {
    it('scopes the query to the gym and only ACTIVE locations, ordered by name', async () => {
      const { service, findMany } = setup();

      const result = await service.listLocations({ gymId: 'gym-1' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { gymId: 'gym-1', status: LocationStatus.ACTIVE },
          orderBy: { name: 'asc' },
        }),
      );
      expect(result).toEqual({ locations: [] });
    });

    it('projects a row to the public summary', async () => {
      const { service } = setup([row()]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations).toEqual([
        {
          id: 'l-1',
          name: 'Main Floor',
          address: '12 Rustaveli Ave',
          photoUrl: 'https://cdn.example.com/main.jpg',
          amenities: ['Showers', 'Parking'],
          hours: { mon: '06:00–23:00', sun: 'Closed' },
        },
      ]);
    });

    it('maps a branch with no photo to a null photoUrl', async () => {
      const { service } = setup([row({ photoUrl: null })]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.photoUrl).toBeNull();
    });

    it('normalises a missing/empty hours JSON to an empty map', async () => {
      const { service } = setup([row({ hours: {} })]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({});
    });

    it('drops non-string hours values so a richer stored shape can never break the wire', async () => {
      const { service } = setup([
        row({ hours: { mon: '06:00–23:00', tue: { open: '06:00' }, wed: null } }),
      ]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({ mon: '06:00–23:00' });
    });
  });
});
