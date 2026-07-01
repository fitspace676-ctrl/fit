import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics — the admin console's tenant-scoped reporting aggregations.
 *
 * {@link AnalyticsController} (`/admin/analytics`) sits behind the `TenantGuard` +
 * global `PermissionsGuard`. {@link AnalyticsService} computes every KPI / series
 * from real rows on the tenant-scoped `TenantPrismaService` (from the global
 * `PrismaModule`), so this module only registers its own controller + service,
 * mirroring {@link DashboardModule}.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
