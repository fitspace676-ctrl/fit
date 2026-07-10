import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportDeliveryService } from './report-delivery.service';
import { ReportDrilldownController } from './report-drilldown.controller';
import { ReportDrilldownService } from './report-drilldown.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports — the admin console's tenant-scoped operational reports (T4.8) plus the
 * scheduled digest delivery (T4.10).
 *
 * {@link ReportsController} (`/admin/reports`) sits behind the `TenantGuard` +
 * global `PermissionsGuard`. {@link ReportsService} computes every report from real
 * rows on the tenant-scoped `TenantPrismaService` (from the global `PrismaModule`)
 * and serialises them to CSV / XLSX. {@link ReportDeliveryService} runs the cron
 * that emails those same reports to each gym's owners/managers, reusing
 * {@link ReportsService} for the math and the {@link AuthModule}'s `EmailService`
 * for delivery (Prisma + Redis come from their global modules).
 */
@Module({
  imports: [AuthModule],
  controllers: [ReportsController, ReportDrilldownController],
  providers: [ReportsService, ReportDeliveryService, ReportDrilldownService],
  exports: [ReportDrilldownService],
})
export class ReportsModule {}
