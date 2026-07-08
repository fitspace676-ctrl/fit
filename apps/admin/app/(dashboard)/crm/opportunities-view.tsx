'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  ListOpportunitiesQuery,
  OpportunityRow,
  OpportunityStatus,
  OpportunityStatusCounts,
  OpportunityType,
  SortDir,
} from '@fit/types';
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataTable,
  FilterBar,
  FilterChips,
  Icon,
  TableSearch,
  nextSortDir,
  useToast,
  type Column,
  type FilterChip,
} from '@/components/ui';
import { deleteOpportunityAction } from './actions';
import { CloseOpportunityDialog, type CloseKind } from './close-opportunity-dialog';
import { OpportunityFormDialog } from './opportunity-form-dialog';
import { formatDate, formatMoney } from './lead-meta';
import {
  OPPORTUNITY_STATUS_TONES,
  OPPORTUNITY_TYPE_ICONS,
  isOpenOpportunity,
  memberInitials,
} from './opportunity-meta';
import type { SelectOption } from './leads-view';

/** The status chips, mapped to the `status` URL param ('' = all). */
const STATUS_TABS: ReadonlyArray<'' | OpportunityStatus> = [
  '',
  'INTERESTED',
  'PROPOSAL_SENT',
  'DECISION_PENDING',
  'WON',
  'LOST',
];

/** The type filter options, mapped to the `type` URL param. */
const TYPE_OPTIONS: readonly OpportunityType[] = [
  'MEMBERSHIP_UPGRADE',
  'PT_SESSIONS',
  'SERVICE_PACKAGE',
  'OTHER',
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  select: {
    height: '2.75rem',
    minWidth: '10rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
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
  subText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  typeCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  typeIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  dateMono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  valueCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.125rem',
  },
  valueMain: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  probCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    justifyContent: 'flex-end',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  probTrack: {
    position: 'relative',
    height: '0.375rem',
    width: '3rem',
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  probFill: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
  },
  actionsCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
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

/** Which dialog is up, and for which opportunity. */
type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; opportunity: OpportunityRow }
  | { kind: 'close'; close: CloseKind; opportunity: OpportunityRow }
  | { kind: 'delete'; opportunity: OpportunityRow }
  | null;

/**
 * The Opportunities tab (T12.4): status chips fed by the gym-wide per-status
 * counts, the search + type/assigned-staff filter row, the roster on the Astryx
 * DataTable kit, and — behind `CrmManage` — the add/edit form, the Mark-Won /
 * Mark-Lost close dialogs and delete. All list state (tab, search, filters,
 * sort, page) lives in the URL search params, so the server page stays the
 * single source of truth; only dialog visibility is local.
 */
