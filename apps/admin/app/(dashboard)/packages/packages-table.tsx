'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminPackagePlanRow, PackagePlanSort, PackagePlanStatus, SortDir } from '@fit/types';
import { Badge, Button, Card, type BadgeTone } from '@fit/ui-kit';
import { formatPrice, intervalSuffix, sessionLabel } from './format';
import { createDateTimeFormat, defaultLocale } from '@fit/i18n';

/** Visual treatment per plan status — green active, slate inactive. */
const STATUS_STYLES: Record<PackagePlanStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
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
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone} label={label} />;
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '-'
    : createDateTimeFormat(defaultLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
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
    return <Card>No package plans match your filters yet.</Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
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
                Sessions
              </th>
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
                      href={`/packages/${plan.id}`}
                      className="font-medium text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                    >
                      {plan.name}
                    </Link>
                    {plan.popular ? <Badge tone="accent" label="Popular" /> : null}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                  {formatPrice(plan.priceAmount, plan.currency)}
                  <span className="ml-1 text-xs text-ink-400">
                    {intervalSuffix(plan.billingInterval)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={plan.status} />
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {formatDate(plan.createdAt)}
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {sessionLabel(plan.sessionCount)}
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {plan.featureCount > 0 ? (
                    <Badge
                      tone="neutral"
                      label={
                        <>
                          {plan.featureCount} {plan.featureCount === 1 ? 'feature' : 'features'}
                        </>
                      }
                    />
                  ) : (
                    '-'
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
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
            disabled={!hasPrev}
            label="Previous"
          />
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
            disabled={!hasNext}
            label="Next"
          />
        </div>
      </div>
    </div>
  );
}
