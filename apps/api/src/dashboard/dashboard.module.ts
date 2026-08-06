import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard — the staff console's tenant-scoped KPI snapshot (T4.10).
 *
 * {@link DashboardController} (`/dashboard`) sits behind the `TenantGuard` + global
 * `PermissionsGuard`. {@link DashboardService} computes the counts on the
 * tenant-scoped `TenantPrismaService` (from the global `PrismaModule`), so this
 * module only registers its own controller + service.
 */
@Module({
  imports: [ReportsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
