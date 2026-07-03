import type { Metadata } from 'next';
import {
  Permission,
  roleHasPermission,
  dashboardRangeSchema,
  type DashboardRange,
} from '@fit/types';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardOverview } from '@/lib/api';
import { DashboardView } from './dashboard-view';

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
      <div className="flex flex-col gap-6">
        <Welcome />
        <p
          role="alert"
          className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
        >
          {message}
        </p>
      </div>
    );
  }

  return <DashboardView data={overview} />;
}

/** The role-degraded welcome shown to staff without `ReportView` (and as a fallback). */
async function Welcome() {
  const t = await getTranslations('admin.dashboard');
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
        {t('title')}
      </h1>
      <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('welcomeBody')}</p>
    </header>
  );
}

/** Resolve the `?range=` query to a valid {@link DashboardRange}, defaulting to `7d`. */
function parseRange(raw: string | string[] | undefined): DashboardRange {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = dashboardRangeSchema.safeParse(value);
  return parsed.success ? parsed.data : '7d';
}
