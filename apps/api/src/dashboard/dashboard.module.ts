import { Module } from '@nestjs/common';
import { GymsModule } from '../gyms/gyms.module';
import { ReportsModule } from '../reports/reports.module';
import { DashboardController } from './dashboard.controller';
import { DashboardClassesService } from './dashboard-classes.service';
import { DashboardMembersService } from './dashboard-members.service';
import { DashboardRevenueService } from './dashboard-revenue.service';
import { DashboardSalesService } from './dashboard-sales.service';
import { DashboardStaffService } from './dashboard-staff.service';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard — the staff console's tenant-scoped control room.
 *
 * {@link DashboardController} (`/dashboard`) serves the overview segment's live
 * snapshot and the five hand-built tabs: Sales (see {@link DashboardSalesService}),
 * Members ({@link DashboardMembersService}), Revenue ({@link DashboardRevenueService}),
 * Classes ({@link DashboardClassesService}) and Staff ({@link DashboardStaffService}).
 *
 * There was also a `DashboardSegmentsController` serving `/admin/dashboard/segments`
 * — a configurable widget grid whose contents a gym picked from a catalogue of
 * Reports drill-down sections. Every segment outgrew that shape, so it and its
 * service have gone. The `DashboardWidget` table survives them, unread, pending a
 * deliberate migration.
 */
@Module({
  imports: [ReportsModule, GymsModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardSalesService,
    DashboardMembersService,
    DashboardRevenueService,
    DashboardClassesService,
    DashboardStaffService,
  ],
})
export class DashboardModule {}
