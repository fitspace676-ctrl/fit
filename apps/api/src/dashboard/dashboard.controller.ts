import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import {
  Permission,
  dashboardClassesQuerySchema,
  dashboardStaffQuerySchema,
  dashboardMembersQuerySchema,
  dashboardOverviewQuerySchema,
  dashboardRevenueQuerySchema,
  dashboardSalesQuerySchema,
  type DashboardClassesResponse,
  type DashboardStaffResponse,
  type DashboardMembersResponse,
  type DashboardOverviewResponse,
  type DashboardRevenueResponse,
  type DashboardSalesResponse,
  type DashboardStatsResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { DashboardClassesService } from './dashboard-classes.service';
import { DashboardStaffService } from './dashboard-staff.service';
import { DashboardMembersService } from './dashboard-members.service';
import { DashboardRevenueService } from './dashboard-revenue.service';
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
    // NOT `sales` / `members` — each handler below already owns that name, and a
    // class cannot carry a property and a method under the same one.
    private readonly salesTab: DashboardSalesService,
    private readonly membersTab: DashboardMembersService,
    private readonly revenueTab: DashboardRevenueService,
    private readonly classesTab: DashboardClassesService,
    private readonly staffTab: DashboardStaffService,
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
   * `GET /dashboard/overview?range=&period=&from=&to=&locationId=` — the FormaCore control-room
   * overview: the live occupancy card, the period-bounded revenue / check-ins /
   * new-member / classes KPIs (`period` = `today` default / `week` / `month` /
   * `custom` with `from`/`to`), a range-windowed revenue series (`7d` default,
   * `30d`, `12w`), the live plan mix, today's class schedule, real-event alerts, and
   * the recent-check-ins feed. All scoped to the caller's own gym; the query is
   * re-validated by the same Zod schema.
   *
   * `locationId` narrows **every** section of this response to one branch: the
   * revenue KPIs and series, the member counts and recent joiners, the plan mix, the
   * subscription counts, the class count, today's schedule, the alert feed and —
   * since Stage 3 gave `CheckIn` a real location FK and a write path — the occupancy
   * card, `kpis.checkInsToday` and the recent-arrivals feed. Occupancy narrows whole:
   * with a branch selected the donut's count, its capacity and its single `areas`
   * entry are all that branch. See {@link DashboardService.getOverview} for the
   * per-section table and the attribution rule each section follows. Nothing on this
   * endpoint stays gym-wide, so the console's Overview branch caveat is retired.
   * An unknown id degrades to all branches, never a 400.
   */
  @Get('overview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async overview(@Query() query: unknown): Promise<DashboardOverviewResponse> {
    return this.dashboard.getOverview(dashboardOverviewQuerySchema.parse(query));
  }

  /**
   * `GET /dashboard/sales?granularity=&productType=&locationId=` — the hand-built Sales tab in
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

  /**
   * `GET /dashboard/members?granularity=&retentionWindow=&expiringWindow=&locationId=` — the
   * hand-built Members tab in one payload: four KPIs, the active-members trend,
   * signups against churn, the rolling retention rate and the billing-state split.
   *
   * All three params scope the WHOLE response, which is why the tab is one round
   * trip: a partial refresh could leave two cards describing different windows.
   * `expiringWindow` is echoed but unused until the watch-lists land; it is in the
   * query now so its shape does not change under them. `locationId` narrows EVERY
   * figure on this tab, including `avgLtv` on both sides of its division: Stage 2
   * gave members a home branch, and every figure here counts members or the
   * subscriptions belonging to them — see {@link DashboardMembersService}. The Zod
   * schema `.catch`es unknown values to the defaults rather than raising a 400.
   */
  @Get('members')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async members(@Query() query: unknown): Promise<DashboardMembersResponse> {
    return this.membersTab.get(dashboardMembersQuerySchema.parse(query));
  }

  /**
   * `GET /dashboard/revenue?granularity=&projectionWindow=&locationId=` — the hand-built
   * Revenue tab in one payload: four KPIs, the two-stream revenue trend, the MRR
   * trend, the projection, the outstanding-invoice snapshot and the location
   * breakdown.
   *
   * Both params scope the WHOLE response, which is why the tab is one round trip:
   * a partial refresh could leave two cards describing different windows.
   *
   * `locationId` narrows every figure here, under TWO attributions the caller
   * should know apart: takings and the location breakdown follow the ORDER's
   * branch (the till that rang the sale up), while the recurring stream, MRR, the
   * projection and the outstanding snapshot follow the MEMBER's home branch. Both
   * partition the gym, so `kpis.totalRevenue` — one branch's takings plus its
   * members' recurring — is a real branch figure rather than the composite it was;
   * see {@link DashboardRevenueService} for the full table and the pinned spec. The
   * Zod schema `.catch`es unknown values to the defaults rather than raising a 400.
   */
  @Get('revenue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async revenue(@Query() query: unknown): Promise<DashboardRevenueResponse> {
    return this.revenueTab.get(dashboardRevenueQuerySchema.parse(query));
  }

  /**
   * `GET /dashboard/classes?granularity=&locationId=` — the hand-built Classes tab in one
   * payload: four KPIs, the bookings / attendance / utilization / PT trends, the
   * class-type ranking and the demand heatmap.
   *
   * The granularity scopes the WHOLE response, which is why the tab is one round
   * trip: a partial refresh could leave two cards describing different windows.
   * `locationId` narrows every class and seat figure to one branch; only
   * `ptSessionsOverTime` stays gym-wide, because `PtSession` has no branch until
   * Stage 6. The Zod schema `.catch`es an unknown value to the default rather than
   * raising a 400.
   */
  @Get('classes')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async classes(@Query() query: unknown): Promise<DashboardClassesResponse> {
    return this.classesTab.get(dashboardClassesQuerySchema.parse(query));
  }

  /**
   * `GET /dashboard/staff?granularity=&locationId=` — the hand-built Staff tab in one payload:
   * four KPIs, the delivery trend, per-trainer delivery and utilization, the
   * standing weekly rota, and the counts the tab cannot include.
   *
   * The granularity scopes the WHOLE response, which is why the tab is one round
   * trip. The rota is deliberately unaffected by it: a recurring weekly schedule
   * carries no dates. `locationId` is accepted and STILL applied to nothing, even
   * after Stage 2: trainers, PT sessions and shifts carry no branch, and a staff
   * member's `GymMember.locationId` is a backfill artefact rather than a work
   * assignment, so filtering the one read that could be filtered would yield
   * figures that are neither gym nor branch — see {@link DashboardStaffService}.
   * Stage 6 makes this tab filterable.
   */
  @Get('staff')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async staff(@Query() query: unknown): Promise<DashboardStaffResponse> {
    return this.staffTab.get(dashboardStaffQuerySchema.parse(query));
  }
}
