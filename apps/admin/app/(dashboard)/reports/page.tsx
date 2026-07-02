import type { Metadata } from 'next';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOrders, ordersQueryString } from '@/lib/api';
import { REPORT_RANGES, type ReportsRange } from './report-ranges';
import { ReportsView } from './reports-view';

export const metadata: Metadata = {
  title: 'Reports — Fit Admin',
};

// The export preview reflects live tenant state + the staff session token, so
// this page must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Format a `Date` as the `YYYY-MM-DD` bound the API's order date schema accepts. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve a range key to the inclusive `from`/`to` day bounds it spans. The API
 * widens `from` to start-of-day and `to` to end-of-day (UTC), so day precision
 * is all the export needs.
 */
function rangeWindow(range: ReportsRange): { from: string; to: string } {
  const now = new Date();
  const to = isoDay(now);
  switch (range) {
    case 'today':
      return { from: to, to };
    case '7d':
      return { from: isoDay(new Date(now.getTime() - 6 * 86_400_000)), to };
    case '30d':
      return { from: isoDay(new Date(now.getTime() - 29 * 86_400_000)), to };
    case 'quarter': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1),
      );
      return { from: isoDay(start), to };
    }
  }
}

/**
 * Reports screen. For staff who hold {@link Permission.ReportView} (`OWNER` /
 * `MANAGER`) it renders the export hub: a payments (orders) CSV export wired to
 * the API's streaming `GET /orders/export` (via the `/orders/export` proxy route),
 * with a live row-count preview from `GET /orders`. Lower-privileged staff see a
 * plain permission notice instead, so the page degrades cleanly by role rather
 * than erroring — the API re-checks the permission regardless. The active `range`
 * lives in the URL so the segmented control re-fetches server-side.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);

  const { range: rawRange } = await searchParams;
  const range: ReportsRange = (REPORT_RANGES as readonly string[]).includes(rawRange ?? '')
    ? (rawRange as ReportsRange)
    : '30d';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Reports
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
          Export operational data for your gym — every export streams live from your real records,
          never a stored snapshot.
        </p>
      </header>

      {canViewReports ? (
        <ReportsBody range={range} />
      ) : (
        <p className="rounded-card border border-ink-200 bg-white px-4 py-3 text-sm text-ink-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-ink-400">
          Your role does not have access to reports. Ask an owner or manager for the reporting
          permission.
        </p>
      )}
    </div>
  );
}

/**
 * Fetches the count of orders inside the export window (one `limit: 1` roster
 * page — the `total` is all the preview needs) and hands the real figures to the
 * client view. A failed fetch becomes the same inline "Could not reach the Fit
 * API" alert the analytics page uses, rather than crashing the page.
 */
async function ReportsBody({ range }: { range: ReportsRange }) {
  const window = rangeWindow(range);
  try {
    const preview = await fetchOrders({ from: window.from, to: window.to, limit: 1 });
    return (
      <ReportsView
        range={range}
        window={window}
        ordersTotal={preview.total}
        exportHref={`/orders/export${ordersQueryString({ from: window.from, to: window.to })}`}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load the export preview (${error.status}): ${error.message}`
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
