'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminTrainerRow, SortDir, TrainerSort, TrainerStatus } from '@fit/types';
import { Badge, Btn, Card, type Tone } from '@/components/ui';

/** Visual treatment per trainer status — success active, ink inactive. */
const STATUS_STYLES: Record<TrainerStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: TrainerSort; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Added' },
];

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** A status pill mirroring the members roster styling. */
function StatusPill({ status }: { status: TrainerStatus }) {
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
 * The trainers roster table (T4.4). Server-rendered data, client-side interaction:
 * sortable column headers and pagination, both of which read/write the URL search
 * params so the server page stays the single source of truth. The data never
 * mutates here.
 */
export function TrainersTable({
  trainers,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  trainers: AdminTrainerRow[];
  total: number;
  page: number;
  limit: number;
  sort: TrainerSort;
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

  function sortHref(key: TrainerSort): string {
    const nextDir: SortDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key, dir: nextDir });
  }

  function sortIndicator(key: TrainerSort): string {
    if (sort !== key) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (trainers.length === 0) {
    return (
      <Card className="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400">
        No trainers match your filters yet.
      </Card>
    );
  }

  const headClass =
    'py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';
  const sortLinkClass = 'inline-flex items-center transition-colors hover:text-ink-600 dark:hover:text-ink-200';

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 dark:border-white/10">
              {SORTABLE.map((column, index) => (
                <th key={column.key} className={`${headClass} ${index === 0 ? 'pl-5' : ''}`}>
                  <Link href={sortHref(column.key)} scroll={false} className={sortLinkClass}>
                    {column.label}
                    <span aria-hidden>{sortIndicator(column.key)}</span>
                  </Link>
                </th>
              ))}
              <th className={`${headClass} pr-5`}>Specialties</th>
            </tr>
          </thead>
          <tbody>
            {trainers.map((trainer) => (
              <tr
                key={trainer.id}
                className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
              >
                <td className="py-3 pr-4 pl-5">
                  <div className="flex items-center gap-3">
                    {trainer.photoUrl ? (
                      <img
                        src={trainer.photoUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover ring-1 ring-ink-200 dark:ring-white/10"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                        {initialsOf(trainer.name)}
                      </span>
                    )}
                    <div>
                      <Link
                        href={`/trainers/${trainer.id}`}
                        className="font-medium text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                      >
                        {trainer.name}
                      </Link>
                      {trainer.headline ? (
                        <div className="text-xs text-ink-500 dark:text-ink-400">
                          {trainer.headline}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <StatusPill status={trainer.status} />
                </td>
                <td className="py-3 pr-4 text-ink-700 dark:text-ink-200">
                  {formatDate(trainer.createdAt)}
                </td>
                <td className="py-3 pr-5 text-ink-700 dark:text-ink-200">
                  {trainer.specialties.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {trainer.specialties.map((tag) => (
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
