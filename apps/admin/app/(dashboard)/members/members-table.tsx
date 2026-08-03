'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type {
  MemberBillingState,
  MemberPlan,
  MemberPlanMix,
  MemberRow,
  MemberSort,
  MemberKind,
  MemberTabCounts,
  SortDir,
} from '@fit/types';
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataTable,
  FilterChips,
  Icon,
  nextSortDir,
  useToast,
  type Column,
  type FilterChip,
  type Tone,
} from '@/components/ui';
import { MEMBER_TRASH_RETENTION_DAYS } from '@fit/types';
import { MembersFilters } from './members-filters';
import { bulkExportMembersAction, setMemberTrashedAction } from './actions';

/** Translator for the `admin.members` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/**
 * Visual treatment per standing — green for a paying member, slate for a guest,
 * amber for someone lapsed. This is the pill the roster shows: staff read the
 * roster to answer "who is this person to us?", and the account's own state
 * (invited / suspended) and the billing state are the finer detail behind it.
 */
const KIND_TONES: Record<MemberKind, Tone> = {
  MEMBER: 'success',
  GUEST: 'ink',
  INACTIVE: 'warning',
};

/** Fallback plan colour (brand accent) when a plan carries no colour of its own. */
const PLAN_FALLBACK = '#6257E3';

/**
 * The roster's segmented tabs, on the standing axis: member / guest / lapsed.
 *
 * These replaced the old status segments (Active / Trial / Expired), which mixed
 * two vocabularies — `GymMemberStatus` for some tabs and subscription state for
 * others — so two of them could describe the same person. "Frozen" survives as a
 * cross-cutting flag (a member whose plan is paused is still a member), and
 * "Trash" still switches the `view` param rather than a filter.
 */
const TABS: ReadonlyArray<{
  labelKey: string;
  value: string;
  countKey: keyof MemberTabCounts;
}> = [
  { labelKey: 'all', value: '', countKey: 'all' },
  { labelKey: 'member', value: 'MEMBER', countKey: 'member' },
  { labelKey: 'guest', value: 'GUEST', countKey: 'guest' },
  { labelKey: 'inactive', value: 'INACTIVE', countKey: 'inactive' },
  { labelKey: 'frozen', value: 'frozen', countKey: 'frozen' },
  { labelKey: 'trash', value: 'trash', countKey: 'trash' },
];

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  planCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  planHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  planMeta: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  planEmpty: {
    display: 'grid',
    minHeight: '4rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '1rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  planBar: {
    display: 'flex',
    height: '0.75rem',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  planSeg: {
    height: '100%',
  },
  planLegend: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: '1.25rem',
    rowGap: '0.5rem',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  swatch: {
    display: 'inline-block',
    height: '0.625rem',
    width: '0.625rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  legendName: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  legendCount: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  clearBtn: {
    borderWidth: 0,
    background: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  noticeCard: {
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-accent-muted)',
  },
  noticeText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-accent)',
  },
  errorCard: {
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatar: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
  },
  nameCol: {
    minWidth: 0,
  },
  nameLink: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  emailText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  lastVisit: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  planWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  planDot: {
    display: 'inline-block',
    height: '0.625rem',
    width: '0.625rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  planCellName: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  planCellDetail: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  overduePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-warning-muted)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-warning)',
  },
  overdueDot: {
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-warning)',
  },
  billingMono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  actionLink: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    color: 'var(--color-text-secondary)',
    textDecoration: 'none',
  },
  actionGlyph: {
    fontSize: '1.125rem',
    lineHeight: 1,
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.25rem',
  },
  rowActionBtn: {
    borderWidth: 0,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    cursor: 'pointer',
  },
  rowActionIcon: {
    width: '1rem',
    height: '1rem',
  },
  emptyWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    textAlign: 'center',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  emptyIconSvg: {
    width: '1.5rem',
    height: '1.5rem',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerCount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  pagerBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/** The standing pill mirroring the roster styling. */
function StatusPill({ kind }: { kind: MemberKind }) {
  const t = useTranslations('admin.members');
  return <Badge tone={KIND_TONES[kind]}>{t(`kind.${kind}`)}</Badge>;
}

/** Render a member's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * A friendly relative "last visit" — "2h ago" / "Today" / "6 days" / a date —
 * from an ISO instant, local to the staff member. `null` renders "Never".
 */
function formatLastVisit(iso: string | null, t: T, locale: string): string {
  if (!iso) return t('lastVisit.never');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return t('lastVisit.justNow');
  if (hours < 6) return t('lastVisit.hoursAgo', { hours });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) return t('lastVisit.today');
  if (dayDiff === 1) return t('lastVisit.yesterday');
  if (dayDiff < 14) return t('lastVisit.days', { count: dayDiff });
  return formatDate(iso, locale);
}

