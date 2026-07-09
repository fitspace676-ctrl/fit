import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyPointsService } from './loyalty-points.service';
import { LoyaltyService } from './loyalty.service';

/**
 * Loyalty: the staff console's points program (`/loyalty`, T12.10) — program
 * config, rewards catalogue, member balances + ledger, redemptions, and the
 * report aggregations that feed the Loyalty drill-down (T12.13).
 *
 * {@link LoyaltyController} + {@link LoyaltyService} own the tenant-scoped
 * interactive surface (they get the tenant client, `TenantGuard`, and global
 * `PermissionsGuard` from the app-wide `TenantModule` / `RbacModule`).
 *
 * {@link LoyaltyPointsService} is the automatic earn-hook engine; it runs on the
 * cross-tenant `PrismaService` and is **exported** so the check-in, POS, and
 * member-signup flows can inject it and award points fire-and-forget when a
 * member checks in, an order is paid, or a member joins.
 */
@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyPointsService],
  exports: [LoyaltyPointsService],
})
export class LoyaltyModule {}
