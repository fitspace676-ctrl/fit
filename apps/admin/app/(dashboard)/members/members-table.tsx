'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  MemberBillingState,
  MemberPlan,
  MemberPlanMix,
  MemberRow,
  MemberSort,
  MemberStatus,
  MemberTabCounts,
  SortDir,
} from '@fit/types';
import { Badge, Btn, Card, Icon, type Tone } from '@/components/ui';
import { MembersFilters } from './members-filters';
import { bulkExportMembersAction } from './actions';

/** Visual treatment per member status — green active, slate invited, amber suspended. */
const STATUS_STYLES: Record<MemberStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INVITED: { label: 'Trial', tone: 'ink' },
  SUSPENDED: { label: 'Expired', tone: 'warning' },
};

/** The engine gradient shared by the active tab (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/**
 * The roster's segmented tabs, mapped to the `status` URL param. "All" clears the
 * filter; the others pin a `GymMemberStatus`. Counts come from the gym-wide
 * response so each tab shows its total. "Frozen" is a subscription-derived count
 * with no `GymMemberStatus`, so it's shown as a read-only count (no filter param).
 */
const TABS: ReadonlyArray<{
  label: string;
  status: MemberStatus | '';
  countKey: keyof MemberTabCounts;
}> = [
  { label: 'All', status: '', countKey: 'all' },
  { label: 'Active', status: 'ACTIVE', countKey: 'active' },
  { label: 'Frozen', status: '', countKey: 'frozen' },
  { label: 'Trial', status: 'INVITED', countKey: 'trial' },
  { label: 'Expired', status: 'SUSPENDED', countKey: 'expired' },
];

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: MemberSort; label: string }> = [
  { key: 'name', label: 'Member' },
  { key: 'status', label: 'Status' },
  { key: 'lastVisitAt', label: 'Last visit' },
];

/** A status pill mirroring the roster styling. */
function StatusPill({ status }: { status: MemberStatus }) {
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Render a member's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
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
 * A friendly relative "last visit" — "2h ago" / "Today" / "6 days" / a date —
 * from an ISO instant, local to the staff member. `null` renders "Never".
 */
function formatLastVisit(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 6) return `${hours}h ago`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 14) return `${dayDiff} days`;
  return formatDate(iso);
}

/** The NEXT-BILLING cell — a date, a paused/overdue chip, or an em dash. */
function nextBillingLabel(row: {
  nextBillingAt: string | null;
  billingState: MemberBillingState;
}): string {
  switch (row.billingState) {
    case 'paused':
      return 'paused';
    case 'overdue':
      return 'overdue';
    case 'due':
      return formatDate(row.nextBillingAt);
    case 'none':
    default:
      return '—';
  }
}

/** The PLAN cell — a colour dot + plan name + a small detail. */
function PlanCell({ plan }: { plan: MemberPlan | null }) {
  if (!plan) {
    return <span className="text-ink-400 dark:text-ink-500">No plan</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: plan.color ?? '#7C3AED' }}
      />
      <span className="font-medium text-ink-800 dark:text-ink-100">{plan.name}</span>
      <span className="text-xs text-ink-400 dark:text-ink-500">{plan.detail}</span>
    </div>
  );
}

/** The gym-wide plan-mix bar card: a stacked bar + a legend with per-plan counts. */
function PlanMixCard({ planMix }: { planMix: MemberPlanMix }) {
  const { total, plans } = planMix;
  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          Plan mix
        </h2>
        <span className="font-mono text-xs tabular-nums text-ink-400">
          {total} {total === 1 ? 'paid' : 'paid'}
        </span>
      </div>

      {total === 0 ? (
        <div className="grid min-h-16 place-items-center rounded-field border border-dashed border-ink-200 px-4 py-4 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
          No paid subscriptions yet.
        </div>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
            {plans.map((slice) => (
              <span
                key={slice.planId ?? slice.name}
                className="h-full first:rounded-l-pill last:rounded-r-pill"
                style={{
                  width: `${(slice.count / total) * 100}%`,
                  backgroundColor: slice.color ?? '#7C3AED',
                }}
                title={`${slice.name}: ${slice.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {plans.map((slice) => (
              <div key={slice.planId ?? slice.name} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: slice.color ?? '#7C3AED' }}
                />
                <span className="text-sm text-ink-600 dark:text-ink-300">{slice.name}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-ink-900 dark:text-white">
                  {slice.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * The members roster table (T4.2), reskinned to the Planflow "formacore"
 * reference. Server-rendered data, client-side interaction: the plan-mix bar +
 * segmented tabs (which write `status` to the URL), the search + filter row,
 * row selection feeding the CSV export, sortable column headers, and pagination —
 * all of which read/write the URL search params so the server page stays the
 * single source of truth. The data itself never mutates here; selection is the
 * only local state. Renders correctly with an empty roster.
 */
export function MembersTable({
  members,
  total,
  page,
  limit,
  planMix,
  counts,
  sort,
  dir,
  search,
  status,
  canWrite,
}: {
  members: MemberRow[];
  total: number;
  page: number;
  limit: number;
  planMix: MemberPlanMix;
  counts: MemberTabCounts;
  sort: MemberSort;
  dir: SortDir;
  search: string;
  status: string;
  canWrite: boolean;
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

  /** Navigate to a status segment, always resetting to page 1. */
  function selectTab(nextStatus: MemberStatus | ''): void {
    startTransition(() => router.replace(hrefWith({ status: nextStatus, page: '' })));
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
    if (sort !== key) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div className="flex flex-col gap-6">
      <PlanMixCard planMix={planMix} />

      {/* Segmented tabs-with-counts. */}
      <div
        role="tablist"
        aria-label="Filter by member state"
        className="inline-flex w-fit flex-wrap gap-1 rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
      >
        {TABS.map((tab) => {
          const active = tab.status === status || (tab.label === 'All' && status === '');
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(tab.status)}
              className={`inline-flex items-center gap-1.5 rounded-btn px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? `${ENGINE_GRADIENT} text-white shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]`
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
              <span
                className={`font-mono text-xs tabular-nums ${active ? 'text-white/80' : 'text-ink-400'}`}
              >
                {counts[tab.countKey]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + Filter row. */}
      <MembersFilters search={search} status={status} />

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

      {members.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Icon name="users" className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-ink-700 dark:text-ink-200">No members yet</p>
          <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
            {canWrite
              ? 'Add your first member, or adjust the filters above.'
              : 'No members match your filters yet.'}
          </p>
        </Card>
      ) : (
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
                  <th className="py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    Next billing
                  </th>
                  <th className="w-10 py-3 pr-5" aria-label="Actions" />
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
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200">
                          {initialsOf(member.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/members/${member.id}`}
                            className="block truncate font-medium text-ink-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300"
                          >
                            {member.name}
                          </Link>
                          <div className="truncate text-xs text-ink-500 dark:text-ink-400">
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusPill status={member.status} />
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                      {formatLastVisit(member.lastVisitAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <PlanCell plan={member.plan} />
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                      {nextBillingLabel(member)}
                    </td>
                    <td className="py-3 pr-5">
                      <Link
                        href={`/members/${member.id}`}
                        aria-label={`Open ${member.name}`}
                        className="grid h-8 w-8 place-items-center rounded-btn text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        <span aria-hidden className="text-lg leading-none">
                          ⋯
                        </span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Footer + pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          Showing {from}–{to} of {total} members
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
