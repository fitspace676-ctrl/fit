'use client';

import { useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ORDER_EXPORT_COLUMNS } from '@fit/types';
import { Card, Icon, buttonClasses } from '@/components/ui';
import { RANGE_LABELS, REPORT_RANGES, type ReportsRange } from './report-ranges';

/**
 * The datasets the design's custom builder offers. Only payments (orders) has a
 * real export endpoint today (`GET /orders/export`); the rest exist as backend
 * entities but expose no export, so their chips render disabled rather than
 * pretending to work. Members' `POST /members/bulk-export` only mints a job id —
 * no worker produces a file yet — so it counts as unavailable too.
 */
const DATASETS: ReadonlyArray<{ key: string; label: string; available: boolean }> = [
  { key: 'payments', label: 'Payments', available: true },
  { key: 'members', label: 'Members', available: false },
  { key: 'bookings', label: 'Bookings', available: false },
  { key: 'check-ins', label: 'Check-ins', available: false },
  { key: 'products', label: 'Products', available: false },
];

/** Human labels for the API's fixed order-export column set. */
const COLUMN_LABELS: Record<(typeof ORDER_EXPORT_COLUMNS)[number], string> = {
  id: 'Order ID',
  createdAt: 'Created at',
  channel: 'Channel',
  status: 'Status',
  currency: 'Currency',
  total: 'Total',
  refundedAmount: 'Refunded amount',
  paymentMethod: 'Payment method',
  memberId: 'Member ID',
  customerName: 'Customer name',
  itemCount: 'Item count',
};

/**
 * The Reports screen's client view. Renders the export hub the design specifies:
 * a custom export builder (dataset · date range · columns · format) wired to the
 * real streaming `GET /orders/export`, with a live matching-row count from the
 * server component, plus honest placeholders for the design's template gallery
 * and export history — both need backend infrastructure that doesn't exist yet,
 * so they state that instead of inventing data. The range control writes
 * `?range=` to the URL so the server component re-fetches the preview count.
 */
export function ReportsView({
  range,
  window: exportWindow,
  ordersTotal,
  exportHref,
}: {
  range: ReportsRange;
  /** The inclusive day bounds the selected range resolves to. */
  window: { from: string; to: string };
  /** Live count of orders inside the window — the rows the export will contain. */
  ordersTotal: number;
  /** The `/orders/export` proxy URL carrying the window, streamed as a CSV download. */
  exportHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectRange(next: ReportsRange): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <div className={`flex flex-col gap-6 ${isPending ? 'opacity-70 transition-opacity' : ''}`}>
      {/* Templates — no generation pipeline exists yet, so this stays an honest stub. */}
      <section aria-label="Report templates" className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          Templates
        </h2>
        <Card glow className="p-5">
          <EmptyState>
            <span className="max-w-md">
              Report templates (revenue summary, membership, attendance, payroll, tax, inventory)
              need a server-side report-generation pipeline that isn&apos;t built yet. For live
              on-screen figures, use Analytics.
            </span>
            <Link href="/analytics" className={buttonClasses('outline', 'sm', 'mt-3')}>
              <Icon name="chart" className="h-4 w-4" />
              Open analytics
            </Link>
          </EmptyState>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Custom export — the one design section with a real endpoint behind it. */}
        <Card glow className="p-5 xl:col-span-3">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_6px_18px_-6px_rgba(124,58,237,0.8)]">
              <Icon name="spark" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white">
                Custom export
              </h2>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Stream a dataset as CSV, straight from the live API.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <FieldLabel>Dataset</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {DATASETS.map((dataset) => (
                  <span
                    key={dataset.key}
                    className={`inline-flex h-9 items-center rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset ${
                      dataset.available
                        ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white ring-transparent shadow-[0_6px_18px_-8px_rgba(124,58,237,0.8)]'
                        : 'bg-ink-50 text-ink-400 ring-ink-200 dark:bg-white/[0.03] dark:text-ink-500 dark:ring-white/10'
                    }`}
                  >
                    {dataset.label}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-400 dark:text-ink-500">
                Only the payments (orders) dataset has an export endpoint today — the other datasets
                need API export routes before they can be offered here.
              </p>
            </div>

            <div>
              <FieldLabel>Date range</FieldLabel>
              <div role="tablist" aria-label="Export window" className="flex flex-wrap gap-1.5">
                {REPORT_RANGES.map((option) => {
                  const active = option === range;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={isPending}
                      onClick={() => selectRange(option)}
                      className={`h-9 rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset transition disabled:pointer-events-none ${
                        active
                          ? 'bg-brand-500/10 text-brand-600 ring-brand-500/60 dark:text-brand-300'
                          : 'bg-ink-50 text-ink-600 ring-ink-200 hover:bg-ink-100 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {RANGE_LABELS[option]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <FieldLabel>
                Columns{' '}
                <span className="normal-case tracking-normal text-ink-400 dark:text-ink-500">
                  fixed by the API
                </span>
              </FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {ORDER_EXPORT_COLUMNS.map((column) => (
                  <span
                    key={column}
                    className="inline-flex h-8 items-center gap-1.5 rounded-btn bg-ink-50 px-3 text-xs font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10"
                  >
                    <Icon name="check" className="h-3 w-3 text-brand-500 dark:text-brand-400" />
                    {COLUMN_LABELS[column]}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-ink-100 pt-4 dark:border-white/10 sm:flex-row sm:items-center">
              <div className="inline-flex w-fit rounded-pill bg-ink-50 p-1 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
                <span className="h-8 rounded-pill bg-[linear-gradient(135deg,#7C3AED,#EC4899)] px-3.5 text-xs font-bold leading-8 text-white">
                  CSV
                </span>
                {['XLSX', 'PDF'].map((format) => (
                  <span
                    key={format}
                    title="The API only streams CSV"
                    className="h-8 px-3.5 text-xs font-bold leading-8 text-ink-300 dark:text-ink-600"
                  >
                    {format}
                  </span>
                ))}
              </div>
              <div className="sm:ml-auto sm:text-right">
                <a href={exportHref} className={buttonClasses('primary', 'md')}>
                  <Icon name="download" className="h-4 w-4" />
                  Export CSV
                </a>
                <p className="mt-2 font-mono text-xs tabular-nums text-ink-400 dark:text-ink-500">
                  {ordersTotal} {ordersTotal === 1 ? 'row' : 'rows'} · {exportWindow.from} →{' '}
                  {exportWindow.to}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Recent exports — the API streams downloads and stores no history. */}
        <Card glow className="flex flex-col xl:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-white/10">
            <h2 className="font-display font-extrabold tracking-tight text-ink-900 dark:text-white">
              Recent exports
            </h2>
          </div>
          <div className="flex flex-1 items-center p-5">
            <EmptyState>
              <span className="max-w-xs">
                Exports stream straight to your browser as they&apos;re generated — the API
                doesn&apos;t keep an export history yet, so there is nothing to list here.
              </span>
            </EmptyState>
          </div>
        </Card>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small shared pieces                                                        */
/* -------------------------------------------------------------------------- */

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
      {children}
    </p>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-24 w-full place-items-center rounded-field border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
