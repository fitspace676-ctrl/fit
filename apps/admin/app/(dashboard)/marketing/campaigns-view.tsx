'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  AudienceSegmentRow,
  CampaignRow,
  CampaignStatus,
  ListCampaignsQuery,
  MarketingCatalogResponse,
  MarketingChannel,
  MessageTemplateRow,
  SortDir,
} from '@fit/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  FilterBar,
  FilterChips,
  SelectField,
  TableSearch,
  nextSortDir,
  type Column,
  type FilterChip,
} from '@fit/ui-kit';
import { Icon, useToast } from '@/components/ui';
import { CampaignWizard, type CampaignWizardInitial } from './campaign-wizard';
import {
  deleteCampaignAction,
  duplicateCampaignAction,
  saveCampaignAsTemplateAction,
} from './actions';
import {
  CHANNEL_ICONS,
  CHANNEL_TONES,
  STATUS_TONES,
  formatDate,
  formatDateTime,
} from './marketing-meta';

/** The status chips, mapped to the `status` URL param ('' = all). */
const STATUS_TABS: readonly string[] = ['', 'draft', 'scheduled', 'sent', 'paused', 'active'];

/** Statuses whose campaigns can still be edited (the API rejects editing a sent one). */
const EDITABLE_STATUSES: readonly CampaignStatus[] = ['draft', 'scheduled'];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  stack: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  nameCell: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  campaignName: { fontWeight: 500, color: 'var(--color-text-primary)' },
  subjectLine: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    maxWidth: '18rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  channelCell: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  channelIcon: { width: '0.875rem', height: '0.875rem', flexShrink: 0 },
  muted: { color: 'var(--color-text-secondary)' },
  dateMono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  actionsCell: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem' },
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
  emptyIconSvg: { width: '1.5rem', height: '1.5rem' },
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
  pagerCount: { fontFamily: 'var(--font-family-code)', fontVariantNumeric: 'tabular-nums' },
  pagerBtns: { display: 'flex', gap: '0.5rem' },
  channelSelect: { minWidth: '9rem' },
  dialogBody: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
});

/** Which dialog is up, and for which campaign. */
type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; campaign: CampaignRow }
  | { kind: 'template'; campaign: CampaignRow }
  | { kind: 'delete'; campaign: CampaignRow }
  | null;

/** Derive the wizard's initial payload from an existing campaign (edit mode). */
function toInitial(campaign: CampaignRow): CampaignWizardInitial {
  return {
    id: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    subject: campaign.subject,
    body: campaign.body,
    audienceSegmentId: campaign.audienceSegmentId,
    inlineCriteria: campaign.inlineCriteria,
    scheduleType: campaign.scheduleType,
    scheduledAt: campaign.scheduledAt,
  };
}

/**
 * The Campaigns tab (T12.8): status chips + a channel filter + search, the
 * campaigns roster on the Astryx DataTable with channel/status badges, and —
 * behind `MarketingManage` — the New Campaign wizard plus per-row edit
 * (drafts/scheduled), duplicate, save-as-template, and delete. All list state
 * lives in the URL, so the server page stays the single source of truth.
 */
