import { Injectable } from '@nestjs/common';
import { gymSettingsStoredSchema, type GymMemberIntakeSettings } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * The gym's member-intake configuration — which fields its Add-Member form asks
 * for, and therefore which ones a create must supply.
 *
 * The console has always read this to decide what to *render*; the API had no way
 * to read it at all, so a create that skipped a field the gym had switched on was
 * accepted without comment. Anything that reaches `POST /members` — the roster
 * drawer, the till, a script, a stale browser tab left open across a settings
 * change — now answers to the same configuration.
 *
 * Deliberately thin, in the mould of {@link GymLocaleService}: one row, one column,
 * one section. A create path should not pay for logo signing and the defaulting of
 * fifteen unrelated settings sections to learn whether a phone number is mandatory.
 */
@Injectable()
export class GymMemberIntakeService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * The caller's intake toggles, fully defaulted.
   *
   * The row is pinned to `tenant.gymId` explicitly. `Gym` is the tenant *root*
   * (keyed by `id`, with no `gymId` scalar), so it sits outside the Prisma tenant
   * extension's scoped-model set — an unqualified `findFirst` would hand back
   * whichever gym Postgres reached first, i.e. another tenant's intake policy
   * deciding what this gym's staff must fill in.
   *
   * Never throws for a missing or malformed blob: a gym that has never opened the
   * settings screen has `settings: null`, and `gymSettingsStoredSchema` fills every
   * default from that. Refusing to create a member because nobody has visited
   * Settings yet would be a worse failure than the one this guards against.
   */
  async get(): Promise<GymMemberIntakeSettings> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { settings: true },
    });
    return gymSettingsStoredSchema.parse(gym?.settings ?? {}).memberIntake;
  }
}
