import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  roleHasPermission,
  dashboardRangeSchema,
  type DashboardRange,
} from '@fit/types';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardOverview, fetchDashboardWidgets } from '@/lib/api';
import { DashboardView } from './dashboard-view';
import type { PinnedWidget } from '@fit/types';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  welcome: {
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
  body: {
    margin: 0,
    maxWidth: '42rem',
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
  title: 'Dashboard — Fit Admin',
};

// The overview reflects live tenant state and the staff session token, so the
// landing page must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Console landing page — the FormaCore control-room dashboard. For staff who hold
 * {@link Permission.ReportView} (`OWNER` / `MANAGER`) it renders the gym's live
 * overview from `GET /dashboard/overview`; lower-privileged staff (who would get a
 * `403` from the endpoint) see the plain welcome instead, so the page degrades
 * cleanly by role rather than erroring. A failed fetch becomes an inline alert
 * (the rest of the console stays reachable). The API re-checks the permission
 * regardless — this only decides what the landing page offers.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);

  if (!canViewReports) {
    return <Welcome />;
  }

  const params = await searchParams;
  const range = parseRange(params.range);

  let overview;
  try {
    overview = await fetchDashboardOverview(range);
  } catch (error) {
    const t = await getTranslations('admin.dashboard.error');
    const message =
      error instanceof ApiError
        ? t('withStatus', { status: error.status, message: error.message })
        : t('unreachable');
    return (
      <div {...stylex.props(styles.stack)}>
        <Welcome />
        <p role="alert" {...stylex.props(styles.alert)}>
          {message}
        </p>
      </div>
    );
  }

  // Pinned report widgets (T12.12) are a secondary surface — a failure to resolve
  // them must never take down the whole dashboard, so degrade to none on error.
  let pinnedWidgets: PinnedWidget[] = [];
  try {
    pinnedWidgets = (await fetchDashboardWidgets()).widgets;
  } catch {
    pinnedWidgets = [];
  }

  return <DashboardView data={overview} pinnedWidgets={pinnedWidgets} />;
}

/** The role-degraded welcome shown to staff without `ReportView` (and as a fallback). */
async function Welcome() {
  const t = await getTranslations('admin.dashboard');
  return (
    <header {...stylex.props(styles.welcome)}>
      <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
      <p {...stylex.props(styles.body)}>{t('welcomeBody')}</p>
    </header>
  );
}

/** Resolve the `?range=` query to a valid {@link DashboardRange}, defaulting to `7d`. */
function parseRange(raw: string | string[] | undefined): DashboardRange {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = dashboardRangeSchema.safeParse(value);
  return parsed.success ? parsed.data : '7d';
}
