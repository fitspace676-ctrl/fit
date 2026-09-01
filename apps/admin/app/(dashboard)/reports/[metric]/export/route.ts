// @fit/admin — drill-down file-export proxy.
//
// The Sales / Members / … drill-down pages offer the same CSV / XLSX downloads the
// catalogue reports do, and for the same reason they cannot link at the API
// directly: the staff session is an httpOnly cookie the browser will not forward
// as a Bearer token. This server route re-checks the reporting capability, calls
// the API's `GET /admin/reports/drilldown/:metric/export` with the token attached,
// and pipes the file body straight back as a download.
//
// Streaming the body through rather than buffering keeps the export memory-flat,
// exactly like the catalogue export proxy beside it.

import { NextResponse } from 'next/server';
import {
  DEFAULT_REPORT_DRILLDOWN_RANGE,
  Permission,
  reportDrilldownQuerySchema,
  reportFormatSchema,
  reportMetricSchema,
  reportWindowSlug,
  roleHasPermission,
  type ReportDrilldownQuery,
} from '@fit/types';
import { fetchReportDrilldownExport } from '@/lib/api';
import { getServerSession } from '@/lib/session';

/** MIME type for a `.xlsx` workbook. */
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Reads the live session cookie + proxies a live stream, so never cache.
export const dynamic = 'force-dynamic';

/** `GET /reports/:metric/export?range=&from=&to=&format=` — stream one drill-down as a file. */
export async function GET(
  req: Request,
  context: { params: Promise<{ metric: string }> },
): Promise<Response> {
  // Defence in depth: the middleware gates the route to staff, but re-assert the
  // report-export capability here since this is its own endpoint. The API re-checks
  // again behind its own guards.
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ReportExport)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { metric: rawMetric } = await context.params;
  const metric = reportMetricSchema.safeParse(rawMetric);
  if (!metric.success) {
    return NextResponse.json({ error: 'Unknown report' }, { status: 400 });
  }

  // Window/format fall back to the API defaults when absent or invalid, so a
  // bare link still yields a valid download rather than a 400.
  const params = new URL(req.url).searchParams;
  const window = reportDrilldownQuerySchema.safeParse({
    range: params.get('range') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  });
  const format = reportFormatSchema.safeParse(params.get('format'));

  const upstream = await fetchReportDrilldownExport(metric.data, {
    window: window.success ? window.data : undefined,
    format: format.success ? format.data : undefined,
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Export failed (${upstream.status})` },
      { status: upstream.status === 0 ? 502 : upstream.status },
    );
  }

  const chosenFormat = format.success ? format.data : 'csv';
  const chosenWindow: ReportDrilldownQuery = window.success
    ? window.data
    : { range: DEFAULT_REPORT_DRILLDOWN_RANGE };
  const filename = `report-${metric.data}-${reportWindowSlug(chosenWindow)}.${chosenFormat}`;

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': chosenFormat === 'xlsx' ? XLSX_CONTENT_TYPE : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
