import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import {
  analyticsRangeSchema,
  Permission,
  roleHasPermission,
  type AnalyticsRange,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchAnalytics } from '@/lib/api';
import { AnalyticsView } from './analytics-view';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  description: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
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
  title: 'Analytics — Fit Admin',
};

// The report reflects live tenant state + the staff session token, so this page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Analytics screen. For staff who hold {@link Permission.ReportView} (`OWNER` /
 * `MANAGER`) it renders the gym's range-windowed KPIs and charts from
 * `GET /admin/analytics`; lower-privileged staff (who would get a `403` from the
 * endpoint) see a plain permission notice instead, so the page degrades cleanly by
 * role rather than erroring. The API re-checks the permission regardless — this only
 * decides what the page offers. The active `range` lives in the URL so the segmented
 * control re-fetches server-side (no client data cache to drift).
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const t = await getTranslations('admin.analytics');
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);

  const { range: rawRange } = await searchParams;
  const parsedRange = analyticsRangeSchema.safeParse(rawRange);
  const range: AnalyticsRange = parsedRange.success ? parsedRange.data : '30d';

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.description)}>{t('description')}</p>
      </header>

      {canViewReports ? (
        <AnalyticsBody range={range} />
      ) : (
        <p {...stylex.props(styles.notice)}>{t('noAccess')}</p>
      )}
    </div>
  );
}

/**
 * Fetches the gym's analytics for `range` and hands the real response to the
 * client view. A failed fetch becomes the same inline "Could not reach the Fit API"
 * alert the dashboard uses, rather than crashing the page.
 */
async function AnalyticsBody({ range }: { range: AnalyticsRange }) {
  const t = await getTranslations('admin.analytics');
  try {
    const data = await fetchAnalytics(range);
    return <AnalyticsView data={data} />;
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
