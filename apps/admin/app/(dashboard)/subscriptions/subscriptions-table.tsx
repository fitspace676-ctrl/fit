'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AdminSubscriptionPlanRow,
  SubscriptionPlanSort,
  SubscriptionPlanStatus,
  SortDir,
} from '@fit/types';
import { Badge, Btn, Card, type Tone } from '@/components/ui';
import { formatPrice, intervalSuffix } from './format';

/** Visual treatment per plan status — green active, slate inactive. */
const STATUS_STYLES: Record<SubscriptionPlanStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: SubscriptionPlanSort; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Added' },
];

/** A status pill mirroring the packages roster styling. */
function StatusPill({ status }: { status: SubscriptionPlanStatus }) {
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The subscription-plans roster table (T8.2). Server-rendered data, client-side
 * interaction: sortable column headers and pagination, both of which read/write
 * the URL search params so the server page stays the single source of truth. Each
 * row shows the formatted price (with a per-interval suffix), the status, and the
 * feature count. The data never mutates here.
 */
export function SubscriptionPlansTable({
  plans,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  plans: AdminSubscriptionPlanRow[];
  total: number;
  page: number;
  limit: number;
  sort: SubscriptionPlanSort;
  dir: SortDir;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function sortHref(key: SubscriptionPlanSort): string {
    const nextDir: SortDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key, dir: nextDir });
  }

  function sortIndicator(key: SubscriptionPlanSort): string {
    if (sort !== key) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (plans.length === 0) {
    return (
      <Card className="px-4 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
        No subscription plans match your filters yet.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 dark:border-white/10">
              {SORTABLE.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400"
                >
                  <Link
                    href={sortHref(column.key)}
                    scroll={false}
                    className="inline-flex items-center hover:text-ink-600 dark:hover:text-ink-200"
                  >
                    {column.label}
                    <span aria-hidden>{sortIndicator(column.key)}</span>
                  </Link>
                </th>
              ))}
              <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                Features
              </th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr
                key={plan.id}
                className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/subscriptions/${plan.id}`}
                      className="font-medium text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                    >
                      {plan.name}
                    </Link>
                    {plan.popular ? (
                      <Badge tone="brand" className="text-[10px] uppercase tracking-wide">
                        Popular
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                  {formatPrice(plan.priceAmount, plan.currency)}
                  <span className="ml-1 text-xs text-ink-400">{intervalSuffix(plan.interval)}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={plan.status} />
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {formatDate(plan.createdAt)}
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {plan.featureCount > 0 ? (
                    <Badge tone="ink">
                      {plan.featureCount} {plan.featureCount === 1 ? 'feature' : 'features'}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
          >
            Previous
          </Btn>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
          >
            Next
          </Btn>
        </div>
      </div>
    </div>
  );
}
