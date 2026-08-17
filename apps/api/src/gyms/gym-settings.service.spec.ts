import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { gymSettingsStoredSchema, weeklyHoursSchema } from '@fit/types';
import { GymSettingsService } from './gym-settings.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { StorageService } from '../storage/storage.service';
import type { MediaCleanupService } from '../storage/media-cleanup.service';

interface GymRow {
  name: string;
  settings: unknown;
}

interface UpdateArgs {
  where?: { id?: unknown };
  data?: Record<string, unknown>;
}

function setup(overrides?: { gym?: GymRow | null; publicUrl?: string | null }) {
  const findFirst = vi.fn<(args: unknown) => Promise<GymRow | null>>(() =>
    Promise.resolve(
      overrides?.gym === undefined ? { name: 'Iron Gym', settings: null } : overrides.gym,
    ),
  );
  const update = vi.fn<(args: UpdateArgs) => Promise<GymRow>>((args) =>
    Promise.resolve({
      name: (args.data?.name as string) ?? 'Iron Gym',
      settings: args.data?.settings ?? null,
    }),
  );
  const publicUrl = vi.fn<(key: string) => string | null>(() => overrides?.publicUrl ?? null);

  const prisma = { client: { gym: { findFirst, update } } } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const storage = { publicUrl } as unknown as StorageService;

  // Media cleanup is a best-effort side effect; stub it so these tests stay about
  // the service's own writes.
  const media = {
    discardUnreferenced: vi.fn(() => Promise.resolve()),
  } as unknown as MediaCleanupService;
  return {
    service: new GymSettingsService(prisma, tenant, storage, media),
    findFirst,
    update,
    publicUrl,
  };
}

