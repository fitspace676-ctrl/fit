import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import {
  Permission,
  dashboardOverviewQuerySchema,
  dashboardSalesQuerySchema,
  type DashboardOverviewResponse,
  type DashboardSalesResponse,
  type DashboardStatsResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { DashboardSalesService } from './dashboard-sales.service';
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
  constructor(
    private readonly dashboard: DashboardService,
    // NOT `sales` — the handler below is already called `sales`, and a class
    // cannot carry a property and a method under the same name.
    private readonly salesTab: DashboardSalesService,
  ) {}

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

  /**
   * `GET /dashboard/overview?range=&period=&from=&to=` — the FormaCore control-room
   * overview: the live occupancy card, the period-bounded revenue / check-ins /
   * new-member / classes KPIs (`period` = `today` default / `week` / `month` /
   * `custom` with `from`/`to`), a range-windowed revenue series (`7d` default,
   * `30d`, `12w`), the live plan mix, today's class schedule, real-event alerts, and
   * the recent-check-ins feed. All scoped to the caller's own gym; the query is
   * re-validated by the same Zod schema.
   */
  @Get('overview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async overview(@Query() query: unknown): Promise<DashboardOverviewResponse> {
    return this.dashboard.getOverview(dashboardOverviewQuerySchema.parse(query));
  }

  /**
   * `GET /dashboard/sales?granularity=&productType=` — the hand-built Sales tab in
   * one payload: four KPIs, the revenue trend, the sales-vs-refunds trend, the
   * payment-method breakdown and the ranked top sellers.
   *
   * Both params scope the WHOLE response, which is why the tab is one round trip
   * rather than one per card: a partial refresh could leave two cards describing
   * different windows. `granularity` (`daily` default / `weekly` / `monthly`)
   * picks the window and its bucket as one value; `productType` (`all` default /
   * `memberships` / `session-packs` / `retail`) narrows every figure. The Zod
   * schema `.catch`es unknown values to the defaults rather than raising a 400.
   */
  @Get('sales')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async sales(@Query() query: unknown): Promise<DashboardSalesResponse> {
    return this.salesTab.get(dashboardSalesQuerySchema.parse(query));
  }
}
