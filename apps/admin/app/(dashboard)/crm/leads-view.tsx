'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  LeadRow,
  LeadSource,
  LeadStatus,
  LeadStatusCounts,
  ListLeadsQuery,
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
import { deleteLeadAction } from './actions';
import { CloseLeadDialog, type CloseKind } from './close-lead-dialog';
import { LeadFormDialog } from './lead-form-dialog';
import {
  LEAD_SOURCE_ICONS,
  LEAD_STATUS_TONES,
  daysInPipeline,
  formatDate,
  formatMoney,
  isFollowUpOverdue,
  isOpenLead,
  leadInitials,
} from './lead-meta';

/** An `(id, name)` option for the assigned-staff / location selectors. */
export interface SelectOption {
  id: string;
  name: string;
}

/** The status chips, mapped to the `status` URL param ('' = all). */
const STATUS_TABS: ReadonlyArray<'' | LeadStatus> = [
  '',
  'NEW',
  'CONTACTED',
  'TRIAL',
  'CONVERTED',
  'LOST',
];

/** The source filter options, mapped to the `source` URL param. */
const SOURCE_OPTIONS: readonly LeadSource[] = ['WALK_IN', 'INSTAGRAM', 'REFERRAL', 'WEBSITE'];

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
  sourceCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  sourceIcon: {
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
  overduePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-error)',
  },
  overdueDot: {
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error)',
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
  daysChip: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
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

/** Which dialog is up, and for which lead. */
type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; lead: LeadRow }
  | { kind: 'close'; close: CloseKind; lead: LeadRow }
  | { kind: 'delete'; lead: LeadRow }
  | null;

/**
 * The Leads tab (T12.3): status chips fed by the gym-wide per-status counts,
 * the search + source/location/assigned-staff filter row, the roster on the
 * Astryx DataTable kit, and — behind `CrmManage` — the add/edit form, the
 * Mark-Won / Mark-Lost close dialogs and delete. All list state (tab, search,
 * filters, sort, page) lives in the URL search params, so the server page
 * stays the single source of truth; only dialog visibility is local.
 */
