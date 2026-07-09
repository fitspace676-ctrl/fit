import { Module } from '@nestjs/common';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';

/**
 * Staff-console reception (check-in) management ("/admin/check-ins", T4.12).
 *
 * Records member arrivals at the front desk and serves the Reception screen's live
 * feed + KPI snapshot + per-member eligibility. Every route sits behind the
 * app-wide `TenantGuard` + global `PermissionsGuard`; the tenant client, guards,
 * and tenant context come from `TenantModule` / `RbacModule`.
 *
 * Imports {@link LoyaltyModule} for its exported {@link LoyaltyPointsService} so a
 * recorded arrival awards loyalty points (T12.10) fire-and-forget.
 */
@Module({
  imports: [LoyaltyModule],
  controllers: [CheckInController],
  providers: [CheckInService],
})
export class CheckInModule {}