export function CampaignsView({
  campaigns,
  total,
  page,
  limit,
  sort,
  dir,
  search,
  status,
  channel,
  canManage,
  catalog,
  segments,
  templates,
}: {
  campaigns: CampaignRow[];
  total: number;
  page: number;
  limit: number;
  sort: ListCampaignsQuery['sort'];
  dir: SortDir;
  search: string;
  status: string;
  channel: string;
  canManage: boolean;
  catalog: MarketingCatalogResponse;
  segments: AudienceSegmentRow[];
  templates: MessageTemplateRow[];
}) {
  const t = useTranslations('admin.marketing');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [busy, startBusy] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [templateName, setTemplateName] = useState('');

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

  function commit(key: string, value: string): void {
    startTransition(() => router.replace(hrefWith({ [key]: value, page: '' })));
  }

  function onSort(key: string): void {
    const nextDir = nextSortDir(sort === key, dir);
    startTransition(() => router.replace(hrefWith({ sort: key, dir: nextDir })));
  }

  function duplicate(campaign: CampaignRow): void {
    startBusy(async () => {
      const result = await duplicateCampaignAction({
        name: campaign.name,
        channel: campaign.channel,
        audienceSegmentId: campaign.audienceSegmentId,
        inlineCriteria: campaign.inlineCriteria,
        subject: campaign.subject,
        body: campaign.body,
        scheduleType: 'now',
        scheduledAt: null,
      });
      if (result.ok) {
        toast(t('list.duplicated'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmDelete(campaign: CampaignRow): void {
    startBusy(async () => {
      const result = await deleteCampaignAction(campaign.id);
      if (result.ok) {
        setDialog(null);
        toast(t('list.deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmSaveTemplate(campaign: CampaignRow): void {
    startBusy(async () => {
      const result = await saveCampaignAsTemplateAction(campaign.id, templateName || campaign.name);
      if (result.ok) {
        setDialog(null);
        toast(t('templates.saved'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const chips: FilterChip[] = STATUS_TABS.map((tab) => ({
    label: tab === '' ? t('list.statusAll') : t(`status.${tab}`),
    value: tab,
  }));

  const columns: ReadonlyArray<Column<CampaignRow>> = [
    {
      key: 'name',
      header: t('columns.campaign'),
      sortKey: 'name',
      cell: (c) => (
        <div {...stylex.props(styles.nameCell)}>
          <span {...stylex.props(styles.campaignName)}>{c.name}</span>
          {c.subject ? <span {...stylex.props(styles.subjectLine)}>{c.subject}</span> : null}
        </div>
      ),
    },
    {
      key: 'channel',
      header: t('columns.channel'),
      cell: (c) => (
        <Badge
          tone={CHANNEL_TONES[c.channel]}
          label={
            <span {...stylex.props(styles.channelCell)}>
              <Icon name={CHANNEL_ICONS[c.channel]} {...stylex.props(styles.channelIcon)} />
              {t(`channels.${c.channel}`)}
            </span>
          }
        />
      ),
    },
    {
      key: 'audience',
      header: t('columns.audience'),
      cell: (c) =>
        c.audienceSize > 0 ? (
          t('audience.memberCount', { count: c.audienceSize })
        ) : (
          <span {...stylex.props(styles.muted)}>—</span>
        ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (c) => <Badge tone={STATUS_TONES[c.status]} label={t(`status.${c.status}`)} />,
    },
    {
      key: 'when',
      header: t('columns.when'),
      cell: (c) => {
        const when = c.sentAt ?? c.scheduledAt;
        return when ? (
          <span {...stylex.props(styles.dateMono)}>{formatDateTime(when, locale)}</span>
        ) : (
          <span {...stylex.props(styles.muted)}>—</span>
        );
      },
    },
    {
      key: 'createdAt',
      header: t('columns.created'),
      sortKey: 'createdAt',
      cell: (c) => (
        <span {...stylex.props(styles.dateMono)}>{formatDate(c.createdAt, locale)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) =>
        canManage ? (
          <div {...stylex.props(styles.actionsCell)}>
            {EDITABLE_STATUSES.includes(c.status) ? (
              <Button
                variant="ghost"
                size="card"
                iconOnly
                title={t('list.edit')}
                onClick={() => setDialog({ kind: 'edit', campaign: c })}
                icon={<Icon name="settings" {...stylex.props(styles.kitGlyph)} />}
                label={t('list.editCampaign', { name: c.name })}
              />
            ) : null}
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={t('list.duplicate')}
              onClick={() => duplicate(c)}
              disabled={busy}
              icon={<Icon name="tag" {...stylex.props(styles.kitGlyph)} />}
              label={t('list.duplicateCampaign', { name: c.name })}
            />
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={t('list.saveAsTemplate')}
              onClick={() => {
                setTemplateName(c.name);
                setDialog({ kind: 'template', campaign: c });
              }}
              icon={<Icon name="star" {...stylex.props(styles.kitGlyph)} />}
              label={t('list.saveTemplateFor', { name: c.name })}
            />
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={t('list.delete')}
              onClick={() => setDialog({ kind: 'delete', campaign: c })}
              icon={<Icon name="trash" {...stylex.props(styles.kitGlyph)} />}
              label={t('list.deleteCampaign', { name: c.name })}
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
        <Icon name="mail" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('list.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canManage ? t('list.emptyHintWrite') : t('list.emptyHintRead')}
      </p>
    </div>
  );

  const CHANNELS: readonly MarketingChannel[] = ['email', 'sms', 'push'];

  return (
    <div {...stylex.props(styles.stack)}>
      <FilterChips
        chips={chips}
        active={status}
        onSelect={(value) => commit('status', value)}
        label={t('list.statusFilterLabel')}
      />

      <FilterBar>
        <TableSearch
          value={search}
          onSearch={(value) => commit('search', value)}
          placeholder={t('list.searchPlaceholder')}
          label={t('list.searchLabel')}
          debounceMs={SEARCH_DEBOUNCE_MS}
        />
        <div {...stylex.props(styles.channelSelect)}>
          <SelectField
            label={t('list.channelFilterLabel')}
            labelHidden
            size="chrome"
            value={channel}
            onChange={(event) => commit('channel', event.target.value)}
            options={[
              { value: '', label: t('list.channelAll') },
              ...CHANNELS.map((ch) => ({ value: ch, label: t(`channels.${ch}`) })),
            ]}
          />
        </div>
        {canManage ? (
          <Button
            variant="primary"
            size="card"
            onClick={() => setDialog({ kind: 'create' })}
            icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
            label={t('list.newCampaign')}
          />
        ) : null}
      </FilterBar>

      <DataTable<CampaignRow>
        columns={columns}
        rows={campaigns}
        rowKey={(c) => c.id}
        sort={sort}
        dir={dir}
        onSort={onSort}
        empty={emptyState}
        caption={t('list.caption')}
      />

      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>{t('list.showing', { from, to, total })}</span>
        <div {...stylex.props(styles.pagerBtns)}>
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
            disabled={!hasPrev}
            icon={<Icon name="chevronLeft" {...stylex.props(styles.kitGlyph)} />}
            label={t('list.previous')}
          />
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
            disabled={!hasNext}
            endContent={<Icon name="chevronRight" {...stylex.props(styles.kitGlyph)} />}
            label={t('list.next')}
          />
        </div>
      </div>

      {dialog?.kind === 'create' ? (
        <CampaignWizard
          mode="create"
          catalog={catalog}
          segments={segments}
          templates={templates}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <CampaignWizard
          mode="edit"
          initial={toInitial(dialog.campaign)}
          catalog={catalog}
          segments={segments}
          templates={templates}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'template' ? (
        <Dialog
          open
          onClose={() => setDialog(null)}
          title={t('list.saveTemplateTitle')}
          description={t('list.saveTemplateDescription')}
          actions={
            <>
              <Button
                variant="secondary"
                size="card"
                onClick={() => setDialog(null)}
                disabled={busy}
                label={t('wizard.cancel')}
              />
              <Button
                variant="primary"
                size="card"
                onClick={() => confirmSaveTemplate(dialog.campaign)}
                disabled={busy || templateName.trim().length === 0}
                label={busy ? t('wizard.saving') : t('list.saveAsTemplate')}
              />
            </>
          }
        >
          <div {...stylex.props(styles.dialogBody)}>
            <Field
              label={t('list.templateNameLabel')}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              autoFocus
            />
          </div>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.campaign);
          }
        }}
        title={t('list.deleteTitle')}
        description={
          dialog?.kind === 'delete' ? t('list.deleteMessage', { name: dialog.campaign.name }) : ''
        }
        confirmLabel={t('list.delete')}
        cancelLabel={t('wizard.cancel')}
        confirmVariant="destructive"
        loading={busy}
      />
    </div>
  );
}
