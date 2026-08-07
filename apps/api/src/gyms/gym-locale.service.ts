import { Injectable } from '@nestjs/common';
import { gymSettingsStoredSchema, type GymLocale } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/**
 * The gym's locale — its currency and its timezone — read from the gym's own
 * settings rather than inferred from its data.
 *
 * This exists because every reporting surface used to guess. The dashboard took
 * its currency from `payments[payments.length - 1]?.currency` on an UNORDERED
 * `findMany`, so the label on every money figure was whichever row Postgres
 * happened to return last: not the newest, not stable between requests, and
 * simply absent for a gym that has taken no money yet. Meanwhile the gym has
 * carried an explicit `locale.currency` all along.
 *
 * The timezone half is the same story with worse consequences. Every dashboard
 * aggregate bucketed by UTC while `DEFAULT_TIMEZONE` is `Asia/Tbilisi`, so a
 * 19:00 class landed in the 15:00 column of a chart whose title is "when demand
 * lands", and anything between midnight and 04:00 was counted as the day before.
 *
 * Deliberately thin: one row, one column, no logo signing and no defaulting of
 * the fifteen other settings sections {@link GymSettingsService} returns. Callers
 * on the read path want two strings, and paying for the rest on every dashboard
 * load would be its own problem.
 */
@Injectable()
export class GymLocaleService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /**
   * The caller's gym locale, fully defaulted.
   *
   * Never throws for a missing or malformed blob: a gym that has never opened
   * the settings screen has `settings: null`, and `gymSettingsStoredSchema`
   * fills every default from that. A dashboard is the wrong place to discover
   * that nobody has configured the gym yet.
   */
  async get(): Promise<GymLocale> {
    const gym = await this.prisma.client.gym.findFirst({ select: { settings: true } });
    return gymSettingsStoredSchema.parse(gym?.settings ?? {}).locale;
  }
}
