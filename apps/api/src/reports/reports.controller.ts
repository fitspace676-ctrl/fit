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
  reportExportQuerySchema,
  reportKeySchema,
  reportQuerySchema,
  reportWindowSlug,
  type ReportCatalogResponse,
  type ReportResult,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReportsService } from './reports.service';
import { parseAcceptLanguage } from '../mail/email-locale';

/** MIME type for a `.xlsx` workbook. */
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Admin-console reports API (`/admin/reports`, T4.8).
 *
 * A read-only, tenant-scoped catalogue of the gym's operational reports powering
 * the Reports screen — each previewable as JSON and downloadable as CSV or XLSX.
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * gates every route on
 * {@link Permission.ReportView} (held by `OWNER` / `MANAGER`), the same reporting
 * capability the analytics screen uses. The service scopes every aggregate to the
 * caller's gym via the tenant Prisma extension, so no handler passes a `gymId`.
 */
@Controller('admin/reports')
@UseGuards(TenantGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * `GET /admin/reports` — the report catalogue (each report's key, copy, and
   * column shape) so the Reports hub can render its cards without hardcoding them.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  catalog(
    @Headers('accept-language') acceptLanguage?: string,
    @Query('all') all?: string,
  ): Promise<ReportCatalogResponse> {
    // `?all=true` is the settings screen asking for the reports it has hidden too.
    return this.reports.catalog(parseAcceptLanguage(acceptLanguage), {
      includeHidden: all === 'true',
    });
  }

  /**
   * `GET /admin/reports/:report/export?range=&format=` — download one report as a
   * CSV (streamed page-free, small aggregate) or XLSX attachment. Declared before
   * the `:report` preview route so the literal `export` segment is never captured
   * as a report key. An unknown report or a bad `range`/`format` is a `400`.
   *
   * The gym's `reports` setting (Settings → Reports) is a DISPLAY preference for
   * the catalogue only — it deliberately does NOT gate this route. A report the
   * gym has switched off still exports here for anyone holding
   * {@link Permission.ReportExport}, because a bookmarked download link and a
   * scheduled export are both expected to keep working after a gym tidies its
   * hub. Do not add a settings check to this handler.
   */
  @Get(':report/export')
  @RequirePermissions(Permission.ReportExport)
  async export(
    @Param('report') report: string,
    @Query() query: unknown,
    @Res() res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<void> {
    // The console forwards the language its reader is using; a bare API call
    // (a script, a scheduled export) gets the gym's own.
    const lang = parseAcceptLanguage(acceptLanguage);
    const key = parse(reportKeySchema, report);
    const params = parse(reportExportQuerySchema, query);
    const filename = `report-${key}-${reportWindowSlug(params)}.${params.format}`;

    if (params.format === 'xlsx') {
      const workbook = await this.reports.buildReportXlsx(key, params, lang);
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(workbook);
      return;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    for await (const chunk of this.reports.streamReportCsv(key, params, lang)) {
      res.write(chunk);
    }
    res.end();
  }

  /**
   * `GET /admin/reports/:report?range=` — run one report for on-screen preview,
   * returning its columns and computed rows. `range` defaults to `30d`; an unknown
   * report key or an invalid range is a `400`.
   *
   * The gym's `reports` setting (Settings → Reports) is a DISPLAY preference for
   * the catalogue only — it deliberately does NOT gate this route. A report the
   * gym has switched off still previews here for anyone holding
   * {@link Permission.ReportView}, because a bookmarked preview link is expected
   * to keep working after a gym tidies its hub. Do not add a settings check to
   * this handler.
   */
  @Get(':report')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async run(
    @Param('report') report: string,
    @Query() query: unknown,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<ReportResult> {
    const key = parse(reportKeySchema, report);
    return this.reports.runReport(
      key,
      parse(reportQuerySchema, query),
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
