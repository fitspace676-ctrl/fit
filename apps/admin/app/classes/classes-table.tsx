'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AdminClassTemplateRow,
  ClassTemplateSort,
  ClassTemplateStatus,
  SortDir,
} from '@fit/types';
import { Badge, Btn, Card } from '@/components/ui';
import { STATUS_STYLES, formatDate, formatDuration } from './format';

/** A status pill mirroring the packages roster styling. */
function StatusPill({ status }: { status: ClassTemplateStatus }) {
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * The class-templates roster table (T5.2). Server-rendered data, client-side
 * interaction: sortable column headers and pagination, both of which read/write
 * the URL search params so the server page stays the single source of truth. Each
 * row shows a colour swatch + title, the human recurrence summary, the default
 * trainer/location, the capacity, the duration, the status, and the validity
 * start. The data never mutates here.
 */
export function ClassTemplatesTable({
  templates,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  templates: AdminClassTemplateRow[];
  total: number;
  page: number;
  limit: number;
  sort: ClassTemplateSort;
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

  if (templates.length === 0) {
    return (
      <Card className="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400">
        No class templates match your filters yet.
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
            {templates.map((template) => (
              <tr
                key={template.id}
                className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
              >
                <td className="py-3 pr-4 pl-5">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: template.color }}
                    />
                    <Link
                      href={`/classes/${template.id}`}
                      className="font-medium text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                    >
                      {template.title}
                    </Link>
                    {template.category ? (
                      <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500 dark:bg-white/10 dark:text-ink-400">
                        {template.category}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 pr-4 text-ink-700 dark:text-ink-200">{template.recurrence}</td>
                <td className="py-3 pr-4 text-ink-700 dark:text-ink-200">
                  {template.trainerName ?? '—'}
                </td>
                <td className="py-3 pr-4 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                  {template.capacity}
                </td>
                <td className="py-3 pr-4 text-ink-700 dark:text-ink-200">
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
