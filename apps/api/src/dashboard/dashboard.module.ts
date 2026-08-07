import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { DashboardController } from './dashboard.controller';
import { DashboardClassesService } from './dashboard-classes.service';
import { DashboardStaffService } from './dashboard-staff.service';
import { DashboardMembersService } from './dashboard-members.service';
import { DashboardRevenueService } from './dashboard-revenue.service';
import { DashboardSalesService } from './dashboard-sales.service';
import { DashboardSegmentsController } from './dashboard-segments.controller';
import { DashboardSegmentsService } from './dashboard-segments.service';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard — the staff console's tenant-scoped control room.
 *
 * {@link DashboardController} (`/dashboard`) serves the overview segment's live
 * snapshot and the five hand-built tabs — Sales (`/dashboard/sales`, see
 * {@link DashboardSalesService}), Members (`/dashboard/members`, see
 * {@link DashboardMembersService}), Revenue (`/dashboard/revenue`, see
 * {@link DashboardRevenueService}) and Classes (`/dashboard/classes`, see
 * {@link DashboardClassesService}) and Staff (`/dashboard/staff`, see
 * {@link DashboardStaffService}); {@link DashboardSegmentsController}
 * (`/admin/dashboard/segments`) serves the configurable segments, resolving each
 * gym's chosen widgets against the drill-down reports in {@link ReportsModule}.
 */
@Module({
  imports: [ReportsModule],
  controllers: [DashboardController, DashboardSegmentsController],
  providers: [
    DashboardService,
    DashboardSegmentsService,
    DashboardSalesService,
    DashboardMembersService,
    DashboardRevenueService,
    DashboardClassesService,
    DashboardStaffService,
  ],
})
export class DashboardModule {}
