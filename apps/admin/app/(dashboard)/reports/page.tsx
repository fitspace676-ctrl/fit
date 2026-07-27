import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import {
  DEFAULT_REPORT_RANGE,
  Permission,
  REPORT_METRIC_CATALOG,
  reportKeySchema,
  reportRangeSchema,
  roleHasPermission,
  type ReportKey,
  type ReportRange,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchReport, fetchReportCatalog } from '@/lib/api';
import { ReportsView } from './reports-view';

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
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  drilldownGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  drilldownCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
    textDecoration: 'none',
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
    ':hover': {
      borderColor: 'var(--color-accent)',
      boxShadow: '0 0 0 1px var(--color-accent)',
    },
  },
  drilldownName: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  drilldownDesc: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

export const metadata: Metadata = {
  title: 'Reports - Fit Admin',
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
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.description)}>{t('description')}</p>
      </header>

      {canViewReports ? (
        <>
          <DrilldownCards heading={t('drilldown.heading')} />
          <ReportsBody range={range} selected={selected} />
        </>
      ) : (
        <p {...stylex.props(styles.notice)}>{t('noAccess')}</p>
      )}
    </div>
  );
}

/**
 * The drill-down report cards (T12.12) — one per metric in {@link REPORT_METRIC_CATALOG},
 * each a link into `/reports/[metric]`. Kept above the CSV/XLSX catalogue so the
 * chart-first reports lead; the nav item stays active for the nested routes.
 */
function DrilldownCards({ heading }: { heading: string }) {
  return (
    <section>
      <h2 {...stylex.props(styles.sectionLabel)}>{heading}</h2>
      <div {...stylex.props(styles.drilldownGrid)} style={{ marginTop: '0.75rem' }}>
        {REPORT_METRIC_CATALOG.map((metric) => (
          <Link
            key={metric.metric}
            href={`/reports/${metric.metric}`}
            {...stylex.props(styles.drilldownCard)}
          >
            <span {...stylex.props(styles.drilldownName)}>{metric.name}</span>
            <span {...stylex.props(styles.drilldownDesc)}>{metric.description}</span>
          </Link>
        ))}
      </div>
    </section>
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
      <p role="alert" {...stylex.props(styles.alert)}>
        {message}
      </p>
    );
  }
}
