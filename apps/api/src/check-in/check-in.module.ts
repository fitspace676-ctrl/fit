import { Module } from '@nestjs/common';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';

/**
 * Staff-console reception (check-in) management ("/admin/check-ins", T4.12).
 *
 * Records member arrivals at the front desk and serves the Reception screen's live
 * feed + KPI snapshot + per-member eligibility. Every route sits behind the
 * app-wide `TenantGuard` + global `PermissionsGuard`; the tenant client, guards,
 * and tenant context come from `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [CheckInController],
  providers: [CheckInService],
})
export class CheckInModule {}
