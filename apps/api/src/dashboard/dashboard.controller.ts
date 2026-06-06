import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Permission, type DashboardStatsResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { DashboardService } from './dashboard.service';

/**
 * Staff-console dashboard KPIs API (`/dashboard`, T4.10).
 *
 * A read-only, tenant-scoped snapshot of the gym's headline counts. {@link TenantGuard}
 * pins the request to one gym and {@link PermissionsGuard} gates on
 * {@link Permission.ReportView} (held by `OWNER` / `MANAGER`), so a lower-privileged
 * staff member never sees the figures. The service scopes every count to the caller's
 * gym via the tenant Prisma extension, so no handler passes or trusts a `gymId`.
 */
@Controller('dashboard')
@UseGuards(TenantGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * `GET /dashboard/stats` — one live snapshot of the gym's KPI counts (members,
   * trainers, locations, products; active vs. total each). Takes no query: it is
   * always the caller's own gym.
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async stats(): Promise<DashboardStatsResponse> {
    return this.dashboard.getStats();
  }
}
