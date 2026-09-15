import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import {
  DEFAULT_REPORT_DRILLDOWN_RANGE,
  Permission,
  reportDrilldownQuerySchema,
  reportMetricSchema,
  roleHasPermission,
  type ReportDrilldownQuery,
  type ReportMetric,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { getActiveLocationId } from '@/lib/active-location-server';
import { ApiError, fetchReportDrilldown } from '@/lib/api';
import { DrilldownView } from './drilldown-view';
import { chrome } from '../report-chrome';

export const metadata: Metadata = {
  title: 'Report',
};

// The drill-down reflects live tenant state + the staff session token, so this page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Drill-down report screen (`/reports/[metric]`, T12.12). Validates `:metric`
 * against the {@link ReportMetric} enum (an unknown slug is a `404`), gates the
 * whole screen on {@link Permission.ReportView} (`OWNER` / `MANAGER`) — lower staff
 * get a plain notice, degrading by role rather than erroring — and renders the live
 * drill-down (KPIs + sections). The selected `range` lives in the URL so the
 * segmented control re-fetches server-side.
 */
export default async function ReportDrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; locationId?: string }>;
}) {
  const { metric: rawMetric } = await params;
  const parsedMetric = reportMetricSchema.safeParse(rawMetric);
  if (!parsedMetric.success) {
    notFound();
  }
  const metric: ReportMetric = parsedMetric.data;

  const t = await getTranslations('admin.reports');
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);
  const canExport = session !== null && roleHasPermission(session.role, Permission.ReportExport);

  const search = await searchParams;
  const { range, from, to } = search;
  // A drill-down link is what staff paste to each other, so the branch rides in
  // the URL when it is there and falls back to the top bar's cookie when it is
  // not - the same resolution the export route beside this page performs.
  const locationId = await getActiveLocationId(search);
  // Validated as a whole, so a half-written custom range falls back rather
  // than reaching the API as a 400 — same rule as the Reports hub.
  const parsedQuery = reportDrilldownQuerySchema.safeParse({ range, from, to });
  const query: ReportDrilldownQuery = parsedQuery.success
    ? parsedQuery.data
    : { range: DEFAULT_REPORT_DRILLDOWN_RANGE };

  if (!canViewReports) {
    return <p {...stylex.props(chrome.notice)}>{t('noAccess')}</p>;
  }

  try {
    const drilldown = await fetchReportDrilldown(metric, { ...query, locationId });
    // The same value the fetch used, so the caveats and the download links
    // describe the branch actually on screen.
    return <DrilldownView drilldown={drilldown} canExport={canExport} locationId={locationId} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('loadError', { status: error.status, message: error.message })
        : t('apiUnreachable');
    return (
      <p role="alert" {...stylex.props(chrome.alert)}>
        {message}
      </p>
    );
  }
}
