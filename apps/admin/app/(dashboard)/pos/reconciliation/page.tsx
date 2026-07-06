import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import {
  businessDateSchema,
  Permission,
  roleHasPermission,
  type CashReconciliationReport,
  type PaymentMethod,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchCashReconciliation } from '@/lib/api';
import { formatPrice } from '@/app/(dashboard)/products/format-price';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { ReconciliationDateForm } from './reconciliation-date-form';
import { CashCountForm } from './cash-count-form';

export const metadata: Metadata = {
  title: 'Cash reconciliation — Fit Admin',
  description:
    "The gym's end-of-day cash reconciliation: the day's takings grouped by settlement method, with the expected cash drawer to balance against the count.",
};

// The report reflects the live day's takings and the staff session token, so it
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** Human labels for each settlement method, in the report's order. */
const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  member_account: 'Member account',
};

/** Today as a `YYYY-MM-DD` string — the default day the report opens on. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const styles = stylex.create({
  forbiddenPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1.5rem',
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    padding: '1.5rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  report: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  tableCard: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  th: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  right: {
    textAlign: 'right',
  },
  bodyRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  cashRow: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  methodCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  countCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  totalCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  tfoot: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  footLabelCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  footValueCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  generatedAt: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The end-of-day cash reconciliation report (T7.5). Server-renders the day's
 * captured takings grouped by settlement method from `GET /orders/reconciliation`,
 * keyed by the `?date=` search param (defaulting to today). The whole `/pos` area
 * already requires staff (middleware); selling reads on `ProductRead` but the
 * money report is a billing concern, so this page gates on `BillingRead` and shows
 * a forbidden notice rather than a broken report for anyone without it.
 *
 * The date picker and the counted-cash variance are the only interactive bits, so
 * they are thin client islands; the table itself is server-rendered.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getServerSession();
  const canView = session !== null && roleHasPermission(session.role, Permission.BillingRead);

  if (!canView) {
    return (
      <div {...stylex.props(styles.forbiddenPage)}>
        <h1 {...stylex.props(styles.title)}>Cash reconciliation</h1>
        <Card variant="default" padding={0} role="alert" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span {...stylex.props(styles.errorText)}>
            You don’t have permission to view the cash reconciliation report.
          </span>
        </Card>
      </div>
    );
  }

  const raw = await searchParams;
  const rawDate = typeof raw.date === 'string' ? raw.date : undefined;
  // Validate against the same schema the API uses; a malformed/hand-edited date
  // falls back to today rather than erroring.
  const date = businessDateSchema.safeParse(rawDate).success ? (rawDate as string) : todayIso();

  let report: CashReconciliationReport | null = null;
  let error: string | null = null;
  try {
    report = await fetchCashReconciliation(date);
  } catch (caught) {
    error =
      caught instanceof ApiError
        ? `Could not load the report (${caught.status}): ${caught.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Cash reconciliation</h1>
        <p {...stylex.props(styles.subtitle)}>
          The day’s takings grouped by how they were settled. Count the cash drawer and balance it
          against the expected cash below.
        </p>
      </header>

      <ReconciliationDateForm date={date} />

      {error !== null ? (
        <Card variant="default" padding={0} role="alert" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span {...stylex.props(styles.errorText)}>{error}</span>
        </Card>
      ) : report !== null ? (
        <div {...stylex.props(styles.report)}>
          <Card variant="default" padding={0} xstyle={styles.tableCard}>
            <table {...stylex.props(styles.table)}>
              <thead>
                <tr {...stylex.props(styles.headRow)}>
                  <th {...stylex.props(styles.th)}>Method</th>
                  <th {...stylex.props(styles.th, styles.right)}>Sales</th>
                  <th {...stylex.props(styles.th, styles.right)}>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.methods.map((row) => (
                  <tr
                    key={row.method}
                    {...stylex.props(styles.bodyRow, row.method === 'cash' && styles.cashRow)}
                  >
                    <td {...stylex.props(styles.methodCell)}>{METHOD_LABELS[row.method]}</td>
                    <td {...stylex.props(styles.countCell)}>{row.count}</td>
                    <td {...stylex.props(styles.totalCell)}>
                      {formatPrice(row.total, report.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot {...stylex.props(styles.tfoot)}>
                <tr>
                  <td {...stylex.props(styles.footLabelCell)}>Total</td>
                  <td {...stylex.props(styles.footValueCell)}>{report.salesCount}</td>
                  <td {...stylex.props(styles.footValueCell)}>
                    {formatPrice(report.grossTotal, report.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <CashCountForm expectedCash={report.expectedCash} currency={report.currency} />

          <p {...stylex.props(styles.generatedAt)}>
            Generated {new Date(report.generatedAt).toLocaleString()}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
