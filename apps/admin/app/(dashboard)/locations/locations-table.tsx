'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminLocationRow, LocationSort, LocationStatus, SortDir } from '@fit/types';
import { Badge, Btn, Card, type Tone } from '@/components/ui';

/** Visual treatment per location status — green active, ink inactive. */
const STATUS_STYLES: Record<LocationStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: LocationSort; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Added' },
];

/** A status pill mirroring the trainers roster styling. */
function StatusPill({ status }: { status: LocationStatus }) {
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
 * The locations roster table (T4.5). Server-rendered data, client-side interaction:
 * sortable column headers and pagination, both of which read/write the URL search
 * params so the server page stays the single source of truth. The data never
 * mutates here.
 */
export function LocationsTable({
  locations,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  locations: AdminLocationRow[];
  total: number;
  page: number;
  limit: number;
  sort: LocationSort;
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

  function sortHref(key: LocationSort): string {
    const nextDir: SortDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key, dir: nextDir });
  }

  function sortIndicator(key: LocationSort): string {
    if (sort !== key) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (locations.length === 0) {
    return (
      <Card className="px-4 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
        No locations match your filters yet.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto">
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
                Amenities
              </th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr
                key={location.id}
                className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
              >
                <td className="px-4 py-3">
                  <div>
                    <Link
                      href={`/locations/${location.id}`}
                      className="font-medium text-ink-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300"
                    >
                      {location.name}
                    </Link>
                    {location.address ? (
                      <div className="text-xs text-ink-500 dark:text-ink-400">
                        {location.address}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={location.status} />
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {formatDate(location.createdAt)}
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {location.amenities.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {location.amenities.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-pill bg-ink-100 px-2 py-0.5 text-xs text-ink-600 dark:bg-white/10 dark:text-ink-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
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
        <span className="tabular-nums">
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
