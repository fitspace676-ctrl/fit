import type { Metadata } from 'next';
import {
  analyticsRangeSchema,
  Permission,
  roleHasPermission,
  type AnalyticsRange,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchAnalytics } from '@/lib/api';
import { AnalyticsRangeControl, AnalyticsView } from './analytics-view';

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
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);

  const { range: rawRange } = await searchParams;
  const parsedRange = analyticsRangeSchema.safeParse(rawRange);
  const range: AnalyticsRange = parsedRange.success ? parsedRange.data : '30d';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Analytics
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Revenue, retention and attendance across your gym.
          </p>
        </header>
        {canViewReports && <AnalyticsRangeControl value={range} />}
      </div>

      {canViewReports ? (
        <AnalyticsBody range={range} />
      ) : (
        <p className="rounded-card border border-ink-200 bg-white px-4 py-3 text-sm text-ink-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-ink-400">
          Your role does not have access to analytics. Ask an owner or manager for the reporting
          permission.
        </p>
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
  try {
    const data = await fetchAnalytics(range);
    return <AnalyticsView data={data} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load analytics (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <p
        role="alert"
        className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
      >
        {message}
      </p>
    );
  }
}
