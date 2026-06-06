import { Injectable } from '@nestjs/common';
import { GymMemberStatus, LocationStatus, ProductStatus, Role, TrainerStatus } from '@fit/db';
import type { DashboardStatsResponse } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/**
 * Read side of the staff-console dashboard KPIs (T4.10).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `count` below
 * is auto-constrained to the caller's gym by the Prisma tenant extension, so the
 * snapshot is this-gym-only by construction — there is no `gymId` to pass or to
 * forget. Each entity contributes an `active` (live-state) and a `total`
 * (all-statuses) count; the `MEMBER`-role filter keeps the member figure to the
 * roster (staff are a separate concern, T4.7), mirroring `MembersService`.
 *
 * All eight counts are issued in parallel — they are independent, index-backed
 * `COUNT`s, never a full-table load — so the endpoint is a single round-trip of
 * concurrent queries.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** One live snapshot of the gym's headline counts for the dashboard widgets. */
  async getStats(): Promise<DashboardStatsResponse> {
    const db = this.prisma.client;

    const [
      membersActive,
      membersTotal,
      trainersActive,
      trainersTotal,
      locationsActive,
      locationsTotal,
      productsActive,
      productsTotal,
    ] = await Promise.all([
      db.gymMember.count({ where: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE } }),
      db.gymMember.count({ where: { role: Role.MEMBER } }),
      db.trainer.count({ where: { status: TrainerStatus.ACTIVE } }),
      db.trainer.count(),
      db.location.count({ where: { status: LocationStatus.ACTIVE } }),
      db.location.count(),
      db.product.count({ where: { status: ProductStatus.ACTIVE } }),
      db.product.count(),
    ]);

    return {
      members: { active: membersActive, total: membersTotal },
      trainers: { active: trainersActive, total: trainersTotal },
      locations: { active: locationsActive, total: locationsTotal },
      products: { active: productsActive, total: productsTotal },
    };
  }
}
