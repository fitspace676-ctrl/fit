import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Headers,
  ForbiddenException,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  isGymWideReport,
  Permission,
  reportExportQuerySchema,
  reportKeySchema,
  reportQuerySchema,
  reportWindowSlug,
  type ReportCatalogResponse,
  type ReportKey,
  type ReportResult,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { requestAccessOf } from '../common/rbac/request-access';
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
   *
   * Takes NO `locationId`, deliberately. The catalogue is the list of reports this
   * gym offers, not any report's data: which reports exist does not change with the
   * branch on screen, and accepting a parameter that changed nothing would invite a
   * later contributor to make it hide the reports that cannot be filtered. Whether
   * a card is shown in single-branch mode is the console's call (Stage 1 hides
   * `revenue-by-location` there); the catalogue itself stays the same list.
   *
   * What it DOES depend on is who is asking. A caller whose role is restricted to
   * its assigned branches never gets the gym-wide reports (`GYM_WIDE_REPORT_KEYS`)
   * — see {@link assertReportInScope} — so they are dropped from the list too,
   * `?all=true` included: the settings form saves the stored toggles, not this
   * list, so a hidden toggle keeps its value.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async catalog(
    @Req() req: Request,
    @Headers('accept-language') acceptLanguage?: string,
    @Query('all') all?: string,
  ): Promise<ReportCatalogResponse> {
    // `?all=true` is the settings screen asking for the reports it has hidden too.
    const catalog = await this.reports.catalog(parseAcceptLanguage(acceptLanguage), {
      includeHidden: all === 'true',
    });
    if (seesWholeGym(req)) {
      return catalog;
    }
    return {
      ...catalog,
      reports: catalog.reports.filter((report) => !isGymWideReport(report.key)),
    };
  }

  /**
   * `GET /admin/reports/:report/export?range=&format=&locationId=` — download one
   * report as a CSV (streamed page-free, small aggregate) or XLSX attachment.
   * Declared before the `:report` preview route so the literal `export` segment is
   * never captured as a report key. An unknown report or a bad `range`/`format` is
   * a `400`.
   *
   * `locationId` is parsed from the SAME schema shape as the preview and handed to
   * the service unchanged, so the file covers exactly the branch that was on screen.
   * A download that quietly widened to every branch would be worse than no filter:
   * the reader has no way to tell which of the two figures is the real one.
   *
   * The gym's `reports` setting (Settings → Reports) is a DISPLAY preference for
   * the catalogue only — it deliberately does NOT gate this route. A report the
   * gym has switched off still exports here for anyone holding
   * {@link Permission.ReportExport}, because a bookmarked download link and a
   * scheduled export are both expected to keep working after a gym tidies its
   * hub. Do not add a settings check to this handler.
   *
   * A gym-wide report is a `403` for a branch-restricted caller — {@link assertReportInScope}.
   */
  @Get(':report/export')
  @RequirePermissions(Permission.ReportExport)
  async export(
    @Param('report') report: string,
    @Query() query: unknown,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<void> {
    // The console forwards the language its reader is using; a bare API call
    // (a script, a scheduled export) gets the gym's own.
    const lang = parseAcceptLanguage(acceptLanguage);
    const key = parse(reportKeySchema, report);
    assertReportInScope(key, req);
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
   * `GET /admin/reports/:report?range=&locationId=` — run one report for on-screen
   * preview, returning its columns and computed rows. `range` defaults to `30d`; an
   * unknown report key or an invalid range is a `400`.
   *
   * `locationId` narrows the report to one branch; omitted, it is the gym-wide
   * roll-up. It is passed straight through — which reports can honestly answer
   * "which branch" is the service's decision, recorded per report there, and the
   * ones that cannot ignore it rather than return an empty table. An EMPTY
   * `locationId=` is a `400` rather than a silent "all branches": the console
   * normalises its own "all" sentinel to an absent param, so an empty string
   * reaching here is a bug worth surfacing.
   *
   * The gym's `reports` setting (Settings → Reports) is a DISPLAY preference for
   * the catalogue only — it deliberately does NOT gate this route. A report the
   * gym has switched off still previews here for anyone holding
   * {@link Permission.ReportView}, because a bookmarked preview link is expected
   * to keep working after a gym tidies its hub. Do not add a settings check to
   * this handler.
   *
   * A gym-wide report is a `403` for a branch-restricted caller — {@link assertReportInScope}.
   */
  @Get(':report')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async run(
    @Param('report') report: string,
    @Query() query: unknown,
    @Req() req: Request,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<ReportResult> {
    const key = parse(reportKeySchema, report);
    assertReportInScope(key, req);
    return this.reports.runReport(
      key,
      parse(reportQuerySchema, query),
      parseAcceptLanguage(acceptLanguage),
    );
  }
}

/**
 * Whether the caller's role reaches the whole gym (`branchScope: 'all'`).
 *
 * Read from the answer `PermissionsGuard` resolved for this request. No recorded
 * answer is NOT gym-wide: it fails closed, like every other scope decision.
 */
function seesWholeGym(req: Request): boolean {
  return requestAccessOf(req)?.branchScope === 'all';
}

/**
 * Refuse a gym-wide report to a branch-restricted caller.
 *
 * The guard's clamp cannot do this on its own: it forces a branch onto the query,
 * and a `GYM_WIDE_REPORT_KEYS` report ignores the branch by construction — so the
 * clamped request would still answer with every branch's rows. Such a person has no
 * gym-wide view, for the same reason "All locations" is not a choice they are
 * offered, so the report is theirs to see only when its data can be narrowed.
 */
function assertReportInScope(key: ReportKey, req: Request): void {
  if (isGymWideReport(key) && !seesWholeGym(req)) {
    throw new ForbiddenException({
      message: 'This report covers the whole gym and your access is limited to your branches',
      code: 'BRANCH_FORBIDDEN',
    });
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
