// @fit/admin — reports file-export proxy (T4.9).
//
// The Reports screen's "CSV" / "XLSX" download links point here rather than at
// the API directly: the staff session lives in an httpOnly cookie the browser
// can't forward as a Bearer token, so this server route re-checks the reporting
// capability, calls the API's streaming `GET /admin/reports/:report/export` with
// the token attached, and pipes the file body straight back to the browser as a
// download. Streaming the body through (rather than buffering it) keeps the
// export memory-flat, exactly like the orders CSV export proxy (T7.9).

import { NextResponse } from 'next/server';
import {
  Permission,
  reportFormatSchema,
  reportKeySchema,
  reportRangeSchema,
  roleHasPermission,
} from '@fit/types';
import { fetchReportExport } from '@/lib/api';
import { getServerSession } from '@/lib/session';

/** MIME type for a `.xlsx` workbook. */
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Reads the live session cookie + proxies a live stream, so never cache.
export const dynamic = 'force-dynamic';

/** `GET /reports/export?report=&range=&format=` — stream one report as a file download. */
export async function GET(req: Request): Promise<Response> {
  // Defence in depth: the middleware gates the route to staff, but re-assert the
  // report-view capability here since this is its own endpoint. The API re-checks
  // again behind its own guards.
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ReportView)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const key = reportKeySchema.safeParse(params.get('report'));
  if (!key.success) {
    return NextResponse.json({ error: 'Unknown report' }, { status: 400 });
  }
  // Range/format fall back to the API defaults when absent or invalid, so a bare
  // link still yields a valid download rather than a 400.
  const range = reportRangeSchema.safeParse(params.get('range'));
  const format = reportFormatSchema.safeParse(params.get('format'));

  const upstream = await fetchReportExport(key.data, {
    range: range.success ? range.data : undefined,
    format: format.success ? format.data : undefined,
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Export failed (${upstream.status})` },
      { status: upstream.status === 0 ? 502 : upstream.status },
    );
  }

  const chosenFormat = format.success ? format.data : 'csv';
  const chosenRange = range.success ? range.data : '30d';
  const filename = `report-${key.data}-${chosenRange}.${chosenFormat}`;

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': chosenFormat === 'xlsx' ? XLSX_CONTENT_TYPE : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
