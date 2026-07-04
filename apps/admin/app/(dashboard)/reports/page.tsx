import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  DEFAULT_REPORT_RANGE,
  Permission,
  reportKeySchema,
  reportRangeSchema,
  roleHasPermission,
  type ReportKey,
  type ReportRange,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchReport, fetchReportCatalog } from '@/lib/api';
import { ReportsView } from './reports-view';

export const metadata: Metadata = {
  title: 'Reports — Fit Admin',
};

// The hub reflects live tenant state + the staff session token, so this page must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Reports screen (T4.9). For staff who hold {@link Permission.ReportView} (`OWNER`
 * / `MANAGER`) it renders the gym's report catalogue as cards, a date-range
 * control, and — once a report is picked — its previewed columns/rows with CSV /
 * XLSX download links; lower-privileged staff (who would get a `403` from the
 * endpoint) see a plain permission notice instead, so the page degrades cleanly by
 * role rather than erroring. The API re-checks the permission regardless — this
 * only decides what the page offers. The selected `report` and `range` live in the
 * URL so the segmented control and cards re-fetch server-side (no client data
 * cache to drift), mirroring the Analytics screen.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; range?: string }>;
}) {
  const t = await getTranslations('admin.reports');
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);

  const { report: rawReport, range: rawRange } = await searchParams;
  const parsedRange = reportRangeSchema.safeParse(rawRange);
  const range: ReportRange = parsedRange.success ? parsedRange.data : DEFAULT_REPORT_RANGE;
  const parsedKey = reportKeySchema.safeParse(rawReport);
  const selected: ReportKey | null = parsedKey.success ? parsedKey.data : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('description')}</p>
      </header>

      {canViewReports ? (
        <ReportsBody range={range} selected={selected} />
      ) : (
        <p className="rounded-card border border-ink-200 bg-white px-4 py-3 text-sm text-ink-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-ink-400">
          {t('noAccess')}
        </p>
      )}
    </div>
  );
}

/**
 * Fetches the gym's report catalogue (and, when one is selected, its preview for
 * `range`) and hands the real responses to the client view. A failed fetch becomes
 * the same inline "Could not reach the Fit API" alert the other screens use, rather
 * than crashing the page.
 */
async function ReportsBody({
  range,
  selected,
}: {
  range: ReportRange;
  selected: ReportKey | null;
}) {
  const t = await getTranslations('admin.reports');
  try {
    const [catalog, preview] = await Promise.all([
      fetchReportCatalog(),
      selected ? fetchReport(selected, range) : Promise.resolve(null),
    ]);
    return (
      <ReportsView reports={catalog.reports} selected={selected} range={range} preview={preview} />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('loadError', { status: error.status, message: error.message })
        : t('apiUnreachable');
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
