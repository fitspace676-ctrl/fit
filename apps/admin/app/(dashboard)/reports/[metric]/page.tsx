import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import {
  DEFAULT_REPORT_DRILLDOWN_RANGE,
  Permission,
  reportDrilldownRangeSchema,
  reportMetricSchema,
  roleHasPermission,
  type ReportDrilldownRange,
  type ReportMetric,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardPins, fetchReportDrilldown } from '@/lib/api';
import { DrilldownView } from './drilldown-view';

const styles = stylex.create({
  notice: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  alert: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

export const metadata: Metadata = {
  title: 'Report - Fit Admin',
};

// The drill-down reflects live tenant state + the staff session token, so this page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Drill-down report screen (`/reports/[metric]`, T12.12). Validates `:metric`
 * against the {@link ReportMetric} enum (an unknown slug is a `404`), gates the
 * whole screen on {@link Permission.ReportView} (`OWNER` / `MANAGER`) — lower staff
 * get a plain notice, degrading by role rather than erroring — and renders the live
 * drill-down (KPIs + sections) with the caller's pins so each section's Pin control
 * reflects state. The selected `range` lives in the URL so the segmented control
 * re-fetches server-side.
 */
export default async function ReportDrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ range?: string }>;
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

  const { range: rawRange } = await searchParams;
  const parsedRange = reportDrilldownRangeSchema.safeParse(rawRange);
  const range: ReportDrilldownRange = parsedRange.success
    ? parsedRange.data
    : DEFAULT_REPORT_DRILLDOWN_RANGE;

  if (!canViewReports) {
    return <p {...stylex.props(styles.notice)}>{t('noAccess')}</p>;
  }

  try {
    const [drilldown, pins] = await Promise.all([
      fetchReportDrilldown(metric, range),
      fetchDashboardPins(),
    ]);
    return <DrilldownView drilldown={drilldown} pins={pins.pins} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('loadError', { status: error.status, message: error.message })
        : t('apiUnreachable');
    return (
      <p role="alert" {...stylex.props(styles.alert)}>
        {message}
      </p>
    );
  }
}
