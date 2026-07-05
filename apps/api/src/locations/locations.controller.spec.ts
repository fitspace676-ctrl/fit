import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListLocationsResponse } from '@fit/types';
import { LocationsController } from './locations.controller';
import type { LocationsService } from './locations.service';

function setup() {
  const listLocations = vi.fn<() => Promise<ListLocationsResponse>>(() =>
    Promise.resolve({ locations: [] }),
  );
  const locations = { listLocations } as unknown as LocationsService;
  return { controller: new LocationsController(locations), listLocations };
}

describe('LocationsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /locations', () => {
    it('parses the query and delegates the validated gymId to the service', async () => {
      const result = await ctx.controller.list({ gymId: 'gym-1' });

      expect(ctx.listLocations).toHaveBeenCalledWith({ gymId: 'gym-1' });
      expect(result).toEqual({ locations: [] });
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.list({}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listLocations).not.toHaveBeenCalled();
    });

    it('rejects an empty gymId with 400', async () => {
      const error = await ctx.controller.list({ gymId: '' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listLocations).not.toHaveBeenCalled();
    });
  });
});