/**
 * The NEXT-BILLING cell — a due date, an em dash, or a status chip for a paused /
 * overdue subscription. `overdue` (a past-due dunning subscription) gets an amber
 * chip so a failed renewal stands out in the roster at a glance (T5.5).
 */
function NextBillingCell({
  row,
  t,
  locale,
}: {
  row: { nextBillingAt: string | null; billingState: MemberBillingState };
  t: T;
  locale: string;
}) {
  switch (row.billingState) {
    case 'overdue':
      return (
        <span {...stylex.props(styles.overduePill)}>
          <span aria-hidden {...stylex.props(styles.overdueDot)} />
          {t('billing.overdue')}
        </span>
      );
    case 'paused':
      return <span {...stylex.props(styles.muted)}>{t('billing.paused')}</span>;
    case 'due':
      return (
        <span {...stylex.props(styles.billingMono)}>{formatDate(row.nextBillingAt, locale)}</span>
      );
    case 'none':
    default:
      return <span {...stylex.props(styles.billingMono)}>—</span>;
  }
}

/** The PLAN cell — a colour dot + plan name + a small detail. */
function PlanCell({ plan }: { plan: MemberPlan | null }) {
  const t = useTranslations('admin.members');
  if (!plan) {
    return <span {...stylex.props(styles.muted)}>{t('list.noPlan')}</span>;
  }
  return (
    <div {...stylex.props(styles.planWrap)}>
      <span
        aria-hidden
        {...stylex.props(styles.planDot)}
        style={{ backgroundColor: plan.color ?? PLAN_FALLBACK }}
      />
      <span {...stylex.props(styles.planCellName)}>{plan.name}</span>
      <span {...stylex.props(styles.planCellDetail)}>{plan.detail}</span>
    </div>
  );
}

