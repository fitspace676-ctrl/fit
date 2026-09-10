import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListPublicBannersResponse } from '@fit/types';
import { BannersController } from './banners.controller';
import type { BannersService } from './banners.service';

function setup() {
  const listBanners = vi.fn<() => Promise<ListPublicBannersResponse>>(() =>
    Promise.resolve({ banners: [] }),
  );
  const banners = { listBanners } as unknown as BannersService;
  return { controller: new BannersController(banners), listBanners };
}

describe('BannersController — GET /banners', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  it('parses the query and delegates the validated gymId to the service', async () => {
    const result = await ctx.controller.list({ gymId: 'gym-1' });

    expect(ctx.listBanners).toHaveBeenCalledWith({ gymId: 'gym-1' });
    expect(result).toEqual({ banners: [] });
  });

  it('rejects a missing gymId with 400 without hitting the service', async () => {
    const error = await ctx.controller.list({}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(ctx.listBanners).not.toHaveBeenCalled();
  });

  it('rejects an empty gymId with 400', async () => {
    const error = await ctx.controller.list({ gymId: '' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(ctx.listBanners).not.toHaveBeenCalled();
  });
});
