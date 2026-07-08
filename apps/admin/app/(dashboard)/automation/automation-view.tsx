'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AutomationRuleRow, ListAutomationRulesQuery, SortDir } from '@fit/types';
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
import { deleteAutomationRuleAction, toggleAutomationRuleAction } from './actions';
import { RuleFormDialog } from './rule-form-dialog';
import { SaveTemplateDialog } from './save-template-dialog';
import {
  CATEGORY_KEY,
  CATEGORY_TONES,
  ACTION_ICONS,
  formatDate,
  triggerCategory,
} from './automation-meta';

/** The active-state chips, mapped to the `active` URL param ('' = all). */
const ACTIVE_TABS: readonly string[] = ['', 'true', 'false'];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  ruleIcon: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  ruleIconMuted: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  ruleIconSvg: {
    width: '1.125rem',
    height: '1.125rem',
  },
  ruleName: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  triggerCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    alignItems: 'flex-start',
  },
  triggerLabel: {
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  badgeRow: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
  },
  actionCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  actionIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
  },
  statusCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  switch: {
    position: 'relative',
    height: '1.5rem',
    width: '2.75rem',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    backgroundColor: 'var(--color-border)',
    transition: 'background-color 150ms ease',
  },
  switchOn: {
    backgroundColor: 'var(--color-accent)',
  },
  switchDisabled: {
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  knob: {
    position: 'absolute',
    top: '0.1875rem',
    left: '0.1875rem',
    height: '1.125rem',
    width: '1.125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: '#ffffff',
    transition: 'transform 150ms ease',
    transform: 'translateX(0)',
  },
  knobOn: {
    transform: 'translateX(1.25rem)',
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  dateMono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.8125rem',
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

/** Which dialog is up, and for which rule. */
type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; rule: AutomationRuleRow }
  | { kind: 'template'; rule: AutomationRuleRow }
  | { kind: 'delete'; rule: AutomationRuleRow }
  | null;

/**
 * The Automation Rules list (T12.6): active-state chips, the search + Add row,
 * the rules roster on the Astryx DataTable with a per-row active toggle and
 * category/timing badges, and — behind `AutomationManage` — the create/edit
 * builder, save-as-template and delete. All list state (search, active, sort,
 * page) lives in the URL, so the server page stays the single source of truth.
 */
export function AutomationView({
  rules,
  total,
  page,
  limit,
  sort,
  dir,
  search,
  active,
  canManage,
}: {
  rules: AutomationRuleRow[];
  total: number;
  page: number;
  limit: number;
  sort: ListAutomationRulesQuery['sort'];
  dir: SortDir;
  search: string;
  active: string;
  canManage: boolean;
}) {
  const t = useTranslations('admin.automation');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  function onSort(key: string): void {
    const nextDir = nextSortDir(sort === key, dir);
    startTransition(() => router.replace(hrefWith({ sort: key, dir: nextDir })));
  }

  function toggleActive(rule: AutomationRuleRow): void {
    if (!canManage || toggling) return;
    setTogglingId(rule.id);
    startToggle(async () => {
      const result = await toggleAutomationRuleAction(rule.id, !rule.active);
      setTogglingId(null);
      if (result.ok) {
        toast(result.data.active ? t('list.activated') : t('list.deactivated'), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmDelete(rule: AutomationRuleRow): void {
    startDelete(async () => {
      const result = await deleteAutomationRuleAction(rule.id);
      if (result.ok) {
        setDialog(null);
        toast(t('list.deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const chips: FilterChip[] = ACTIVE_TABS.map((tab) => ({
    label: tab === '' ? t('tabs.all') : tab === 'true' ? t('tabs.active') : t('tabs.inactive'),
    value: tab,
  }));

  const columns: ReadonlyArray<Column<AutomationRuleRow>> = [
    {
      key: 'name',
      header: t('columns.name'),
      sortKey: 'name',
      cell: (rule) => (
        <div {...stylex.props(styles.nameCell)}>
          <span {...stylex.props(styles.ruleIcon, !rule.active && styles.ruleIconMuted)}>
            <Icon name="bolt" {...stylex.props(styles.ruleIconSvg)} />
          </span>
          <span {...stylex.props(styles.ruleName)}>{rule.name}</span>
        </div>
      ),
    },
    {
      key: 'trigger',
      header: t('columns.trigger'),
      cell: (rule) => {
        const category = triggerCategory(rule.triggerType);
        const days = rule.triggerConfig?.days;
        return (
          <div {...stylex.props(styles.triggerCell)}>
            <span {...stylex.props(styles.triggerLabel)}>
              {t(`triggers.${rule.triggerType}`)}
              {days !== undefined ? ` (${days})` : ''}
            </span>
            <span {...stylex.props(styles.badgeRow)}>
              <Badge tone={CATEGORY_TONES[category]}>
                {t(`categories.${CATEGORY_KEY[category]}`)}
              </Badge>
              {rule.timingOffset !== 'day_of' ? (
                <Badge tone="ink">{t(`timings.${rule.timingOffset}`)}</Badge>
              ) : null}
            </span>
          </div>
        );
      },
    },
    {
      key: 'action',
      header: t('columns.action'),
      cell: (rule) => (
        <span {...stylex.props(styles.actionCell)}>
          <Icon name={ACTION_ICONS[rule.actionType]} {...stylex.props(styles.actionIcon)} />
          {t(`actions.${rule.actionType}`)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (rule) => (
        <span {...stylex.props(styles.statusCell)}>
          <button
            type="button"
            role="switch"
            aria-checked={rule.active}
            aria-label={t('list.toggleLabel', { name: rule.name })}
            disabled={!canManage || (toggling && togglingId === rule.id)}
            onClick={() => toggleActive(rule)}
            {...stylex.props(
              styles.switch,
              rule.active && styles.switchOn,
              !canManage && styles.switchDisabled,
            )}
          >
            <span {...stylex.props(styles.knob, rule.active && styles.knobOn)} />
          </button>
          <Badge tone={rule.active ? 'success' : 'ink'}>
            {rule.active ? t('status.active') : t('status.inactive')}
          </Badge>
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: t('columns.createdBy'),
      cell: (rule) =>
        rule.createdBy ? (
          rule.createdBy.name
        ) : (
          <span {...stylex.props(styles.muted)}>{t('list.systemAuthor')}</span>
        ),
    },
    {
      key: 'createdAt',
      header: t('columns.created'),
      sortKey: 'createdAt',
      cell: (rule) => (
        <span {...stylex.props(styles.dateMono)}>{formatDate(rule.createdAt, locale)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (rule) =>
        canManage ? (
          <div {...stylex.props(styles.actionsCell)}>
            <Btn
              v="ghost"
              size="icon"
              icon="settings"
              aria-label={t('list.editRule', { name: rule.name })}
              title={t('form.editTitle')}
              onClick={() => setDialog({ kind: 'edit', rule })}
            />
            <Btn
              v="ghost"
              size="icon"
              icon="star"
              aria-label={t('list.saveTemplate', { name: rule.name })}
              title={t('templates.saveTitle')}
              onClick={() => setDialog({ kind: 'template', rule })}
            />
            <Btn
              v="ghost"
              size="icon"
              icon="trash"
              aria-label={t('list.deleteRule', { name: rule.name })}
              title={t('list.delete')}
              onClick={() => setDialog({ kind: 'delete', rule })}
            />
          </div>
        ) : null,
    },
  ];

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  const emptyState = (
    <div {...stylex.props(styles.emptyWrap)}>
      <span {...stylex.props(styles.emptyIcon)}>
        <Icon name="bolt" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('list.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canManage ? t('list.emptyHintWrite') : t('list.emptyHintRead')}
      </p>
    </div>
  );

  return (
    <div {...stylex.props(styles.stack)}>
      <FilterChips
        chips={chips}
        active={active}
        onSelect={(value) => commit('active', value)}
        ariaLabel={t('list.tablistLabel')}
      />

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
            {t('list.addRule')}
          </Btn>
        ) : null}
      </FilterBar>

      <DataTable<AutomationRuleRow>
        columns={columns}
        rows={rules}
        rowKey={(rule) => rule.id}
        sort={sort}
        dir={dir}
        onSort={onSort}
        empty={emptyState}
        caption={t('list.tablistLabel')}
      />

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

      {dialog?.kind === 'create' ? (
        <RuleFormDialog mode="create" onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <RuleFormDialog mode="edit" seed={dialog.rule} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'template' ? (
        <SaveTemplateDialog
          ruleId={dialog.rule.id}
          defaultName={dialog.rule.name}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.rule);
          }
        }}
        title={t('list.deleteTitle')}
        message={
          dialog?.kind === 'delete' ? t('list.deleteMessage', { name: dialog.rule.name }) : ''
        }
        confirmLabel={t('list.delete')}
        cancelLabel={t('form.cancel')}
        danger
        busy={deleting}
      />
    </div>
  );
}
