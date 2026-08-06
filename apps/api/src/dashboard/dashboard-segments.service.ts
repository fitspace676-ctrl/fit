import { BadRequestException, Injectable } from '@nestjs/common';
import {
  findDashboardWidget,
  widgetsForSegment,
  type ConfigurableDashboardSegment,
  type DashboardRange,
  type DashboardSegmentResponse,
  type DashboardWidgetDefinition,
  type ReportDrilldown,
  type ReportMetric,
  type ResolvedDashboardWidget,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { ReportDrilldownService } from '../reports/report-drilldown.service';

/**
 * The segmented dashboard's widget layer.
 *
 * A segment's widgets are the gym's stored selection, or — when it has stored
 * none — the catalogue default, so a fresh gym gets a useful dashboard without a
 * seeding step. Each selected widget names a section of a drill-down report;
 * this service computes each DISTINCT referenced report once and picks the
 * sections out of the results, so a segment spanning two reports costs two
 * computations rather than one per widget.
 *
 * {@link DashboardWidget} is deliberately *not* in the tenant Prisma extension's
 * scoped-model set, so every query here pins `gymId` from {@link TenantContext}
 * by hand.
 */
@Injectable()
export class DashboardSegmentsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly drilldown: ReportDrilldownService,
  ) {}

  /** One segment's widgets, resolved to their live sections over `range`. */
  async get(
    segment: ConfigurableDashboardSegment,
    range: DashboardRange,
  ): Promise<DashboardSegmentResponse> {
    const definitions = await this.selection(segment);
    if (definitions.length === 0) {
      return { segment, range, currency: await this.drilldown.currency(), widgets: [] };
    }

    // Compute each referenced report once, then pick sections out of the results.
    const metrics = [...new Set(definitions.map((definition) => definition.source.metric))];
    const reports = new Map<ReportMetric, ReportDrilldown>();
    await Promise.all(
      metrics.map(async (metric) => {
        reports.set(metric, await this.drilldown.run(metric, { range }));
      }),
    );

    const widgets: ResolvedDashboardWidget[] = [];
    for (const definition of definitions) {
      const report = reports.get(definition.source.metric);
      if (!report) {
        continue;
      }
      const section = report.sections.find(
        (candidate) => candidate.id === definition.source.section,
      );
      // A section the report no longer emits is dropped, not rendered broken.
      if (!section) {
        continue;
      }
      widgets.push({ key: definition.key, size: definition.size, section });
    }

    const currency = reports.values().next().value?.currency ?? (await this.drilldown.currency());
    return { segment, range, currency, widgets };
  }

  /**
   * Replace a segment's widget selection wholesale, in display order. Whole-slice
   * replacement (rather than add/remove deltas) makes the picker's apply
   * idempotent and removes any reorder race.
   *
   * Every key is validated against the catalogue BEFORE anything is written, so a
   * bad payload can never leave a half-applied layout. Duplicates are rejected
   * here rather than left to trip the unique index as a 500.
   */
  async setWidgets(segment: ConfigurableDashboardSegment, widgetKeys: string[]): Promise<void> {
    const seen = new Set<string>();
    for (const key of widgetKeys) {
      const definition = findDashboardWidget(key);
      if (!definition || definition.segment !== segment) {
        throw new BadRequestException(`Not a ${segment} widget: ${key}`);
      }
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicated widget: ${key}`);
      }
      seen.add(key);
    }

    const gymId = this.tenant.gymId;
    await this.prisma.client.$transaction(async (tx) => {
      await tx.dashboardWidget.deleteMany({ where: { gymId, segment } });
      await tx.dashboardWidget.createMany({
        data: widgetKeys.map((widgetKey, position) => ({
          gymId,
          segment,
          widgetKey,
          position,
        })),
      });
    });
  }

  /**
   * The gym's chosen widgets for a segment, in stored order. No rows means "never
   * configured", which resolves to the catalogue default. Stored keys the
   * catalogue no longer defines — or that belong to another segment — are dropped.
   */
  private async selection(
    segment: ConfigurableDashboardSegment,
  ): Promise<DashboardWidgetDefinition[]> {
    const rows = await this.prisma.client.dashboardWidget.findMany({
      where: { gymId: this.tenant.gymId, segment },
      orderBy: { position: 'asc' },
      select: { widgetKey: true },
    });
    if (rows.length === 0) {
      return widgetsForSegment(segment);
    }
    return rows
      .map((row) => findDashboardWidget(row.widgetKey))
      .filter(
        (definition): definition is DashboardWidgetDefinition =>
          definition !== undefined && definition.segment === segment,
      );
  }
}
