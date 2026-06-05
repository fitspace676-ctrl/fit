'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MemberRow, MemberSort, MemberStatus, SortDir } from '@fit/types';
import { bulkExportMembersAction } from './actions';

/** Visual treatment per member status — green active, slate invited, amber suspended. */
const STATUS_STYLES: Record<MemberStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INVITED: { label: 'Invited', className: 'bg-slate-100 text-slate-600' },
  SUSPENDED: { label: 'Suspended', className: 'bg-amber-50 text-amber-700' },
};

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: MemberSort; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'lastVisitAt', label: 'Last visit' },
];

/** A status pill mirroring the SuperAdmin console's roster styling. */
function StatusPill({ status }: { status: MemberStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The members roster table (T4.2). Server-rendered data, client-side interaction:
 * row selection feeding the CSV export, sortable column headers, and pagination —
 * all of which read/write the URL search params so the server page stays the
 * single source of truth. The data itself never mutates here; selection is the
 * only local state.
 */
export function MembersTable({
  members,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  members: MemberRow[];
  total: number;
  page: number;
  limit: number;
  sort: MemberSort;
  dir: SortDir;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, startExport] = useTransition();
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const pageIds = useMemo(() => members.map((m) => m.id), [members]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  /** Build a URL with one set of params overridden (and page reset unless given). */
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

  function toggleRow(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll(): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function exportSelected(): void {
    setExportError(null);
    setExportNote(null);
    const ids = [...selected];
    startExport(async () => {
      const result = await bulkExportMembersAction(ids.length > 0 ? { ids } : {});
      if (result.ok) {
        setExportNote(
          `Export started${ids.length > 0 ? ` for ${ids.length} member${ids.length === 1 ? '' : 's'}` : ' for all members'} (job ${result.data.jobId}). You'll be able to download the CSV when it finishes.`,
        );
      } else {
        setExportError(result.error);
      }
    });
  }

  /** Toggle sort on a column: same column flips direction, a new column starts ascending. */
  function sortHref(key: MemberSort): string {
    const nextDir: SortDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key, dir: nextDir });
  }

  /** The arrow glyph shown next to the active sort column. */
  function sortIndicator(key: MemberSort): string {
    if (sort !== key) {
      return '';
    }
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (members.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No members match your filters yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Selection + export toolbar. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={exportSelected}
          disabled={exporting}
          className="rounded-card border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {exporting
            ? 'Starting export…'
            : selected.size > 0
              ? `Export ${selected.size} selected`
              : 'Export all'}
        </button>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Clear selection
          </button>
        ) : null}
      </div>

      {exportNote ? (
        <p role="status" className="rounded-card bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {exportNote}
        </p>
      ) : null}
      {exportError ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {exportError}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="w-10 py-2 pr-4">
                <input
                  type="checkbox"
                  aria-label="Select all members on this page"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
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
              <th className="py-2 pr-4 font-medium">Plan</th>
              <th className="py-2 pr-4 font-medium">Next billing</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    aria-label={`Select ${member.name}`}
                    checked={selected.has(member.id)}
                    onChange={() => toggleRow(member.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
                <td className="py-2 pr-4">
                  <Link
                    href={`/members/${member.id}`}
                    className="font-medium text-slate-900 hover:text-brand-700"
                  >
                    {member.name}
                  </Link>
                  <div className="text-xs text-slate-500">{member.email}</div>
                </td>
                <td className="py-2 pr-4">
                  <StatusPill status={member.status} />
                </td>
                <td className="py-2 pr-4 text-slate-700">{formatDate(member.lastVisitAt)}</td>
                <td className="py-2 pr-4 text-slate-700">{member.planName ?? '—'}</td>
                <td className="py-2 pr-4 text-slate-700">{formatDate(member.nextBillingAt)}</td>
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
