import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  locationHoursSchema,
  type CreateLocationResponse,
  type GetAdminLocationResponse,
  type ListAdminLocationsResponse,
} from '@fit/types';
import { AdminLocationsController } from './admin-locations.controller';
import type { AdminLocationsService } from './admin-locations.service';

const detail = (over?: Partial<GetAdminLocationResponse>): GetAdminLocationResponse => ({
  id: 'l-1',
  name: 'Downtown Branch',
  address: '12 Rustaveli Ave',
  phone: null,
  photoUrl: null,
  amenities: ['Sauna'],
  status: 'ACTIVE',
  createdAt: '2026-02-01T00:00:00.000Z',
  hours: locationHoursSchema.parse({}),
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...over,
});

function setup() {
  const listLocations = vi.fn<() => Promise<ListAdminLocationsResponse>>(() =>
    Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }),
  );
  const getLocation = vi.fn<() => Promise<GetAdminLocationResponse>>(() =>
    Promise.resolve(detail()),
  );
  const createLocation = vi.fn<() => Promise<CreateLocationResponse>>(() =>
    Promise.resolve(detail()),
  );
  const updateLocation = vi.fn<() => Promise<CreateLocationResponse>>(() =>
    Promise.resolve(detail()),
  );
  const service = {
    listLocations,
    getLocation,
    createLocation,
    updateLocation,
  } as unknown as AdminLocationsService;
  return {
    controller: new AdminLocationsController(service),
    listLocations,
    getLocation,
    createLocation,
    updateLocation,
  };
}

describe('AdminLocationsController', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/locations', () => {
    it('parses + defaults the query and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.list({ search: 'down' });

      expect(ctx.listLocations).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'down', page: 1, limit: 20, sort: 'name', dir: 'asc' }),
      );
    });

    it('rejects a non-numeric page with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.list({ page: 'abc' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listLocations).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/locations', () => {
    it('validates + transforms the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.create({ name: '  Downtown  ', amenities: ['Sauna', 'Sauna'] });

      // Name trimmed, duplicate amenities de-duped, status + hours defaulted.
      expect(ctx.createLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Downtown',
          amenities: ['Sauna'],
          status: 'ACTIVE',
          hours: locationHoursSchema.parse({}),
        }),
      );
    });

    it('rejects a missing name with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.create({ address: 'x' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createLocation).not.toHaveBeenCalled();
    });

    it('rejects an invalid photo URL with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Downtown', photoUrl: 'not-a-url' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createLocation).not.toHaveBeenCalled();
    });

    it('rejects hours whose closing time is before opening time with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Downtown', hours: { mon: { open: '18:00', close: '09:00' } } })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createLocation).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/locations/:id', () => {
    it('validates the body and forwards the id', async () => {
      ctx = setup();
      await ctx.controller.update('l-1', { name: 'Renamed' });

      expect(ctx.updateLocation).toHaveBeenCalledWith(
        'l-1',
        expect.objectContaining({ name: 'Renamed' }),
      );
    });
  });
});
