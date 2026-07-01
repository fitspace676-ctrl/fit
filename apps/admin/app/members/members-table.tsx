'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MemberRow, MemberSort, MemberStatus, SortDir } from '@fit/types';
import { Badge, Btn, Card, Icon, type Tone } from '@/components/ui';
import { bulkExportMembersAction } from './actions';

/** Visual treatment per member status — green active, slate invited, amber suspended. */
const STATUS_STYLES: Record<MemberStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INVITED: { label: 'Invited', tone: 'ink' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
};

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: MemberSort; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'lastVisitAt', label: 'Last visit' },
];

/** A status pill mirroring the SuperAdmin console's roster styling. */
function StatusPill({ status }: { status: MemberStatus }) {
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
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
      <Card className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <Icon name="users" className="h-8 w-8 text-ink-300 dark:text-ink-500" />
        <p className="text-sm text-ink-500 dark:text-ink-400">No members match your filters yet.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Selection + export toolbar. */}
      <div className="flex flex-wrap items-center gap-3">
        <Btn v="outline" size="sm" icon="download" onClick={exportSelected} disabled={exporting}>
          {exporting
            ? 'Starting export…'
            : selected.size > 0
              ? `Export ${selected.size} selected`
              : 'Export all'}
        </Btn>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs font-medium text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
          >
            Clear selection
          </button>
        ) : null}
      </div>

      {exportNote ? (
        <Card className="bg-brand-50 px-3 py-2 dark:bg-brand-500/10">
          <p role="status" className="text-sm text-brand-700 dark:text-brand-200">
            {exportNote}
          </p>
        </Card>
      ) : null}
      {exportError ? (
        <Card className="bg-danger-50 px-3 py-2 dark:bg-danger-500/10">
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {exportError}
          </p>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-white/10">
                <th className="w-10 py-3 pl-5 pr-4">
                  <input
                    type="checkbox"
                    aria-label="Select all members on this page"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-ink-300 dark:border-white/20"
                  />
                </th>
                {SORTABLE.map((column) => (
                  <th
                    key={column.key}
                    className="py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400"
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
                <th className="py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Plan
                </th>
                <th className="py-3 pr-5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Next billing
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
                >
                  <td className="py-3 pl-5 pr-4">
                    <input
                      type="checkbox"
                      aria-label={`Select ${member.name}`}
                      checked={selected.has(member.id)}
                      onChange={() => toggleRow(member.id)}
                      className="h-4 w-4 rounded border-ink-300 dark:border-white/20"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/members/${member.id}`}
                      className="font-medium text-ink-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300"
                    >
                      {member.name}
                    </Link>
                    <div className="text-xs text-ink-500 dark:text-ink-400">{member.email}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusPill status={member.status} />
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                    {formatDate(member.lastVisitAt)}
                  </td>
                  <td className="py-3 pr-4 text-ink-700 dark:text-ink-200">
                    {member.planName ?? '—'}
                  </td>
                  <td className="py-3 pr-5 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                    {formatDate(member.nextBillingAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
