import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationStatus } from '@fit/db';
import { MIDNIGHT_CLOSE } from '@fit/types';
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

/** One open day in the structured shape `locationHoursSchema` stores. */
const day = (open: string, close: string) => ({ closed: false, open, close });

/** One shut day — the times are still stored, and still ignored. */
const closedDay = () => ({ closed: true, open: '09:00', close: '17:00' });

/**
 * A real structured week as the admin write path (and the seed's Rustaveli
 * branch) stores it: a weekday run closing at {@link MIDNIGHT_CLOSE}, a shorter
 * Saturday, and a shut Sunday.
 */
const structuredWeek = {
  mon: day('06:00', MIDNIGHT_CLOSE),
  tue: day('06:00', MIDNIGHT_CLOSE),
  wed: day('06:00', MIDNIGHT_CLOSE),
  thu: day('06:00', MIDNIGHT_CLOSE),
  fri: day('06:00', MIDNIGHT_CLOSE),
  sat: day('08:00', '22:00'),
  sun: closedDay(),
};

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

    it('projects the structured admin hours shape into display strings', async () => {
      const { service } = setup([row({ hours: structuredWeek })]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({
        mon: '06:00–24:00',
        tue: '06:00–24:00',
        wed: '06:00–24:00',
        thu: '06:00–24:00',
        fri: '06:00–24:00',
        sat: '08:00–22:00',
        sun: 'Closed',
      });
    });

    it('renders a closed day as the Closed label rather than dropping it', async () => {
      const { service } = setup([row({ hours: { mon: day('09:00', '17:00'), sun: closedDay() } })]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({ mon: '09:00–17:00', sun: 'Closed' });
    });

    it('renders a midnight close as the end of the day, not 00:00', async () => {
      const { service } = setup([row({ hours: { mon: day('06:00', MIDNIGHT_CLOSE) } })]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({ mon: '06:00–24:00' });
    });

    it('omits a day missing from the stored hours rather than inventing one', async () => {
      const { service } = setup([row({ hours: { mon: day('06:00', '23:00') } })]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({ mon: '06:00–23:00' });
    });

    it('emits the week Monday-first whatever order jsonb hands the keys back in', async () => {
      // Postgres `jsonb` does not preserve key order — same-length keys come back
      // bytewise, i.e. fri, mon, sat, sun, thu, tue, wed.
      const { service } = setup([
        row({
          hours: {
            fri: day('06:00', '22:00'),
            mon: day('06:00', '22:00'),
            sat: closedDay(),
            sun: closedDay(),
            thu: day('06:00', '22:00'),
            tue: day('06:00', '22:00'),
            wed: day('06:00', '22:00'),
          },
        }),
      ]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(Object.keys(locations[0]?.hours ?? {})).toEqual([
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
        'sat',
        'sun',
      ]);
    });

    it('passes a legacy flat display string through untouched', async () => {
      const { service } = setup([
        row({ hours: { mon: '06:00–23:00', monday: 'All day', sun: closedDay() } }),
      ]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({
        mon: '06:00–23:00',
        sun: 'Closed',
        monday: 'All day',
      });
    });

    it('drops a day whose stored times are incomplete or malformed', async () => {
      const { service } = setup([
        row({
          hours: {
            mon: { closed: false, open: '06:00' },
            tue: { closed: false, open: '25:00', close: '26:00' },
            wed: { closed: false, open: '18:00', close: '09:00' },
            thu: {},
            fri: day('06:00', '23:00'),
          },
        }),
      ]);

      const { locations } = await service.listLocations({ gymId: 'gym-1' });

      expect(locations[0]?.hours).toEqual({ fri: '06:00–23:00' });
    });
  });
});
