import { Injectable } from '@nestjs/common';
import {
  DEFAULT_REPORT_DRILLDOWN_RANGE,
  REPORT_METRIC_DEFINITIONS,
  type CreateDashboardPin,
  type DashboardPin,
  type DashboardPinsResponse,
  type DashboardWidgetsResponse,
  type PinnedWidget,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { ReportDrilldownService } from '../reports/report-drilldown.service';

/**
 * "Pin to Dashboard" for drill-down report widgets (T12.12).
 *
 * A pin is per-user and per-gym: it records which section of which drill-down
 * report a staff member wants surfaced on their dashboard. {@link DashboardPin} is
 * deliberately *not* in the tenant Prisma extension's scoped-model set (like
 * {@link CheckIn}), so every query here pins `gymId` **and** `userId` explicitly
 * from {@link TenantContext} — a pin belongs to one person, not the whole gym.
 *
 * Reads come in two shapes: {@link list} returns the bare pins (the reports page
 * toggles its pin controls off them), and {@link widgets} resolves each pin to its
 * LIVE {@link ReportSection} via {@link ReportDrilldownService} for the dashboard to
 * render — recomputed on every request, never cached.
 */
@Injectable()
export class DashboardPinsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly drilldown: ReportDrilldownService,
  ) {}

  /** The caller's pins for the current gym, newest first. */
  async list(): Promise<DashboardPinsResponse> {
    const rows = await this.prisma.client.dashboardPin.findMany({
      where: { gymId: this.tenant.gymId, userId: this.userId() },
      orderBy: { createdAt: 'desc' },
      select: { id: true, metric: true, section: true, createdAt: true },
    });
    return { pins: rows.map((row) => toPin(row)) };
  }

  /**
   * Pin one report section, idempotently — the (gym, user, metric, section) tuple
   * is unique, so re-pinning the same widget returns the existing pin rather than
   * erroring. Unknown metric/section slugs are rejected by the controller's schema
   * + the render step (a widget that can't resolve is simply never shown), so the
   * pin itself is stored verbatim.
   */
  async create(input: CreateDashboardPin): Promise<DashboardPin> {
    const gymId = this.tenant.gymId;
    const userId = this.userId();
    const row = await this.prisma.client.dashboardPin.upsert({
      where: {
        gymId_userId_metric_section: {
          gymId,
          userId,
          metric: input.metric,
          section: input.section,
        },
      },
      create: { gymId, userId, metric: input.metric, section: input.section },
      update: {},
      select: { id: true, metric: true, section: true, createdAt: true },
    });
    return toPin(row);
  }

  /** Remove one of the caller's pins by id. A no-op when it is not theirs. */
  async remove(id: string): Promise<void> {
    await this.prisma.client.dashboardPin.deleteMany({
      where: { id, gymId: this.tenant.gymId, userId: this.userId() },
    });
  }

  /**
   * The caller's pins resolved to live widgets for the dashboard. Each distinct
   * pinned metric's drill-down is computed once (a small map), then every pin picks
   * its section out of it; a pin whose section no longer resolves is dropped so the
   * dashboard only renders widgets it can honestly fill.
   */
  async widgets(): Promise<DashboardWidgetsResponse> {
    const { pins } = await this.list();
    if (pins.length === 0) {
      return { widgets: [] };
    }

    // Compute each referenced metric's drill-down once, at the default window.
    const metrics = [...new Set(pins.map((pin) => pin.metric))];
    const drilldowns = new Map<string, Awaited<ReturnType<ReportDrilldownService['run']>>>();
    await Promise.all(
      metrics.map(async (metric) => {
        const dd = await this.drilldown.run(metric, { range: DEFAULT_REPORT_DRILLDOWN_RANGE });
        drilldowns.set(metric, dd);
      }),
    );

    const widgets: PinnedWidget[] = [];
    for (const pin of pins) {
      const dd = drilldowns.get(pin.metric);
      if (!dd) {
        continue;
      }
      const section = dd.sections.find((candidate) => candidate.id === pin.section);
      if (!section) {
        continue;
      }
      widgets.push({ id: pin.id, metric: pin.metric, currency: dd.currency, section });
    }
    return { widgets };
  }

  /**
   * The authenticated user id for the current request. A `ReportView`-gated staff
   * route always runs authenticated, so this is present; the guard rejects the
   * unauthenticated/subdomain case before the handler.
   */
  private userId(): string {
    const userId = this.tenant.userId;
    if (!userId) {
      // A coding error: a pin route ran without an authenticated session.
      throw new Error('No authenticated user in scope for a dashboard pin');
    }
    return userId;
  }
}

/** Map a stored pin row to its wire shape, validating the metric slug is known. */
function toPin(row: {
  id: string;
  metric: string;
  section: string;
  createdAt: Date;
}): DashboardPin {
  const metric =
    row.metric in REPORT_METRIC_DEFINITIONS ? (row.metric as DashboardPin['metric']) : 'revenue';
  return { id: row.id, metric, section: row.section, pinnedAt: row.createdAt.toISOString() };
}
