import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DEFAULT_MOBILE_APP_FEATURES, Permission } from '@fit/types';
import { MobileAppSettingsService } from './mobile-app-settings.service';
import { MobileAppSettingsController } from './mobile-app-settings.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';

function setup(enabled = true) {
  const findUnique = vi
    .fn()
    .mockResolvedValue({ mobileAppEnabled: enabled, mobileAppFeatures: { shop: false } });
  const update = vi.fn().mockResolvedValue({});
  const service = new MobileAppSettingsService(
    { client: { gym: { findUnique, update } } } as unknown as PrismaService,
    { gymId: 'gym-a' } as TenantContext,
  );
  return { service, findUnique, update, controller: new MobileAppSettingsController(service) };
}
describe('mobile app settings isolation', () => {
  it('reads only the session tenant and defaults legacy feature fields', async () => {
    const ctx = setup();
    const result = await ctx.service.get();
    expect(ctx.findUnique).toHaveBeenCalledWith({
      where: { id: 'gym-a' },
      select: { mobileAppEnabled: true, mobileAppFeatures: true },
    });
    expect(result.features).toEqual({ ...DEFAULT_MOBILE_APP_FEATURES, shop: false });
  });
  it('writes only to the session tenant, without altering provisioning or other settings', async () => {
    const ctx = setup();
    const features = { ...DEFAULT_MOBILE_APP_FEATURES, qr: false };
    expect(await ctx.controller.update({ features })).toEqual({ enabled: true, features });
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
    });
    expect(ctx.findUnique).toHaveBeenCalledWith({
      where: { slug: 'downtown', status: 'ACTIVE' },
      select: { mobileAppEnabled: true, mobileAppFeatures: true },
    });
    ctx.findUnique.mockResolvedValue(null);
    await expect(ctx.service.bySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(() => ctx.controller.bySlug('bad/slug')).toThrow(NotFoundException);
  });
  it('requires GymManage on both staff endpoints', () => {
    for (const method of ['get', 'update'] as const) {
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, MobileAppSettingsController.prototype[method]),
      ).toEqual([Permission.GymManage]);
    }
  });
});
