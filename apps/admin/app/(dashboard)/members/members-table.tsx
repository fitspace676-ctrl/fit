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
import { Badge, Btn, Card, Dot, Icon, buttonClasses, type Tone } from '@/components/ui';
import { Glyph } from './glyphs';
import { MembersFilters } from './members-filters';
import { bulkExportMembersAction } from './actions';

/** Visual treatment per member status — the reference's badge tone + dot colour. */
const STATUS_STYLES: Record<MemberStatus, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', dot: 'bg-success-400' },
  INVITED: { label: 'Trial', tone: 'iris', dot: 'bg-iris-400' },
  SUSPENDED: { label: 'Expired', tone: 'danger', dot: 'bg-danger-400' },
};

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

/** The reference's table-header cell treatment. */
const TH_CLASS =
  'px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400';

/** A status pill mirroring the reference's dot-in-badge styling. */
function StatusPill({ status }: { status: MemberStatus }) {
  const { label, tone, dot } = STATUS_STYLES[status];
  return (
    <Badge tone={tone}>
      <Dot c={dot} />
      {label}
    </Badge>
  );
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

/** The NEXT-BILLING cell — a date, a paused/overdue label, or an em dash. */
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

/** The PLAN cell — the reference's colour square + plan name + a small detail. */
function PlanCell({ plan }: { plan: MemberPlan | null }) {
  if (!plan) {
    return <span className="text-ink-400 dark:text-ink-500">No plan</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-sm"
        style={{ backgroundColor: plan.color ?? '#7C3AED' }}
      />
      <span className="text-ink-900 dark:text-white">{plan.name}</span>
      <span className="hidden text-xs text-ink-400 dark:text-ink-500 lg:inline">
        · {plan.detail}
      </span>
    </div>
  );
}

/** The gym-wide plan-mix bar card: a stacked bar + a legend with per-plan counts. */
function PlanMixCard({ planMix }: { planMix: MemberPlanMix }) {
  const { total, plans } = planMix;
  return (
    <Card glow className="p-4 sm:p-5">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
          Plan mix
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
          {total.toLocaleString()} paid
        </span>
      </div>

      {total === 0 ? (
        <div className="grid min-h-16 place-items-center rounded-field border border-dashed border-ink-200 px-4 py-4 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
          No paid subscriptions yet.
        </div>
      ) : (
        <>
          <div className="flex h-2.5 w-full overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
            {plans.map((slice) => (
              <span
                key={slice.planId ?? slice.name}
                className="h-full"
                style={{
                  width: `${(slice.count / total) * 100}%`,
                  backgroundColor: slice.color ?? '#7C3AED',
                }}
                title={`${slice.name}: ${slice.count}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {plans.map((slice) => (
              <div key={slice.planId ?? slice.name} className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: slice.color ?? '#7C3AED' }}
                />
                <span className="text-ink-600 dark:text-ink-300">{slice.name}</span>
                <span
                  className="font-mono font-semibold tabular-nums"
                  style={{ color: slice.color ?? '#7C3AED' }}
                >
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

/** The reference's custom checkbox treatment, applied to a real input. */
const CHECKBOX_CLASS =
  'h-[18px] w-[18px] rounded-[5px] border-ink-300 accent-brand-500 dark:border-white/25';

/**
 * The members roster table (T4.2), reskinned to the Planflow "formacore"
 * reference. Server-rendered data, client-side interaction: the plan-mix bar,
 * one toolbar row of segmented tabs (which write `status` to the URL) + search +
 * filter + export, row selection feeding the floating bulk-action bar's CSV
 * export, sortable column headers, and pagination — all of which read/write the
 * URL search params so the server page stays the single source of truth. The data
 * itself never mutates here; selection is the only local state. Renders correctly
 * with an empty roster.
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
  const filtered = Boolean(search || status);

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

  /** A sortable header label wrapped in the sort link. */
  function sortableHeader(key: MemberSort, label: string) {
    return (
      <Link
        href={sortHref(key)}
        scroll={false}
        className="inline-flex items-center hover:text-ink-700 dark:hover:text-ink-200"
      >
        {label}
        <span aria-hidden>{sortIndicator(key)}</span>
      </Link>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div className="flex flex-col gap-5">
      <PlanMixCard planMix={planMix} />

      {/* Toolbar: segmented tabs + search + filter + export, one wrapping row. */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filter by member state"
          className="inline-flex overflow-x-auto rounded-btn bg-ink-100 p-1 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.06] dark:ring-white/10"
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
                className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-white text-ink-900 shadow-sm dark:text-ink-950'
                    : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                }`}
              >
                {tab.label}
                <span className="font-mono text-[11px] tabular-nums text-ink-400 dark:text-ink-500">
                  {counts[tab.countKey]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + Filter (right-aligned, per the reference toolbar). */}
        <MembersFilters search={search} status={status} />

        {/* Export-all is real functionality with no reference slot — kept beside the filter. */}
        <Btn v="outline" size="sm" icon="download" onClick={exportSelected} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export'}
        </Btn>
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
        <Card className="px-6 py-16 text-center">
          <div className="relative mx-auto grid h-14 w-14 place-items-center">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-brand-500/20 blur-2xl"
            />
            <Icon
              name="search"
              className="relative h-12 w-12 text-ink-400 dark:text-ink-300"
              sw={1.8}
            />
          </div>
          <p className="mt-4 font-display text-lg font-bold text-ink-900 dark:text-white">
            No members found
          </p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500 dark:text-ink-400">
            {filtered
              ? `No one matches ${search ? `“${search}”` : 'these filters'}. Try a different search or filter.`
              : canWrite
                ? 'No members on the roster yet — add your first member.'
                : 'No members on the roster yet.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {filtered ? (
              <Btn
                v="outline"
                size="sm"
                onClick={() =>
                  startTransition(() =>
                    router.replace(hrefWith({ search: '', status: '', page: '' })),
                  )
                }
              >
                Clear filters
              </Btn>
            ) : null}
            {canWrite ? (
              <Link href="/members/new" className={buttonClasses('primary', 'sm')}>
                <Icon name="plus" className="h-4 w-4" sw={2} />
                Add member
              </Link>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 dark:border-white/10">
                  <th className="w-10 py-3 pl-5 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Select all members on this page"
                      checked={allSelected}
                      onChange={toggleAll}
                      className={CHECKBOX_CLASS}
                    />
                  </th>
                  <th className={TH_CLASS}>{sortableHeader('name', 'Member')}</th>
                  <th className={TH_CLASS}>Plan</th>
                  <th className={TH_CLASS}>{sortableHeader('status', 'Status')}</th>
                  <th className={`${TH_CLASS} hidden md:table-cell`}>
                    {sortableHeader('lastVisitAt', 'Last visit')}
                  </th>
                  <th className={`${TH_CLASS} hidden md:table-cell`}>Next billing</th>
                  <th className="w-10 py-3 pr-5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.id}
                    className={`border-b last:border-0 ${
                      selected.has(member.id)
                        ? 'border-ink-100 bg-brand-50/60 dark:border-white/5 dark:bg-brand-500/[0.06]'
                        : 'border-ink-100 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]'
                    } transition`}
                  >
                    <td className="py-3 pl-5 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${member.name}`}
                        checked={selected.has(member.id)}
                        onChange={() => toggleRow(member.id)}
                        className={CHECKBOX_CLASS}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-1 ring-ink-900/10 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-white/10">
                          {initialsOf(member.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/members/${member.id}`}
                            className="block truncate font-semibold text-ink-900 transition hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                          >
                            {member.name}
                          </Link>
                          <div className="truncate text-xs text-ink-500 dark:text-ink-400">
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PlanCell plan={member.plan} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={member.status} />
                    </td>
                    <td className="hidden px-4 py-3 text-ink-500 dark:text-ink-400 md:table-cell">
                      {formatLastVisit(member.lastVisitAt)}
                    </td>
                    <td
                      className={`hidden px-4 py-3 font-mono text-xs tabular-nums md:table-cell ${
                        member.billingState === 'overdue'
                          ? 'text-danger-400'
                          : 'text-ink-500 dark:text-ink-400'
                      }`}
                    >
                      {nextBillingLabel(member)}
                    </td>
                    <td className="px-4 py-3 pr-5 text-right">
                      <Link
                        href={`/members/${member.id}`}
                        aria-label={`Open ${member.name}`}
                        className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <Glyph name="dots" className="h-5 w-5" sw={2.2} />
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
      <div className="flex items-center justify-between gap-3">
        <span className="px-1 text-xs text-ink-400 dark:text-ink-500">
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

      {/* Floating bulk-action bar — appears when rows are selected (reference). */}
      <div
        className={`fixed bottom-5 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
          selected.size > 0
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2.5 rounded-card bg-ink-900 px-3 py-2.5 text-white ring-1 ring-white/10 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.8)]">
          <span className="inline-grid h-[26px] min-w-[26px] place-items-center rounded-pill bg-brand-500 px-1.5 text-xs font-bold tabular-nums text-white">
            {selected.size}
          </span>
          <span className="hidden text-sm font-medium text-ink-300 sm:inline">selected</span>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-white/15" />
          <button
            type="button"
            onClick={exportSelected}
            disabled={exporting}
            className="inline-flex h-9 items-center gap-1.5 rounded-btn px-2.5 text-sm font-semibold text-ink-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40 sm:px-3"
          >
            <Icon name="download" className="h-4 w-4" sw={2} />
            <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
            className="ml-0.5 grid h-8 w-8 place-items-center rounded-btn text-ink-400 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" sw={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}
