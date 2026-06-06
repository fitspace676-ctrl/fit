'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminPackagePlanRow, PackagePlanSort, PackagePlanStatus, SortDir } from '@fit/types';
import { formatPrice, intervalSuffix, sessionLabel } from './format';

/** Visual treatment per plan status — green active, slate inactive. */
const STATUS_STYLES: Record<PackagePlanStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { label: 'Inactive', className: 'bg-slate-100 text-slate-600' },
};

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: PackagePlanSort; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Added' },
];

/** A status pill mirroring the products roster styling. */
function StatusPill({ status }: { status: PackagePlanStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
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
 * The package-plans roster table (T4.11). Server-rendered data, client-side
 * interaction: sortable column headers and pagination, both of which read/write
 * the URL search params so the server page stays the single source of truth. Each
 * row shows the formatted price (with a per-interval suffix), the session count,
 * the status, and the feature count. The data never mutates here.
 */
export function PackagePlansTable({
  plans,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  plans: AdminPackagePlanRow[];
  total: number;
  page: number;
  limit: number;
  sort: PackagePlanSort;
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

  function sortHref(key: PackagePlanSort): string {
    const nextDir: SortDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key, dir: nextDir });
  }

  function sortIndicator(key: PackagePlanSort): string {
    if (sort !== key) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (plans.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No package plans match your filters yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              {SORTABLE.map((column) => (
                <th key={column.key} className="py-2 pr-4 font-medium">
                  <Link
                    href={sortHref(column.key)}
                    scroll={false}
                    className="inline-flex items-center hover:text-slate-700"
                  >
                    {column.label}
                    <span aria-hidden>{sortIndicator(column.key)}</span>
                  </Link>
                </th>
              ))}
              <th className="py-2 pr-4 font-medium">Sessions</th>
              <th className="py-2 pr-4 font-medium">Features</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/packages/${plan.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {plan.name}
                    </Link>
                    {plan.popular ? (
                      <span className="rounded-card bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                        Popular
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="py-2 pr-4 tabular-nums text-slate-700">
                  {formatPrice(plan.priceAmount, plan.currency)}
                  <span className="ml-1 text-xs text-slate-400">
                    {intervalSuffix(plan.billingInterval)}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <StatusPill status={plan.status} />
                </td>
                <td className="py-2 pr-4 text-slate-700">{formatDate(plan.createdAt)}</td>
                <td className="py-2 pr-4 text-slate-700">{sessionLabel(plan.sessionCount)}</td>
                <td className="py-2 pr-4 text-slate-700">
                  {plan.featureCount > 0 ? (
                    <span className="rounded-card bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {plan.featureCount} {plan.featureCount === 1 ? 'feature' : 'features'}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
