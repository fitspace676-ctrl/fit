import type { Metadata } from 'next';
import {
  businessDateSchema,
  Permission,
  roleHasPermission,
  type CashReconciliationReport,
  type PaymentMethod,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchCashReconciliation } from '@/lib/api';
import { formatPrice } from '@/app/products/format-price';
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
      <div className="flex flex-col gap-2 p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cash reconciliation</h1>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          You don’t have permission to view the cash reconciliation report.
        </p>
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
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cash reconciliation</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          The day’s takings grouped by how they were settled. Count the cash drawer and balance it
          against the expected cash below.
        </p>
      </header>

      <ReconciliationDateForm date={date} />

      {error !== null ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : report !== null ? (
        <div className="flex flex-col gap-6">
          <section className="overflow-hidden rounded-card border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 text-right font-medium">Sales</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.methods.map((row) => (
                  <tr key={row.method} className={row.method === 'cash' ? 'bg-brand-50/40' : ''}>
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {METHOD_LABELS[row.method]}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {row.count}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                      {formatPrice(row.total, report.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td className="px-4 py-2 font-semibold text-slate-900">Total</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {report.salesCount}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {formatPrice(report.grossTotal, report.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <CashCountForm expectedCash={report.expectedCash} currency={report.currency} />

          <p className="text-xs text-slate-400">
            Generated {new Date(report.generatedAt).toLocaleString()}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