describe('GymSettingsService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('getSettings', () => {
    it('returns a complete, defaulted settings object for a gym with no stored settings', async () => {
      const { service, findFirst } = setup({ gym: { name: 'Iron Gym', settings: null } });

      const result = await service.getSettings();

      expect(findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'gym-1' } });
      // A bare gym parses to the full, defaulted settings blob, with the canonical
      // gym name folded into brand — the schema is the single source of defaults.
      const defaults = gymSettingsStoredSchema.parse({});
      expect(result).toEqual({
        ...defaults,
        brand: { name: 'Iron Gym', ...defaults.brand },
      });
      // Spot-check a few of the deeper policy groups are present + defaulted.
      expect(result.booking).toMatchObject({ cancellationCutoffHours: 0, waitlistMode: 'auto' });
      expect(result.freeze).toMatchObject({ minFreezeDays: 0, maxFreezeDays: 0 });
      expect(result.invoice.prefix).toBe('INV');
    });

    it('folds the canonical gym name into brand.name over any stored value', async () => {
      const { service } = setup({
        gym: { name: 'Canonical Name', settings: { brand: { primaryColor: '#abcdef' } } },
      });

      const result = await service.getSettings();

      expect(result.brand.name).toBe('Canonical Name');
      expect(result.brand.primaryColor).toBe('#abcdef');
    });

    it('throws 404 GYM_NOT_FOUND when the session gym no longer exists', async () => {
      const { service } = setup({ gym: null });

      await expect(service.getSettings()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateSettings', () => {
    it('merges a partial locale patch onto the stored settings', async () => {
      const { service, update } = setup({
        gym: { name: 'Iron Gym', settings: { locale: { currency: 'USD' } } },
      });

      const result = await service.updateSettings({ locale: { timezone: 'Asia/Tbilisi' } });

      const stored = (update.mock.calls[0]?.[0]?.data?.settings ?? {}) as {
        locale: { currency: string; timezone: string };
      };
      // The previously-stored currency survives; only the timezone changes.
      expect(stored.locale).toMatchObject({ currency: 'USD', timezone: 'Asia/Tbilisi' });
      expect(result.locale.currency).toBe('USD');
    });

    it('routes brand.name to Gym.name (not the settings JSON) and keeps it as the single source of truth', async () => {
      const { service, update } = setup({ gym: { name: 'Old Name', settings: null } });

      const result = await service.updateSettings({ brand: { name: 'New Name' } });

      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data.name).toBe('New Name');
      const stored = data.settings as { brand: Record<string, unknown> };
      expect(stored.brand).not.toHaveProperty('name');
      expect(result.brand.name).toBe('New Name');
    });

    it('merges a partial booking-policy patch onto the stored settings', async () => {
      const { service, update } = setup({ gym: { name: 'Iron Gym', settings: null } });

      const result = await service.updateSettings({ booking: { cancellationCutoffHours: 12 } });

      const stored = update.mock.calls[0]?.[0]?.data?.settings as {
        booking: { cancellationCutoffHours: number };
      };
      expect(stored.booking.cancellationCutoffHours).toBe(12);
      expect(result.booking.cancellationCutoffHours).toBe(12);
    });

    it('replaces the whole week when hours are supplied', async () => {
      const { service, update } = setup({ gym: { name: 'Iron Gym', settings: null } });
      const hours = weeklyHoursSchema.parse({ sun: { closed: true } });

      await service.updateSettings({ hours });

      const stored = update.mock.calls[0]?.[0]?.data?.settings as { hours: typeof hours };
      expect(stored.hours.sun.closed).toBe(true);
    });

    it('refuses to switch off the last payment method the till has left', async () => {
      const { service, update } = setup({
        gym: {
          name: 'Iron Gym',
          settings: { payments: { acceptCash: false, acceptPrepaidCredits: false } },
        },
      });

      // Read alone the patch is unremarkable; merged onto the stored settings it
      // leaves a till that accepts nothing, which is what makes it a 400.
      await expect(
        service.updateSettings({ payments: { acceptCard: false } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('allows switching one off while another still stands', async () => {
      const { service, update } = setup({ gym: { name: 'Iron Gym', settings: null } });

      const result = await service.updateSettings({ payments: { acceptCard: false } });

      expect(update).toHaveBeenCalled();
      expect(result.payments).toEqual({
        acceptCash: true,
        acceptCard: false,
        acceptPrepaidCredits: true,
      });
    });

    // `PREFIX-0000` is the one shape that prints no year, so a year-shaped prefix
    // would render `2026-1000` — exactly what the year-numbered shape produces, and
    // invoice numbers are unique per gym.
    it('refuses a four-digit prefix on the year-less invoice shape', async () => {
      const { service, update } = setup({
        gym: { name: 'Iron Gym', settings: { invoice: { format: 'prefix-number' } } },
      });

      await expect(service.updateSettings({ invoice: { prefix: '2026' } })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('allows a year-shaped prefix on the shapes that also print the year', async () => {
      const { service, update } = setup({ gym: { name: 'Iron Gym', settings: null } });

      const result = await service.updateSettings({ invoice: { prefix: '2026' } });

      expect(update).toHaveBeenCalled();
      expect(result.invoice).toMatchObject({ prefix: '2026', format: 'prefix-year-number' });
    });

    it('throws 404 when the gym is missing', async () => {
      const { service, update } = setup({ gym: null });

      await expect(service.updateSettings({ locale: { currency: 'EUR' } })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('setLogo', () => {
    it('stores the public URL of a key under the gym prefix and echoes it back', async () => {
      const { service, update, publicUrl } = setup({
        gym: { name: 'Iron Gym', settings: null },
        publicUrl: 'https://cdn.example.com/gym-1/logos/abc.png',
      });

      const result = await service.setLogo({ photoKey: 'gym-1/logos/abc.png' });

      expect(publicUrl).toHaveBeenCalledWith('gym-1/logos/abc.png');
      expect(result).toEqual({ logoUrl: 'https://cdn.example.com/gym-1/logos/abc.png' });
      const stored = update.mock.calls[0]?.[0]?.data?.settings as { brand: { logoUrl: string } };
      expect(stored.brand.logoUrl).toBe('https://cdn.example.com/gym-1/logos/abc.png');
    });

    it('rejects a key that belongs to another tenant with a 400, without touching storage or the gym', async () => {
      const { service, update, publicUrl } = setup({ publicUrl: 'https://cdn/x' });

      await expect(service.setLogo({ photoKey: 'other-gym/logos/abc.png' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(publicUrl).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('throws 503 when no public URL is configured (R2 disabled)', async () => {
      const { service, update } = setup({ publicUrl: null });

      await expect(service.setLogo({ photoKey: 'gym-1/logos/abc.png' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
