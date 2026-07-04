import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports — the admin console's tenant-scoped operational reports (T4.8).
 *
 * {@link ReportsController} (`/admin/reports`) sits behind the `TenantGuard` +
 * global `PermissionsGuard`. {@link ReportsService} computes every report from real
 * rows on the tenant-scoped `TenantPrismaService` (from the global `PrismaModule`)
 * and serialises them to CSV / XLSX, so this module only registers its own
 * controller + service, mirroring {@link AnalyticsModule}.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