export function OpportunitiesView({
  opportunities,
  total,
  page,
  limit,
  counts,
  sort,
  dir,
  search,
  status,
  type,
  assignedToId,
  memberOptions,
  staffOptions,
  canManage,
}: {
  opportunities: OpportunityRow[];
  total: number;
  page: number;
  limit: number;
  counts: OpportunityStatusCounts;
  sort: ListOpportunitiesQuery['sort'];
  dir: SortDir;
  search: string;
  status: string;
  type: string;
  assignedToId: string;
  memberOptions: SelectOption[];
  staffOptions: SelectOption[];
  canManage: boolean;
}) {
  const t = useTranslations('admin.crm');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);

  /** Build a URL with one set of params overridden (keeping the active tab). */
  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'opportunities');
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

  /** Push a single filter change to the URL, always resetting to page 1. */
  function commit(key: string, value: string): void {
    startTransition(() => router.replace(hrefWith({ [key]: value, page: '' })));
  }

  /** Toggle sort on a column: same column flips direction, a new column starts ascending. */
  function onSort(key: string): void {
    const nextDir = nextSortDir(sort === key, dir);
    startTransition(() => router.replace(hrefWith({ sort: key, dir: nextDir })));
  }

  function confirmDelete(opportunity: OpportunityRow): void {
    startDelete(async () => {
      const result = await deleteOpportunityAction(opportunity.id);
      if (result.ok) {
        setDialog(null);
        toast(t('opportunityList.deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const allCount = STATUS_TABS.filter((s): s is OpportunityStatus => s !== '').reduce(
    (sum, s) => sum + (counts[s] ?? 0),
    0,
  );
  const chips: FilterChip[] = STATUS_TABS.map((tab) => ({
    label: tab === '' ? t('tabs.all') : t(`opportunityStatus.${tab}`),
    value: tab,
    count: tab === '' ? allCount : (counts[tab] ?? 0),
  }));

  const columns: ReadonlyArray<Column<OpportunityRow>> = [
    {
      key: 'member',
      header: t('opportunityColumns.member'),
      cell: (opportunity) => (
        <div {...stylex.props(styles.nameCell)}>
          <span {...stylex.props(styles.avatar)}>{memberInitials(opportunity.member.name)}</span>
          <div {...stylex.props(styles.nameCol)}>
            <Link href={`/crm/opportunities/${opportunity.id}`} {...stylex.props(styles.nameLink)}>
              {opportunity.member.name}
            </Link>
            <div {...stylex.props(styles.subText)}>{opportunity.description || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('opportunityColumns.type'),
      cell: (opportunity) => (
        <span {...stylex.props(styles.typeCell)}>
          <Icon
            name={OPPORTUNITY_TYPE_ICONS[opportunity.type]}
            {...stylex.props(styles.typeIcon)}
          />
          {t(`opportunityType.${opportunity.type}`)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('opportunityColumns.status'),
      cell: (opportunity) => (
        <Badge tone={OPPORTUNITY_STATUS_TONES[opportunity.status]}>
          {t(`opportunityStatus.${opportunity.status}`)}
        </Badge>
      ),
    },
    {
      key: 'assignedTo',
      header: t('opportunityColumns.assignedTo'),
      cell: (opportunity) =>
        opportunity.assignedTo ? (
          opportunity.assignedTo.name
        ) : (
          <span {...stylex.props(styles.muted)}>{t('list.unassigned')}</span>
        ),
    },
    {
      key: 'expectedCloseDate',
      header: t('opportunityColumns.expectedClose'),
      sortKey: 'expectedCloseDate',
      cell: (opportunity) => (
        <span {...stylex.props(styles.dateMono)}>
          {formatDate(opportunity.expectedCloseDate, locale)}
        </span>
      ),
    },
    {
      key: 'probability',
      header: t('opportunityColumns.probability'),
      align: 'right',
      cell: (opportunity) => (
        <span {...stylex.props(styles.probCell)}>
          <span {...stylex.props(styles.probTrack)}>
            <span
              {...stylex.props(styles.probFill)}
              style={{ width: `${opportunity.probability}%` }}
            />
          </span>
          {opportunity.probability}%
        </span>
      ),
    },
    {
      key: 'value',
      header: t('opportunityColumns.value'),
      align: 'right',
      sortKey: 'value',
      cell: (opportunity) => (
        <div {...stylex.props(styles.valueCol)}>
          <span {...stylex.props(styles.valueMain)}>{formatMoney(opportunity.value)}</span>
          <span {...stylex.props(styles.subText)}>
            {t('opportunityList.weighted', {
              amount: formatMoney(Math.round((opportunity.value * opportunity.probability) / 100)),
            })}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (opportunity) => (
        <div {...stylex.props(styles.actionsCell)}>
          {canManage && isOpenOpportunity(opportunity.status) ? (
            <>
              <Btn
                v="ghost"
                size="icon"
                icon="check"
                aria-label={t('opportunityList.markWon', { name: opportunity.member.name })}
                title={t('opportunityDialogs.wonTitle')}
                onClick={() => setDialog({ kind: 'close', close: 'won', opportunity })}
              />
              <Btn
                v="ghost"
                size="icon"
                icon="x"
                aria-label={t('opportunityList.markLost', { name: opportunity.member.name })}
                title={t('opportunityDialogs.lostTitle')}
                onClick={() => setDialog({ kind: 'close', close: 'lost', opportunity })}
              />
            </>
          ) : null}
          {canManage ? (
            <>
              <Btn
                v="ghost"
                size="icon"
                icon="settings"
                aria-label={t('opportunityList.edit', { name: opportunity.member.name })}
                title={t('opportunityForm.editTitle')}
                onClick={() => setDialog({ kind: 'edit', opportunity })}
              />
              <Btn
                v="ghost"
                size="icon"
                icon="trash"
                aria-label={t('opportunityList.delete', { name: opportunity.member.name })}
                title={t('list.delete')}
                onClick={() => setDialog({ kind: 'delete', opportunity })}
              />
            </>
          ) : null}
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
        <Icon name="target" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('opportunityList.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canManage ? t('opportunityList.emptyHintWrite') : t('opportunityList.emptyHintRead')}
      </p>
    </div>
  );

  return (
    <div {...stylex.props(styles.stack)}>
      {/* Status chips with gym-wide counts. */}
      <FilterChips
        chips={chips}
        active={status}
        onSelect={(value) => commit('status', value)}
        ariaLabel={t('opportunityList.tablistLabel')}
      />

      {/* Search + Add Opportunity. */}
      <FilterBar>
        <TableSearch
          value={search}
          onSearch={(value) => commit('search', value)}
          placeholder={t('opportunityFilters.searchPlaceholder')}
          ariaLabel={t('opportunityFilters.searchLabel')}
          debounceMs={SEARCH_DEBOUNCE_MS}
        />
        {canManage ? (
          <Btn v="primary" size="md" icon="plus" onClick={() => setDialog({ kind: 'create' })}>
            {t('opportunityList.add')}
          </Btn>
        ) : null}
      </FilterBar>

      {/* Type / assigned-staff filters. */}
      <div {...stylex.props(styles.filterRow)}>
        <select
          value={type}
          onChange={(event) => commit('type', event.target.value)}
          aria-label={t('opportunityFilters.typeLabel')}
          {...stylex.props(styles.select)}
        >
          <option value="">{t('opportunityFilters.allTypes')}</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`opportunityType.${option}`)}
            </option>
          ))}
        </select>

        {staffOptions.length > 0 ? (
          <select
            value={assignedToId}
            onChange={(event) => commit('assignedToId', event.target.value)}
            aria-label={t('filters.assignedToLabel')}
            {...stylex.props(styles.select)}
          >
            <option value="">{t('filters.allStaff')}</option>
            {staffOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <DataTable<OpportunityRow>
        columns={columns}
        rows={opportunities}
        rowKey={(opportunity) => opportunity.id}
        sort={sort}
        dir={dir}
        onSort={onSort}
        empty={emptyState}
        caption={t('opportunityList.tablistLabel')}
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

      {/* Dialogs — one at a time, all gated by CrmManage server-side too. */}
      {dialog?.kind === 'create' ? (
        <OpportunityFormDialog
          mode="create"
          memberOptions={memberOptions}
          staffOptions={staffOptions}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <OpportunityFormDialog
          mode="edit"
          opportunity={dialog.opportunity}
          staffOptions={staffOptions}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'close' ? (
        <CloseOpportunityDialog
          kind={dialog.close}
          opportunityId={dialog.opportunity.id}
          memberName={dialog.opportunity.member.name}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.opportunity);
          }
        }}
        title={t('opportunityList.deleteTitle')}
        message={
          dialog?.kind === 'delete'
            ? t('opportunityList.deleteMessage', { name: dialog.opportunity.member.name })
            : ''
        }
        confirmLabel={t('list.delete')}
        cancelLabel={t('form.cancel')}
        danger
        busy={deleting}
      />
    </div>
  );
}
