'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AdminClassTemplateRow,
  ClassTemplateSort,
  ClassTemplateStatus,
  SortDir,
} from '@fit/types';
import { Badge, Btn, Card } from '@/components/ui';
import { ClassTemplatesFilters } from './classes-filters';
import { STATUS_STYLES, formatDate, formatDuration } from './format';

/** A status pill mirroring the packages roster styling. */
function StatusPill({ status }: { status: ClassTemplateStatus }) {
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** `#RRGGBB` → `#RRGGBBAA`; non-hex colours pass through untinted. */
function tint(color: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

/** One card in the stats strip above the roster (reference "stats strip"). */
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card glow className="p-4">
      <div className="font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </div>
    </Card>
  );
}

/** The reference type-chip skins: neutral idle, ink-inverted "all" active. */
const CHIP_BASE =
  'inline-flex h-9 items-center gap-2 rounded-pill px-3.5 text-sm font-semibold transition';
const CHIP_IDLE =
  'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 dark:bg-white/[0.04] dark:text-ink-300 dark:ring-white/10 dark:hover:text-white';
const CHIP_ALL_ACTIVE = 'bg-ink-900 text-white dark:bg-white dark:text-ink-950';

/**
 * The class-templates roster (T5.2), reskinned to the Planflow "formacore"
 * schedule reference: a stats strip, the search + status row, category filter
 * chips (colour-dotted, like the reference type chips), and the roster table with
 * a colour rail + trainer avatar per row. Server-rendered data, client-side
 * interaction: sortable column headers and pagination read/write the URL search
 * params so the server page stays the single source of truth, while the category
 * chips narrow the *current page* client-side over the real categories present.
 * The data never mutates here.
 */
export function ClassTemplatesTable({
  templates,
  total,
  page,
  limit,
  sort,
  dir,
  search,
  status,
}: {
  templates: AdminClassTemplateRow[];
  total: number;
  page: number;
  limit: number;
  sort: ClassTemplateSort;
  dir: SortDir;
  search: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [category, setCategory] = useState<string | null>(null);

  // The chip options are the real categories present on this page (with each
  // template's calendar colour), so nothing is hardcoded — first-seen order.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const template of templates) {
      if (template.category && !seen.has(template.category)) {
        seen.set(template.category, template.color);
      }
    }
    return [...seen.entries()].map(([label, color]) => ({ label, color }));
  }, [templates]);

  const visible = useMemo(
    () =>
      category === null
        ? templates
        : templates.filter((template) => template.category === category),
    [templates, category],
  );

  // Stats strip. `total` is the real filter-aware roster count; the rest are
  // aggregates over the current page (with the default limit this is the whole
  // roster for most gyms — a gym-wide status count would need an API aggregate).
  const activeCount = templates.filter((template) => template.status === 'ACTIVE').length;
  const avgCapacity =
    templates.length === 0
      ? '—'
      : Math.round(templates.reduce((sum, t) => sum + t.capacity, 0) / templates.length);
  const avgDuration =
    templates.length === 0
      ? '—'
      : formatDuration(
          Math.round(templates.reduce((sum, t) => sum + t.durationMinutes, 0) / templates.length),
        );

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

  function sortHref(key: ClassTemplateSort): string {
    const nextDir: SortDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key, dir: nextDir });
  }

  function sortIndicator(key: ClassTemplateSort): string {
    if (sort !== key) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  const headClass =
    'py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';
  const sortLinkClass =
    'inline-flex items-center transition-colors hover:text-ink-600 dark:hover:text-ink-200';

  return (
    <div className="flex flex-col gap-5">
      {/* Stats strip. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Class templates" value={total} />
        <StatCard label="Active" value={activeCount} />
        <StatCard label="Avg capacity" value={avgCapacity} />
        <StatCard label="Avg duration" value={avgDuration} />
      </div>

      {/* Search + status (server-backed via the URL). */}
      <ClassTemplatesFilters search={search} status={status} />

      {/* Category chips — the reference type filter, over real categories. */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
            className={`${CHIP_BASE} ${category === null ? CHIP_ALL_ACTIVE : CHIP_IDLE}`}
          >
            All classes
          </button>
          {categories.map((option) => {
            const active = option.label === category;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(active ? null : option.label)}
                className={`${CHIP_BASE} ${active ? 'text-ink-900 dark:text-white' : CHIP_IDLE}`}
                style={
                  active
                    ? {
                        backgroundColor: tint(option.color, '26'),
                        boxShadow: `inset 0 0 0 1px ${tint(option.color, '66')}`,
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: option.color }}
                />
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink-200 px-4 py-12 text-center dark:border-white/10">
          <p className="text-sm font-medium text-ink-700 dark:text-ink-200">No classes</p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {templates.length === 0
              ? 'No class templates match your filters yet.'
              : 'No templates in this category on this page.'}
          </p>
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-white/10">
                <th className={`${headClass} pl-5`}>
                  <Link href={sortHref('title')} scroll={false} className={sortLinkClass}>
                    Title
                    <span aria-hidden>{sortIndicator('title')}</span>
                  </Link>
                </th>
                <th className={headClass}>Recurrence</th>
                <th className={headClass}>Trainer</th>
                <th className={headClass}>
                  <Link href={sortHref('capacity')} scroll={false} className={sortLinkClass}>
                    Capacity
                    <span aria-hidden>{sortIndicator('capacity')}</span>
                  </Link>
                </th>
                <th className={headClass}>Duration</th>
                <th className={headClass}>
                  <Link href={sortHref('status')} scroll={false} className={sortLinkClass}>
                    Status
                    <span aria-hidden>{sortIndicator('status')}</span>
                  </Link>
                </th>
                <th className={`${headClass} pr-5`}>
                  <Link href={sortHref('validFrom')} scroll={false} className={sortLinkClass}>
                    Starts
                    <span aria-hidden>{sortIndicator('validFrom')}</span>
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((template) => (
                <tr
                  key={template.id}
                  className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
                >
                  <td className="py-3 pr-4 pl-5">
                    <div className="flex items-center gap-3">
                      {/* The reference class-block colour rail. */}
                      <span
                        aria-hidden
                        className="h-8 w-1 shrink-0 rounded-pill"
                        style={{ backgroundColor: template.color }}
                      />
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          href={`/classes/${template.id}`}
                          className="truncate font-semibold text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                        >
                          {template.title}
                        </Link>
                        {template.category ? (
                          <span className="shrink-0 rounded-pill bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500 dark:bg-white/10 dark:text-ink-400">
                            {template.category}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-ink-700 dark:text-ink-200">
                    {template.recurrence}
                  </td>
                  <td className="py-3 pr-4 text-ink-700 dark:text-ink-200">
                    {template.trainerName ? (
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200">
                          {initialsOf(template.trainerName)}
                        </span>
                        <span className="truncate">{template.trainerName}</span>
                      </div>
                    ) : (
                      <span className="text-ink-400 dark:text-ink-500">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                    {template.capacity}
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                    {formatDuration(template.durationMinutes)}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusPill status={template.status} />
                  </td>
                  <td className="py-3 pr-5 text-ink-700 dark:text-ink-200">
                    {formatDate(template.validFrom)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            icon="chevronLeft"
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
            iconRight="chevronRight"
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