/** The gym-wide plan-mix bar card: a stacked bar + a legend with per-plan counts. */
function PlanMixCard({ planMix }: { planMix: MemberPlanMix }) {
  const t = useTranslations('admin.members');
  const { total, plans } = planMix;
  return (
    <Card variant="default" padding={0} xstyle={styles.planCard}>
      <div {...stylex.props(styles.planHead)}>
        <h2 {...stylex.props(styles.planLabel)}>{t('list.planMix')}</h2>
        <span {...stylex.props(styles.planMeta)}>
          {total} {t('list.paid')}
        </span>
      </div>

      {total === 0 ? (
        <div {...stylex.props(styles.planEmpty)}>{t('list.planMixEmpty')}</div>
      ) : (
        <>
          <div {...stylex.props(styles.planBar)}>
            {plans.map((slice) => (
              <span
                key={slice.planId ?? slice.name}
                {...stylex.props(styles.planSeg)}
                style={{
                  width: `${(slice.count / total) * 100}%`,
                  backgroundColor: slice.color ?? PLAN_FALLBACK,
                }}
                title={`${slice.name}: ${slice.count}`}
              />
            ))}
          </div>
          <div {...stylex.props(styles.planLegend)}>
            {plans.map((slice) => (
              <div key={slice.planId ?? slice.name} {...stylex.props(styles.legendItem)}>
                <span
                  aria-hidden
                  {...stylex.props(styles.swatch)}
                  style={{ backgroundColor: slice.color ?? PLAN_FALLBACK }}
                />
                <span {...stylex.props(styles.legendName)}>{slice.name}</span>
                <span {...stylex.props(styles.legendCount)}>{slice.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * The members roster table (T4.2), rebuilt on the Astryx DataTable + FilterChips +
 * TableSearch kit (T11.19). Server-rendered data, client-side interaction: the
 * plan-mix bar + segmented tabs (which write `status` to the URL), the search +
 * filter row, row selection feeding the CSV export, sortable column headers, and
 * pagination — all of which read/write the URL search params so the server page
 * stays the single source of truth. The data itself never mutates here; selection
 * is the only local state. Renders correctly with an empty roster.
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
  kind,
  view,
  frozen,
  planId,
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
  /** The active standing segment from the URL (`''` for All). */
  kind: string;
  view: string;
  frozen: boolean;
  planId: string;
  canWrite: boolean;
}) {
  const t = useTranslations('admin.members');
  const { toast } = useToast();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Roster row trash/restore. `rowPending` guards the in-flight action; `confirmTrashId`
  // is the member awaiting the destructive-trash confirm dialog (restore is direct).
  const [rowPending, startRowAction] = useTransition();
  const [confirmTrashId, setConfirmTrashId] = useState<string | null>(null);
  const isTrashView = view === 'trash';

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

  /** Navigate to a segment, always resetting to page 1. Each tab owns one filter
   *  dimension and clears the others so the segments stay mutually exclusive:
   *  "Trash" → `view`, "Frozen" → the `frozen` flag (subscription-derived, no
   *  status), everything else → `status` (empty for "All"). */
  function selectTab(nextValue: string): void {
    if (nextValue === 'trash') {
      startTransition(() =>
        router.replace(hrefWith({ view: 'trash', frozen: '', status: '', page: '' })),
      );
      return;
    }
    if (nextValue === 'frozen') {
      startTransition(() =>
        router.replace(hrefWith({ frozen: 'true', view: '', status: '', page: '' })),
      );
      return;
    }
    startTransition(() =>
      router.replace(hrefWith({ kind: nextValue, view: '', frozen: '', status: '', page: '' })),
    );
  }

  /** Move a member to trash / restore from it; refreshes the roster and toasts. */
  function setRowTrashed(id: string, trashed: boolean): void {
    startRowAction(async () => {
      const result = await setMemberTrashedAction(id, trashed);
      if (result.ok) {
        setConfirmTrashId(null);
        toast(trashed ? t('trash.toastTrashed') : t('trash.toastRestored'), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
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
          ids.length > 0
            ? t('list.exportStartedSelected', { count: ids.length, jobId: result.data.jobId })
            : t('list.exportStartedAll', { jobId: result.data.jobId }),
        );
      } else {
        setExportError(result.error);
      }
    });
  }

  /** Toggle sort on a column: same column flips direction, a new column starts ascending. */
  function onSort(key: string): void {
    const nextDir = nextSortDir(sort === key, dir);
    startTransition(() => router.replace(hrefWith({ sort: key, dir: nextDir })));
  }

  const chips: FilterChip[] = TABS.map((tab) => ({
    label: t(`tabs.${tab.labelKey}`),
    value: tab.value,
    count: counts[tab.countKey],
  }));

  const columns: ReadonlyArray<Column<MemberRow>> = [
    {
      key: 'name',
      header: t('columns.name'),
      sortKey: 'name',
      cell: (member) => (
        <div {...stylex.props(styles.nameCell)}>
          <span {...stylex.props(styles.avatar)}>{initialsOf(member.name)}</span>
          <div {...stylex.props(styles.nameCol)}>
            <Link href={`/members/${member.id}`} {...stylex.props(styles.nameLink)}>
              {member.name}
            </Link>
            <div {...stylex.props(styles.emailText)}>{member.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      sortKey: 'status',
      cell: (member) => <StatusPill kind={member.kind} />,
    },
    {
      key: 'lastVisitAt',
      header: t('columns.lastVisitAt'),
      sortKey: 'lastVisitAt',
      cell: (member) => (
        <span {...stylex.props(styles.lastVisit)}>
          {formatLastVisit(member.lastVisitAt, t, locale)}
        </span>
      ),
    },
    {
      key: 'plan',
      header: t('list.columnPlan'),
      cell: (member) => <PlanCell plan={member.plan} />,
    },
    {
      key: 'nextBilling',
      header: t('list.columnNextBilling'),
      cell: (member) => <NextBillingCell row={member} t={t} locale={locale} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (member) => (
        <div {...stylex.props(styles.rowActions)}>
          {canWrite && isTrashView ? (
            <Btn
              v="outline"
              size="sm"
              icon="arrowLeft"
              onClick={() => setRowTrashed(member.id, false)}
              disabled={rowPending}
            >
              {t('trash.restore')}
            </Btn>
          ) : null}
          {canWrite && !isTrashView ? (
            <button
              type="button"
              aria-label={t('trash.moveToTrashOf', { name: member.name })}
              onClick={() => setConfirmTrashId(member.id)}
              disabled={rowPending}
              {...stylex.props(styles.actionLink, styles.rowActionBtn)}
            >
              <Icon name="trash" sw={2} {...stylex.props(styles.rowActionIcon)} />
            </button>
          ) : null}
          <Link
            href={`/members/${member.id}`}
            aria-label={t('list.openMember', { name: member.name })}
            {...stylex.props(styles.actionLink)}
          >
            <span aria-hidden {...stylex.props(styles.actionGlyph)}>
              ⋯
            </span>
          </Link>
        </div>
      ),
    },
  ];

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  const emptyState = (
    <div {...stylex.props(styles.emptyWrap)}>
      <span {...stylex.props(styles.emptyIcon)}>
        <Icon name="users" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('list.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canWrite ? t('list.emptyHintWrite') : t('list.emptyHintRead')}
      </p>
    </div>
  );

  return (
    <div {...stylex.props(styles.stack)}>
      <PlanMixCard planMix={planMix} />

      {/* Segmented tabs-with-counts. */}
      <FilterChips
        chips={chips}
        active={isTrashView ? 'trash' : frozen ? 'frozen' : kind}
        onSelect={selectTab}
        ariaLabel={t('list.tablistLabel')}
      />

      {/* Search + Filter row. Hidden in the trash view — the status/plan filters
          describe the live roster, not the soft-deleted list. */}
      {isTrashView ? null : (
        <MembersFilters search={search} kind={kind} planId={planId} plans={planMix.plans} />
      )}

      {/* Selection + export toolbar. */}
      <div {...stylex.props(styles.toolbar)}>
        <Btn v="outline" size="sm" icon="download" onClick={exportSelected} disabled={exporting}>
          {exporting
            ? t('list.exportStarting')
            : selected.size > 0
              ? t('list.exportSelected', { count: selected.size })
              : t('list.exportAll')}
        </Btn>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            {...stylex.props(styles.clearBtn)}
          >
            {t('list.clearSelection')}
          </button>
        ) : null}
      </div>

      {exportNote ? (
        <Card variant="default" padding={0} xstyle={styles.noticeCard}>
          <p role="status" {...stylex.props(styles.noticeText)}>
            {exportNote}
          </p>
        </Card>
      ) : null}
      {exportError ? (
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <p role="alert" {...stylex.props(styles.errorText)}>
            {exportError}
          </p>
        </Card>
      ) : null}

      <DataTable<MemberRow>
        columns={columns}
        rows={members}
        rowKey={(member) => member.id}
        sort={sort}
        dir={dir}
        onSort={onSort}
        selection={{
          selectedIds: selected,
          allSelected,
          onToggle: toggleRow,
          onToggleAll: toggleAll,
          selectAllLabel: t('list.selectAll'),
        }}
        empty={emptyState}
        caption={t('list.tablistLabel')}
      />

      {/* Footer + pager. */}
      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>{t('list.showing', { from, to, total })}</span>
        <div {...stylex.props(styles.pagerBtns)}>
          <Btn
            v="outline"
            size="sm"
            icon="chevronLeft"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
          >
            {t('list.previous')}
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
            {t('list.next')}
          </Btn>
        </div>
      </div>

      {/* Confirm dialog for the destructive roster-row "Move to trash" action. */}
      <ConfirmDialog
        open={confirmTrashId !== null}
        onClose={() => setConfirmTrashId(null)}
        onConfirm={() => {
          if (confirmTrashId) {
            setRowTrashed(confirmTrashId, true);
          }
        }}
        title={t('trash.confirmTitle')}
        message={t('trash.confirmMessage', { days: MEMBER_TRASH_RETENTION_DAYS })}
        confirmLabel={t('trash.moveToTrash')}
        cancelLabel={t('form.cancel')}
        danger
        busy={rowPending}
      />
    </div>
  );
}
