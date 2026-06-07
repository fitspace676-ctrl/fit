import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListPackagesResponse } from '@fit/types';
import { PackagesController } from './packages.controller';
import type { PackagesService } from './packages.service';

function setup() {
  const listPackages = vi.fn<() => Promise<ListPackagesResponse>>(() =>
    Promise.resolve({ packages: [] }),
  );
  const packages = { listPackages } as unknown as PackagesService;
  return { controller: new PackagesController(packages), listPackages };
}

describe('PackagesController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /packages', () => {
    it('parses the query and delegates the validated gymId to the service', async () => {
      const result = await ctx.controller.list({ gymId: 'gym-1' });

      expect(ctx.listPackages).toHaveBeenCalledWith({ gymId: 'gym-1' });
      expect(result).toEqual({ packages: [] });
    });

    it('forwards the optional locationId when present', async () => {
      await ctx.controller.list({ gymId: 'gym-1', locationId: 'loc-1' });

      expect(ctx.listPackages).toHaveBeenCalledWith({ gymId: 'gym-1', locationId: 'loc-1' });
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.list({}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listPackages).not.toHaveBeenCalled();
    });

    it('rejects an empty gymId with 400', async () => {
      const error = await ctx.controller.list({ gymId: '' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listPackages).not.toHaveBeenCalled();
    });
  });
});