export function LeadsView({
  leads,
  total,
  page,
  limit,
  counts,
  sort,
  dir,
  search,
  status,
  source,
  assignedToId,
  locationId,
  staffOptions,
  locationOptions,
  canManage,
}: {
  leads: LeadRow[];
  total: number;
  page: number;
  limit: number;
  counts: LeadStatusCounts;
  sort: ListLeadsQuery['sort'];
  dir: SortDir;
  search: string;
  status: string;
  source: string;
  assignedToId: string;
  locationId: string;
  staffOptions: SelectOption[];
  locationOptions: SelectOption[];
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

  /** Build a URL with one set of params overridden. */
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

  /** Push a single filter change to the URL, always resetting to page 1. */
  function commit(key: string, value: string): void {
    startTransition(() => router.replace(hrefWith({ [key]: value, page: '' })));
  }

  /** Toggle sort on a column: same column flips direction, a new column starts ascending. */
  function onSort(key: string): void {
    const nextDir = nextSortDir(sort === key, dir);
    startTransition(() => router.replace(hrefWith({ sort: key, dir: nextDir })));
  }

  function confirmDelete(lead: LeadRow): void {
    startDelete(async () => {
      const result = await deleteLeadAction(lead.id);
      if (result.ok) {
        setDialog(null);
        toast(t('list.leadDeleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const allCount = STATUS_TABS.filter((s): s is LeadStatus => s !== '').reduce(
    (sum, s) => sum + (counts[s] ?? 0),
    0,
  );
  const chips: FilterChip[] = STATUS_TABS.map((tab) => ({
    label: tab === '' ? t('tabs.all') : t(`status.${tab}`),
    value: tab,
    count: tab === '' ? allCount : (counts[tab] ?? 0),
  }));

  const columns: ReadonlyArray<Column<LeadRow>> = [
    {
      key: 'name',
      header: t('columns.lead'),
      sortKey: 'name',
      cell: (lead) => (
        <div {...stylex.props(styles.nameCell)}>
          <span {...stylex.props(styles.avatar)}>
            {leadInitials(lead.firstName, lead.lastName)}
          </span>
          <div {...stylex.props(styles.nameCol)}>
            <Link href={`/crm/leads/${lead.id}`} {...stylex.props(styles.nameLink)}>
              {lead.firstName} {lead.lastName}
            </Link>
            <div {...stylex.props(styles.subText)}>{lead.phone || lead.email || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'source',
      header: t('columns.source'),
      cell: (lead) => (
        <span {...stylex.props(styles.sourceCell)}>
          <Icon name={LEAD_SOURCE_ICONS[lead.source]} {...stylex.props(styles.sourceIcon)} />
          {t(`source.${lead.source}`)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (lead) => (
        <Badge tone={LEAD_STATUS_TONES[lead.status]}>{t(`status.${lead.status}`)}</Badge>
      ),
    },
    {
      key: 'interest',
      header: t('columns.interest'),
      cell: (lead) =>
        lead.interest ? lead.interest : <span {...stylex.props(styles.muted)}>—</span>,
    },
    {
      key: 'assignedTo',
      header: t('columns.assignedTo'),
      cell: (lead) =>
        lead.assignedTo ? (
          lead.assignedTo.name
        ) : (
          <span {...stylex.props(styles.muted)}>{t('list.unassigned')}</span>
        ),
    },
    {
      key: 'location',
      header: t('columns.location'),
      cell: (lead) =>
        lead.location ? lead.location.name : <span {...stylex.props(styles.muted)}>—</span>,
    },
    {
      key: 'followUpDate',
      header: t('columns.followUp'),
      sortKey: 'followUpDate',
      cell: (lead) =>
        isOpenLead(lead.status) && isFollowUpOverdue(lead.followUpDate) ? (
          <span {...stylex.props(styles.overduePill)}>
            <span aria-hidden {...stylex.props(styles.overdueDot)} />
            {formatDate(lead.followUpDate, locale)}
          </span>
        ) : (
          <span {...stylex.props(styles.dateMono)}>{formatDate(lead.followUpDate, locale)}</span>
        ),
    },
    {
      key: 'value',
      header: t('columns.value'),
      align: 'right',
      cell: (lead) => (
        <div {...stylex.props(styles.valueCol)}>
          <span {...stylex.props(styles.valueMain)}>{formatMoney(lead.expectedValue)}</span>
          <span {...stylex.props(styles.subText)}>
            {t('list.probability', { percent: lead.probability })}
          </span>
        </div>
      ),
    },
    {
      key: 'days',
      header: t('columns.days'),
      align: 'right',
      cell: (lead) => (
        <span {...stylex.props(styles.daysChip)}>
          {t('list.daysShort', { days: daysInPipeline(lead.createdAt) })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (lead) => (
        <div {...stylex.props(styles.actionsCell)}>
          {canManage && isOpenLead(lead.status) ? (
            <>
              <Btn
                v="ghost"
                size="icon"
                icon="check"
                aria-label={t('list.markWon', { name: `${lead.firstName} ${lead.lastName}` })}
                title={t('dialogs.wonTitle')}
                onClick={() => setDialog({ kind: 'close', close: 'won', lead })}
              />
              <Btn
                v="ghost"
                size="icon"
                icon="x"
                aria-label={t('list.markLost', { name: `${lead.firstName} ${lead.lastName}` })}
                title={t('dialogs.lostTitle')}
                onClick={() => setDialog({ kind: 'close', close: 'lost', lead })}
              />
            </>
          ) : null}
          {canManage ? (
            <>
              <Btn
                v="ghost"
                size="icon"
                icon="settings"
                aria-label={t('list.editLead', { name: `${lead.firstName} ${lead.lastName}` })}
                title={t('form.editTitle')}
                onClick={() => setDialog({ kind: 'edit', lead })}
              />
              <Btn
                v="ghost"
                size="icon"
                icon="trash"
                aria-label={t('list.deleteLead', { name: `${lead.firstName} ${lead.lastName}` })}
                title={t('list.delete')}
                onClick={() => setDialog({ kind: 'delete', lead })}
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
        <Icon name="filter" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('list.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canManage ? t('list.emptyHintWrite') : t('list.emptyHintRead')}
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
        ariaLabel={t('list.tablistLabel')}
      />

      {/* Search + Add Lead. */}
      <FilterBar>
        <TableSearch
          value={search}
          onSearch={(value) => commit('search', value)}
          placeholder={t('filters.searchPlaceholder')}
          ariaLabel={t('filters.searchLabel')}
          debounceMs={SEARCH_DEBOUNCE_MS}
        />
        {canManage ? (
          <Btn v="primary" size="md" icon="plus" onClick={() => setDialog({ kind: 'create' })}>
            {t('list.addLead')}
          </Btn>
        ) : null}
      </FilterBar>

      {/* Source / location / assigned-staff filters. */}
      <div {...stylex.props(styles.filterRow)}>
        <select
          value={source}
          onChange={(event) => commit('source', event.target.value)}
          aria-label={t('filters.sourceLabel')}
          {...stylex.props(styles.select)}
        >
          <option value="">{t('filters.allSources')}</option>
          {SOURCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`source.${option}`)}
            </option>
          ))}
        </select>

        {locationOptions.length > 0 ? (
          <select
            value={locationId}
            onChange={(event) => commit('locationId', event.target.value)}
            aria-label={t('filters.locationLabel')}
            {...stylex.props(styles.select)}
          >
            <option value="">{t('filters.allLocations')}</option>
            {locationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : null}

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

      <DataTable<LeadRow>
        columns={columns}
        rows={leads}
        rowKey={(lead) => lead.id}
        sort={sort}
        dir={dir}
        onSort={onSort}
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

      {/* Dialogs — one at a time, all gated by CrmManage server-side too. */}
      {dialog?.kind === 'create' ? (
        <LeadFormDialog
          mode="create"
          staffOptions={staffOptions}
          locationOptions={locationOptions}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <LeadFormDialog
          mode="edit"
          lead={dialog.lead}
          staffOptions={staffOptions}
          locationOptions={locationOptions}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'close' ? (
        <CloseLeadDialog
          kind={dialog.close}
          leadId={dialog.lead.id}
          leadName={`${dialog.lead.firstName} ${dialog.lead.lastName}`}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.lead);
          }
        }}
        title={t('list.deleteTitle')}
        message={
          dialog?.kind === 'delete'
            ? t('list.deleteMessage', {
                name: `${dialog.lead.firstName} ${dialog.lead.lastName}`,
              })
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
