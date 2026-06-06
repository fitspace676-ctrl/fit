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
import { STATUS_STYLES, formatDate, formatDuration } from './format';

/** A status pill mirroring the packages roster styling. */
function StatusPill({ status }: { status: ClassTemplateStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
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
      <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No class templates match your filters yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-medium">
                <Link
                  href={sortHref('title')}
                  scroll={false}
                  className="inline-flex items-center hover:text-slate-700"
                >
                  Title
                  <span aria-hidden>{sortIndicator('title')}</span>
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">Recurrence</th>
              <th className="py-2 pr-4 font-medium">Trainer</th>
              <th className="py-2 pr-4 font-medium">
                <Link
                  href={sortHref('capacity')}
                  scroll={false}
                  className="inline-flex items-center hover:text-slate-700"
                >
                  Capacity
                  <span aria-hidden>{sortIndicator('capacity')}</span>
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">Duration</th>
              <th className="py-2 pr-4 font-medium">
                <Link
                  href={sortHref('status')}
                  scroll={false}
                  className="inline-flex items-center hover:text-slate-700"
                >
                  Status
                  <span aria-hidden>{sortIndicator('status')}</span>
                </Link>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Link
                  href={sortHref('validFrom')}
                  scroll={false}
                  className="inline-flex items-center hover:text-slate-700"
                >
                  Starts
                  <span aria-hidden>{sortIndicator('validFrom')}</span>
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: template.color }}
                    />
                    <Link
                      href={`/classes/${template.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {template.title}
                    </Link>
                    {template.category ? (
                      <span className="rounded-card bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {template.category}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="py-2 pr-4 text-slate-700">{template.recurrence}</td>
                <td className="py-2 pr-4 text-slate-700">{template.trainerName ?? '—'}</td>
                <td className="py-2 pr-4 tabular-nums text-slate-700">{template.capacity}</td>
                <td className="py-2 pr-4 text-slate-700">
                  {formatDuration(template.durationMinutes)}
                </td>
                <td className="py-2 pr-4">
                  <StatusPill status={template.status} />
                </td>
                <td className="py-2 pr-4 text-slate-700">{formatDate(template.validFrom)}</td>
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
