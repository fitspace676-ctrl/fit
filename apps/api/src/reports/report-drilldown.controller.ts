import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  REPORT_METRIC_CATALOG,
  reportDrilldownQuerySchema,
  reportMetricSchema,
  type ReportDrilldown,
  type ReportMetricDefinition,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReportDrilldownService } from './report-drilldown.service';

/**
 * Admin-console reports drill-down API (`/admin/reports/drilldown`, T12.12).
 *
 * A read-only, tenant-scoped, chart-oriented view of an operational metric —
 * revenue, members, attendance — each returning headline KPIs plus typed sections
 * (trend series, categorical breakdowns, a split, a heatmap, a detail table) the
 * console renders with the brand Astryx charts. Sits on its own base path (not
 * `admin/reports/:report`) so its `:metric` segment never collides with the CSV/
 * XLSX report catalogue. {@link TenantGuard} pins the gym and {@link PermissionsGuard}
 * gates every route on {@link Permission.ReportView} (OWNER / MANAGER), like the
 * rest of the reporting surfaces.
 */
@Controller('admin/reports/drilldown')
@UseGuards(TenantGuard, PermissionsGuard)
export class ReportDrilldownController {
  constructor(private readonly drilldown: ReportDrilldownService) {}

  /**
   * `GET /admin/reports/drilldown` — the drill-down catalogue (each metric's copy
   * and section ids) so the Reports hub can render its cards without hardcoding them.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  catalog(): { metrics: ReportMetricDefinition[] } {
    return { metrics: REPORT_METRIC_CATALOG };
  }

  /**
   * `GET /admin/reports/drilldown/:metric?range=` — build one drill-down report for
   * on-screen rendering. `range` defaults to `30d`; an unknown metric or invalid
   * range is a `400`.
   */
  @Get(':metric')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async run(@Param('metric') metric: string, @Query() query: unknown): Promise<ReportDrilldown> {
    const parsedMetric = parse(reportMetricSchema, metric);
    return this.drilldown.run(parsedMetric, parse(reportDrilldownQuerySchema, query));
  }
}

/** Validate `data` against `schema`, raising a `400` with per-field detail on failure. */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
