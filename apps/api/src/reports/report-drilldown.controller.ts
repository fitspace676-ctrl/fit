import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Headers,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  Permission,
  REPORT_METRIC_CATALOG,
  reportDrilldownExportQuerySchema,
  reportDrilldownQuerySchema,
  reportWindowSlug,
  reportMetricSchema,
  type ReportDrilldown,
  type ReportMetricDefinition,
} from '@fit/types';

/** MIME type for a `.xlsx` workbook. */
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReportDrilldownService } from './report-drilldown.service';
import { parseAcceptLanguage } from '../mail/email-locale';

/**
 * Admin-console reports drill-down API (`/admin/reports/drilldown`, T12.12).
 *
 * A read-only, tenant-scoped, chart-oriented view of an operational metric —
 * revenue, members, attendance — each returning headline KPIs plus typed sections
 * (trend series, categorical breakdowns, a split, a heatmap, a detail table) the
 * console renders with the brand Astryx charts. Sits on its own base path (not
 * `admin/reports/:report`) so its `:metric` segment never collides with the CSV/
 * XLSX report catalogue. {@link TenantGuard} pins the gym and {@link PermissionsGuard}
 * gates reads on {@link Permission.ReportView} and exports on
 * {@link Permission.ReportExport} (OWNER / MANAGER), like the
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
   * `GET /admin/reports/drilldown/:metric/export?range=&format=` — download the whole
   * drill-down as a file: a CSV of titled blocks, or an XLSX with the KPI summary
   * and one tab per section.
   *
   * Declared BEFORE the `:metric` preview route so the literal `export` segment is
   * never captured as a metric — the same ordering the catalogue controller needs.
   */
  @Get(':metric/export')
  @RequirePermissions(Permission.ReportExport)
  async export(
    @Param('metric') metric: string,
    @Query() query: unknown,
    @Res() res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<void> {
    // The console forwards the language its reader is using; a bare API call
    // (a script, a scheduled export) gets the gym's own.
    const lang = parseAcceptLanguage(acceptLanguage);
    const parsedMetric = parse(reportMetricSchema, metric);
    const params = parse(reportDrilldownExportQuerySchema, query);
    const filename = `report-${parsedMetric}-${reportWindowSlug(params)}.${params.format}`;

    if (params.format === 'xlsx') {
      const workbook = await this.drilldown.buildDrilldownXlsx(parsedMetric, params, lang);
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(workbook);
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    for await (const chunk of this.drilldown.streamDrilldownCsv(parsedMetric, params, lang)) {
      res.write(chunk);
    }
    res.end();
  }

  /**
   * `GET /admin/reports/drilldown/:metric?range=` — build one drill-down report for
   * on-screen rendering. `range` defaults to `30d`; an unknown metric or invalid
   * range is a `400`.
   */
  @Get(':metric')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async run(
    @Param('metric') metric: string,
    @Query() query: unknown,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<ReportDrilldown> {
    const parsedMetric = parse(reportMetricSchema, metric);
    return this.drilldown.run(
      parsedMetric,
      parse(reportDrilldownQuerySchema, query),
      parseAcceptLanguage(acceptLanguage),
    );
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
