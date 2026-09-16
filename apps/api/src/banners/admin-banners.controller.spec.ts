import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AdminBannersController } from './admin-banners.controller';
import type { AdminBannersService } from './admin-banners.service';

function setup() {
  const listBanners = vi.fn(() => Promise.resolve({ banners: [] }));
  const getBanner = vi.fn(() => Promise.resolve({ banner: {} }));
  const createBanner = vi.fn(() => Promise.resolve({ banner: {} }));
  const updateBanner = vi.fn(() => Promise.resolve({ banner: {} }));
  const deleteBanner = vi.fn(() => Promise.resolve());
  const setImage = vi.fn(() => Promise.resolve({ banner: {} }));
  const reorderBanners = vi.fn(() => Promise.resolve({ banners: [] }));
  const banners = {
    listBanners,
    getBanner,
    createBanner,
    updateBanner,
    deleteBanner,
    setImage,
    reorderBanners,
  } as unknown as AdminBannersService;
  return {
    controller: new AdminBannersController(banners),
    listBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    setImage,
    reorderBanners,
  };
}

describe('AdminBannersController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('POST /marketing/banners', () => {
    it('parses the body and defaults isActive to true', async () => {
      await ctx.controller.create({ title: 'Summer' });

      expect(ctx.createBanner).toHaveBeenCalledWith({ title: 'Summer', isActive: true });
    });

    it('400s an inverted schedule window without hitting the service', async () => {
      const error = await ctx.controller
        .create({ startsAt: '2026-09-10T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createBanner).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /marketing/banners/:id', () => {
    it('passes the id and the parsed patch through', async () => {
      await ctx.controller.update('banner-1', { isActive: false });

      expect(ctx.updateBanner).toHaveBeenCalledWith('banner-1', { isActive: false });
    });

    it('400s an unparseable patch', async () => {
      const error = await ctx.controller
        .update('banner-1', { sortOrder: -1 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.updateBanner).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /marketing/banners/reorder', () => {
    it('passes the ids through in order', async () => {
      await ctx.controller.reorder({ ids: ['b', 'a'] });

      expect(ctx.reorderBanners).toHaveBeenCalledWith({ ids: ['b', 'a'] });
    });

    it('400s an empty reorder', async () => {
      const error = await ctx.controller.reorder({ ids: [] }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.reorderBanners).not.toHaveBeenCalled();
    });

    it('is declared before the :id patch route, so /reorder is not read as an id', () => {
      // Nest matches in declaration order. If this ever flips, `PATCH
      // /marketing/banners/reorder` starts 404ing as an unknown banner id.
      const methods = Object.getOwnPropertyNames(AdminBannersController.prototype);
      expect(methods.indexOf('reorder')).toBeLessThan(methods.indexOf('update'));
    });
  });

  describe('POST /marketing/banners/:id/image', () => {
    it('passes the photoKey through', async () => {
      await ctx.controller.setImage('banner-1', { photoKey: 'gym-1/banners/a.jpg' });

      expect(ctx.setImage).toHaveBeenCalledWith('banner-1', {
        photoKey: 'gym-1/banners/a.jpg',
      });
    });

    it('400s a missing photoKey', async () => {
      const error = await ctx.controller.setImage('banner-1', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.setImage).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /marketing/banners/:id', () => {
    it('delegates and resolves with no body', async () => {
      await expect(ctx.controller.remove('banner-1')).resolves.toBeUndefined();
      expect(ctx.deleteBanner).toHaveBeenCalledWith('banner-1');
    });
  });
});
