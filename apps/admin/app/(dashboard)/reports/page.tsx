import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { getTranslations } from 'next-intl/server';
import {
  DEFAULT_REPORT_RANGE,
  Permission,
  reportKeySchema,
  reportQuerySchema,
  roleHasPermission,
  type ReportKey,
  type ReportQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchReport, fetchReportCatalog } from '@/lib/api';
import { ReportsView } from './reports-view';
import { chrome } from './report-chrome';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
});

export const metadata: Metadata = {
  title: 'Reports - FormaCore Admin',
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
 *
 * The screen is the catalogue and nothing else: no page title, no description,
 * and no "Drill-down reports" index above it. The `/reports/[metric]` drill-down
 * routes still exist and still render — they are simply not linked from here any
 * more, so whatever links to them must do so directly.
 *
 * The search box and the range control both live INSIDE `ReportsView`, so this
 * component renders one child and no chrome of its own. That is deliberate: both
 * controls only mean something once the catalogue has loaded, and a toolbar
 * hovering above a failed fetch governs nothing.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; range?: string; from?: string; to?: string }>;
}) {
  const t = await getTranslations('admin.reports');
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);
  const canExport = session !== null && roleHasPermission(session.role, Permission.ReportExport);

  const { report: rawReport, range, from, to } = await searchParams;
  // The window is validated as a whole: a `custom` range missing a day, or with
  // its days out of order, falls back to the default rather than reaching the
  // API as a 400 the screen would have to explain.
  const parsedQuery = reportQuerySchema.safeParse({ range, from, to });
  const query: ReportQuery = parsedQuery.success
    ? parsedQuery.data
    : { range: DEFAULT_REPORT_RANGE };
  // An unrecognised (or absent) `?report=` falls back to the catalogue's first
  // *offered* report rather than to nothing, so the screen always opens on a real
  // preview and the index always has a marked row when the gym offers any reports
  // at all. A bad key is corrected rather than 404'd: the value is a view
  // preference, and the catalogue is the authority on it. That correction can only
  // happen once the (filtered) catalogue is in hand, so `requested` — what the URL
  // asked for — is as far as this component goes; `ReportsBody` resolves it against
  // the catalogue into `offered` — what the gym actually has.
  const parsedKey = reportKeySchema.safeParse(rawReport);
  const requested: ReportKey | null = parsedKey.success ? parsedKey.data : null;

  return (
    <div {...stylex.props(styles.page)}>
      {/* The screen deliberately shows no title, but a document still needs one
          heading that names it: without this the page has no `h1` at all, the
          segment headings in the catalogue start the outline at `h2`, and a
          screen-reader user landing here is told nothing about where they are.
          Nothing about the visual design changes. */}
      <VisuallyHidden as="h1">{t('title')}</VisuallyHidden>

      {canViewReports ? (
        <ReportsBody query={query} requested={requested} canExport={canExport} />
      ) : (
        <p {...stylex.props(chrome.notice)}>{t('noAccess')}</p>
      )}
    </div>
  );
}

/**
 * Fetches the gym's report catalogue (and, when one is selected, its preview over
 * `query`'s window) and hands the real responses to the client view. A failed fetch becomes
 * the same inline "Could not reach the FormaCore API" alert the other screens use, rather
 * than crashing the page.
 */
async function ReportsBody({
  query,
  requested,
  canExport,
}: {
  query: ReportQuery;
  requested: ReportKey | null;
  /** `ReportExport` — whether the preview offers the CSV / XLSX downloads. */
  canExport: boolean;
}) {
  const t = await getTranslations('admin.reports');
  try {
    const catalog = await fetchReportCatalog();

    // The default has to come from the FILTERED catalogue, not from
    // `DEFAULT_REPORT_KEY`: that constant is `REPORT_KEYS[0]`, and a gym that
    // switches that one report off would otherwise land on a report its own hub
    // is not offering. A `?report=` naming a disabled report falls back the same
    // way an unrecognised one already does — the value is a view preference and
    // the gym's catalogue is the authority on it.
    const offered = catalog.reports.some((report) => report.key === requested)
      ? requested
      : (catalog.reports[0]?.key ?? null);

    if (offered === null) {
      return (
        <ReportsView
          reports={[]}
          segments={catalog.segments}
          selected={null}
          reportQuery={query}
          preview={null}
          canExport={canExport}
        />
      );
    }

    const preview = await fetchReport(offered, query);
    return (
      <ReportsView
        reports={catalog.reports}
        segments={catalog.segments}
        selected={offered}
        reportQuery={query}
        preview={preview}
        canExport={canExport}
      />
    );
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
