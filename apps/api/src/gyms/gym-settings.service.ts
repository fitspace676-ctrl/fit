import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@fit/db';
import {
  enabledPaymentMethods,
  gymSettingsStoredSchema,
  type GetGymSettingsResponse,
  type GymSettings,
  type GymSettingsStored,
  type UpdateGymSettingsInput,
  type UpdateGymSettingsResponse,
  type UploadGymLogoInput,
  type UploadGymLogoResponse,
} from '@fit/types';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { StorageService } from '../storage/storage.service';

/** The columns the settings read/write needs off the gym row. */
const GYM_SELECT = { name: true, settings: true } satisfies Prisma.GymSelect;

/**
 * The staff console's gym-configuration service (T4.8): brand, locale, default
 * business hours, and the gym's operating policies.
 *
 * Settings live in the `Gym.settings` JSON column. `Gym` is the tenant *root*
 * (keyed by `id`, not a `gymId` scalar), so it is intentionally outside the
 * Prisma tenant extension's scoped-models set — every query here therefore pins
 * the row explicitly to the caller's own gym via `tenant.gymId`, which is taken
 * from the verified session, never the request. The gym's display `name` is the
 * one settings field NOT kept in the JSON: it stays on `Gym.name` (the canonical
 * name rosters and the public lookup already read) and is surfaced as
 * `brand.name`, written through whenever `brand.name` is patched — so there is
 * exactly one source of truth for the name.
 */
@Injectable()
export class GymSettingsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: StorageService,
  ) {}

  /** `GET /gyms/settings` — the gym's complete, defaulted settings. */
  async getSettings(): Promise<GetGymSettingsResponse> {
    const gym = await this.loadGym();
    return this.toResponse(gym.name, gym.settings);
  }

  /**
   * `PATCH /gyms/settings` — apply a partial update over the stored settings. Each
   * supplied section is merged field-by-field onto the current value (so omitted
   * fields are untouched); `hours`, when present, replaces the whole week. A
   * supplied `brand.name` writes through to the canonical `Gym.name`. Returns the
   * full, updated settings.
   */
  async updateSettings(input: UpdateGymSettingsInput): Promise<UpdateGymSettingsResponse> {
    const gym = await this.loadGym();
    const current = gymSettingsStoredSchema.parse(gym.settings ?? {});

    // `name` is not stored in the JSON — split it out and route it to Gym.name.
    const { name: brandName, ...brandPatch } = input.brand ?? {};
    const next: GymSettingsStored = {
      brand: { ...current.brand, ...brandPatch },
      business: { ...current.business, ...input.business },
      locale: { ...current.locale, ...input.locale },
      hours: input.hours ?? current.hours,
      booking: { ...current.booking, ...input.booking },
      noShow: { ...current.noShow, ...input.noShow },
      freeze: { ...current.freeze, ...input.freeze },
      guestPass: { ...current.guestPass, ...input.guestPass },
      trial: { ...current.trial, ...input.trial },
      memberIntake: { ...current.memberIntake, ...input.memberIntake },
      staffDirectory: { ...current.staffDirectory, ...input.staffDirectory },
      reports: { ...current.reports, ...input.reports },
      payments: { ...current.payments, ...input.payments },
      invoice: { ...current.invoice, ...input.invoice },
      receipt: { ...current.receipt, ...input.receipt },
    };
    const nextName = brandName ?? gym.name;

    // A till that accepts nothing cannot ring up a sale, so the last enabled
    // settlement method may not be switched off. Checked on the merged result,
    // not the patch: a body turning off the one method still standing is refused
    // even though, read alone, it only ever says "false".
    if (enabledPaymentMethods(next.payments).length === 0) {
      throw new BadRequestException('At least one payment method must stay enabled');
    }

    // `PREFIX-0000` is the one invoice shape that prints no year, so a prefix that
    // *looks* like a year would render `2026-1000` — the exact reference the
    // year-numbered shape produces. Since invoice numbers are unique per gym, a gym
    // that had used both would eventually collide and fail to raise an invoice. The
    // shapes that carry the year are unaffected, so only this pairing is refused.
    if (next.invoice.format === 'prefix-number' && /^\d{4}$/.test(next.invoice.prefix.trim())) {
      throw new BadRequestException(
        'A four-digit prefix reads as a year — pick another prefix, or a format that includes the year',
      );
    }

    await this.prisma.client.gym.update({
      where: { id: this.tenant.gymId },
      data: { name: nextName, settings: next as unknown as Prisma.InputJsonValue },
    });

    return this.toResponse(nextName, next);
  }

  /**
   * `POST /gyms/settings/logo` — finalise a logo upload. The client has already
   * `PUT` the image to R2 via a presigned URL; here we turn its object `photoKey`
   * into a public URL, persist it as the brand's `logoUrl`, and echo it back.
   *
   * The key must live under this gym's own prefix (`{gymId}/…`, the namespace the
   * signed-upload service mints) — a key naming another tenant's object is a
   * `400`, so a logo can never be pointed at a foreign upload. A `503` surfaces
   * when no public base URL is configured (R2 disabled), mirroring the uploader.
   */
  async setLogo(input: UploadGymLogoInput): Promise<UploadGymLogoResponse> {
    const gymId = this.tenant.gymId;
    if (!input.photoKey.startsWith(`${gymId}/`)) {
      throw new BadRequestException('photoKey does not belong to this gym');
    }

    const logoUrl = this.storage.publicUrl(input.photoKey);
    if (!logoUrl) {
      throw new ServiceUnavailableException('Object storage (R2) public URL is not configured');
    }

    const gym = await this.loadGym();
    const current = gymSettingsStoredSchema.parse(gym.settings ?? {});
    const next: GymSettingsStored = { ...current, brand: { ...current.brand, logoUrl } };

    await this.prisma.client.gym.update({
      where: { id: gymId },
      data: { settings: next as unknown as Prisma.InputJsonValue },
    });

    return { logoUrl };
  }

  /** Load the caller's gym row, or `404 GYM_NOT_FOUND` (a deleted/odd session). */
  private async loadGym(): Promise<{ name: string; settings: Prisma.JsonValue | null }> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: GYM_SELECT,
    });
    if (!gym) {
      throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
    }
    return gym;
  }

  /**
   * Project a gym's `name` + raw stored settings to the full {@link GymSettings}
   * response. The safe parse fills every default, so a `null` / legacy /
   * hand-edited value still yields a complete object; `brand.name` is folded in
   * from the canonical gym name.
   */
  private toResponse(name: string, raw: Prisma.JsonValue | null): GymSettings {
    const stored = gymSettingsStoredSchema.parse(raw ?? {});
    return {
      brand: { name, ...stored.brand },
      business: stored.business,
      locale: stored.locale,
      hours: stored.hours,
      booking: stored.booking,
      noShow: stored.noShow,
      freeze: stored.freeze,
      guestPass: stored.guestPass,
      trial: stored.trial,
      memberIntake: stored.memberIntake,
      staffDirectory: stored.staffDirectory,
      reports: stored.reports,
      payments: stored.payments,
      invoice: stored.invoice,
      receipt: stored.receipt,
    };
  }
}
