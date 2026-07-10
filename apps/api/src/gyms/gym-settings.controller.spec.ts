import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { gymSettingsStoredSchema, type GymSettings } from '@fit/types';
import { GymSettingsController } from './gym-settings.controller';
import type { GymSettingsService } from './gym-settings.service';

// The full, defaulted settings blob with the canonical gym name folded into brand
// — the same projection the service returns.
const SETTINGS: GymSettings = (() => {
  const stored = gymSettingsStoredSchema.parse({});
  return { ...stored, brand: { name: 'Iron Gym', ...stored.brand } };
})();

function setup() {
  const getSettings = vi.fn(() => Promise.resolve(SETTINGS));
  const updateSettings = vi.fn(() => Promise.resolve(SETTINGS));
  const setLogo = vi.fn(() => Promise.resolve({ logoUrl: 'https://cdn/gym-1/logos/a.png' }));
  const service = { getSettings, updateSettings, setLogo } as unknown as GymSettingsService;
  return { controller: new GymSettingsController(service), getSettings, updateSettings, setLogo };
}

describe('GymSettingsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /gyms/settings', () => {
    it('delegates to the service', async () => {
      const result = await ctx.controller.get();
      expect(ctx.getSettings).toHaveBeenCalledOnce();
      expect(result).toEqual(SETTINGS);
    });
  });

  describe('PATCH /gyms/settings', () => {
    it('validates the body and delegates the parsed patch', async () => {
      await ctx.controller.update({ locale: { currency: 'USD' } });
      expect(ctx.updateSettings).toHaveBeenCalledWith({ locale: { currency: 'USD' } });
    });

    it('rejects a malformed colour with a 400 without hitting the service', async () => {
      await expect(
        ctx.controller.update({ brand: { primaryColor: 'red' } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.updateSettings).not.toHaveBeenCalled();
    });

    it('rejects an unknown top-level key with a 400', async () => {
      await expect(ctx.controller.update({ nope: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.updateSettings).not.toHaveBeenCalled();
    });

    it('rejects an unknown time zone with a 400', async () => {
      await expect(
        ctx.controller.update({ locale: { timezone: 'Mars/Phobos' } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('POST /gyms/settings/logo', () => {
    it('validates the body and delegates the photoKey', async () => {
      const result = await ctx.controller.setLogo({ photoKey: 'gym-1/logos/a.png' });
      expect(ctx.setLogo).toHaveBeenCalledWith({ photoKey: 'gym-1/logos/a.png' });
      expect(result.logoUrl).toBe('https://cdn/gym-1/logos/a.png');
    });

    it('rejects an empty photoKey with a 400', async () => {
      await expect(ctx.controller.setLogo({ photoKey: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.setLogo).not.toHaveBeenCalled();
    });
  });
});
