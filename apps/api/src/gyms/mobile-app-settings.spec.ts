import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DEFAULT_MOBILE_APP_FEATURES, Permission } from '@fit/types';
import { MobileAppSettingsService } from './mobile-app-settings.service';
import { MobileAppSettingsController } from './mobile-app-settings.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { MediaCleanupService } from '../storage/media-cleanup.service';
import type { StorageService } from '../storage/storage.service';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';

const BASE = 'https://pub-test.r2.dev';
const PORTAL = `${BASE}/gym-a/logos/portal.jpg`;
const SELECT = {
  mobileAppEnabled: true,
  mobileAppFeatures: true,
  mobileAppLoginImageUrl: true,
  settings: true,
};

function setup(enabled = true, own: string | null = null, portal: string | null = null) {
  const findUnique = vi.fn().mockResolvedValue({
    mobileAppEnabled: enabled,
    mobileAppFeatures: { shop: false },
    mobileAppLoginImageUrl: own,
    settings: { memberPortal: { loginImageUrl: portal }, payments: { secret: 'x' } },
  });
  const update = vi.fn().mockResolvedValue({});
  const discardUnreferenced = vi.fn().mockResolvedValue(undefined);
  const service = new MobileAppSettingsService(
    { client: { gym: { findUnique, update } } } as unknown as PrismaService,
    { gymId: 'gym-a' } as TenantContext,
    { publicUrl: (key: string) => `${BASE}/${key}` } as unknown as StorageService,
    { discardUnreferenced } as unknown as MediaCleanupService,
  );
  return {
    service,
    findUnique,
    update,
    discardUnreferenced,
    controller: new MobileAppSettingsController(service),
  };
}
describe('mobile app settings isolation', () => {
  it('reads only the session tenant and defaults legacy feature fields', async () => {
    const ctx = setup();
    const result = await ctx.service.get();
    expect(ctx.findUnique).toHaveBeenCalledWith({
      where: { id: 'gym-a' },
      select: SELECT,
    });
    expect(result.features).toEqual({ ...DEFAULT_MOBILE_APP_FEATURES, shop: false });
  });
  it('writes only to the session tenant, without altering provisioning or other settings', async () => {
    const ctx = setup();
    const features = { ...DEFAULT_MOBILE_APP_FEATURES, qr: false };
    expect(await ctx.controller.update({ features })).toEqual({
      enabled: true,
      features,
      loginImageUrl: null,
      loginImageSource: null,
    });
    expect(ctx.update).toHaveBeenCalledWith({
      where: { id: 'gym-a', mobileAppEnabled: true },
      data: { mobileAppFeatures: features },
    });
  });
  it('rejects cross-tenant ids and attempts to self-provision', () => {
    const ctx = setup();
    for (const extra of [{ gymId: 'gym-b' }, { enabled: true }, { mobileAppEnabled: true }]) {
      expect(() =>
        ctx.controller.update({ features: DEFAULT_MOBILE_APP_FEATURES, ...extra }),
      ).toThrow(BadRequestException);
    }
    expect(ctx.update).not.toHaveBeenCalled();
  });
  it('refuses writes when the gym has no app', async () => {
    const ctx = setup(false);
    await expect(
      ctx.service.update({ features: DEFAULT_MOBILE_APP_FEATURES }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.update).not.toHaveBeenCalled();
  });
  it('exposes only app configuration for an active slug', async () => {
    const ctx = setup();
    expect(await ctx.controller.bySlug('downtown')).toEqual({
      enabled: true,
      features: { ...DEFAULT_MOBILE_APP_FEATURES, shop: false },
      loginImageUrl: null,
      loginImageSource: null,
    });
    expect(ctx.findUnique).toHaveBeenCalledWith({
      where: { slug: 'downtown', status: 'ACTIVE' },
      select: SELECT,
    });
    ctx.findUnique.mockResolvedValue(null);
    await expect(ctx.service.bySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(() => ctx.controller.bySlug('bad/slug')).toThrow(NotFoundException);
  });
  it('falls back to the portal photo, and never exposes the settings blob', async () => {
    const fallback = await setup(true, null, PORTAL).controller.bySlug('downtown');
    expect(fallback).toMatchObject({ loginImageUrl: PORTAL, loginImageSource: 'portal' });
    expect(fallback).not.toHaveProperty('settings');
    const own = `${BASE}/gym-a/logos/app.jpg`;
    expect(await setup(true, own, PORTAL).controller.bySlug('downtown')).toMatchObject({
      loginImageUrl: own,
      loginImageSource: 'app',
    });
    expect(await setup(true).controller.bySlug('downtown')).toMatchObject({
      loginImageUrl: null,
      loginImageSource: null,
    });
    expect(await setup(false, own, PORTAL).controller.bySlug('downtown')).toMatchObject({
      loginImageUrl: null,
      loginImageSource: null,
    });
  });
  it('stores an uploaded photo for the session tenant only and frees the replaced one', async () => {
    const old = `${BASE}/gym-a/logos/old.jpg`;
    const ctx = setup(true, old, PORTAL);
    const result = await ctx.controller.setLoginImage({ photoKey: 'gym-a/logos/new.jpg' });
    expect(result).toMatchObject({
      loginImageUrl: `${BASE}/gym-a/logos/new.jpg`,
      loginImageSource: 'app',
    });
    expect(ctx.update).toHaveBeenCalledWith({
      where: { id: 'gym-a', mobileAppEnabled: true },
      data: { mobileAppLoginImageUrl: `${BASE}/gym-a/logos/new.jpg` },
    });
    expect(ctx.discardUnreferenced).toHaveBeenCalledWith(
      'gym-a',
      [old],
      [`${BASE}/gym-a/logos/new.jpg`],
    );
  });
  it("refuses another gym's key, a bad body and a gym without an app", async () => {
    const ctx = setup();
    await expect(
      ctx.service.setLoginImage({ photoKey: 'gym-b/logos/x.jpg' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(() => ctx.controller.setLoginImage({ photoKey: 'gym-a/x.jpg', gymId: 'gym-b' })).toThrow(
      BadRequestException,
    );
    const noApp = setup(false);
    await expect(
      noApp.service.setLoginImage({ photoKey: 'gym-a/logos/x.jpg' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(noApp.service.clearLoginImage()).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.update).not.toHaveBeenCalled();
    expect(noApp.update).not.toHaveBeenCalled();
  });
  it('clearing the photo falls back to the portal photo', async () => {
    const own = `${BASE}/gym-a/logos/app.jpg`;
    const ctx = setup(true, own, PORTAL);
    expect(await ctx.controller.clearLoginImage()).toMatchObject({
      loginImageUrl: PORTAL,
      loginImageSource: 'portal',
    });
    expect(ctx.update).toHaveBeenCalledWith({
      where: { id: 'gym-a', mobileAppEnabled: true },
      data: { mobileAppLoginImageUrl: null },
    });
    expect(ctx.discardUnreferenced).toHaveBeenCalledWith('gym-a', [own], [null]);
  });
  it('requires GymManage on every staff endpoint', () => {
    for (const method of ['get', 'update', 'setLoginImage', 'clearLoginImage'] as const) {
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, MobileAppSettingsController.prototype[method]),
      ).toEqual([Permission.GymManage]);
    }
  });
});
