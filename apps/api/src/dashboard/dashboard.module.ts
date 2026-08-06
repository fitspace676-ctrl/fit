import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { DashboardController } from './dashboard.controller';
import { DashboardSegmentsController } from './dashboard-segments.controller';
import { DashboardSegmentsService } from './dashboard-segments.service';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard — the staff console's tenant-scoped control room.
 *
 * {@link DashboardController} (`/dashboard`) serves the overview segment's live
 * snapshot; {@link DashboardSegmentsController} (`/admin/dashboard/segments`)
 * serves the configurable segments, resolving each gym's chosen widgets against
 * the drill-down reports in {@link ReportsModule}.
 */
@Module({
  imports: [ReportsModule],
  controllers: [DashboardController, DashboardSegmentsController],
  providers: [DashboardService, DashboardSegmentsService],
})
export class DashboardModule {}
