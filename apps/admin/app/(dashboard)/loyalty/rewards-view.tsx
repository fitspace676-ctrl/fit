'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { LoyaltyRewardRow } from '@fit/types';
import { Badge, Btn, ConfirmDialog, DataTable, Icon, useToast, type Column } from '@/components/ui';
import { RewardFormDialog } from './reward-form-dialog';
import { deleteRewardAction, toggleRewardAction } from './actions';
import { REWARD_TYPE_ICONS, REWARD_TYPE_TONES, formatPoints } from './loyalty-meta';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  headingWrap: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  headingTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  headingHint: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  nameCell: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  name: { fontWeight: 500, color: 'var(--color-text-primary)' },
  description: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    maxWidth: '20rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  typeCell: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  typeIcon: { width: '0.875rem', height: '0.875rem', flexShrink: 0 },
  points: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  stock: { fontVariantNumeric: 'tabular-nums' },
  muted: { color: 'var(--color-text-secondary)' },
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
});

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; reward: LoyaltyRewardRow }
  | { kind: 'delete'; reward: LoyaltyRewardRow }
  | null;

/**
 * The Rewards tab (T12.11): the gym's rewards catalogue on the Astryx DataTable
 * with type, points cost, stock and status columns, and — behind
 * `LoyaltyManage` — New Reward plus per-row edit, an active/inactive toggle, and
 * delete. Wired to the T12.10 rewards API through the Server Actions; the server
 * page stays the source of truth and re-renders on refresh.
 */
export function RewardsView({
  rewards,
  canManage,
}: {
  rewards: LoyaltyRewardRow[];
  canManage: boolean;
}) {
  const t = useTranslations('admin.loyalty');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, startBusy] = useTransition();

  function toggle(reward: LoyaltyRewardRow): void {
    startBusy(async () => {
      const next = !reward.active;
      const result = await toggleRewardAction(reward.id, next);
      if (result.ok) {
        toast(next ? t('rewards.activated') : t('rewards.deactivated'), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmDelete(reward: LoyaltyRewardRow): void {
    startBusy(async () => {
      const result = await deleteRewardAction(reward.id);
      if (result.ok) {
        setDialog(null);
        toast(t('rewards.deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const columns: ReadonlyArray<Column<LoyaltyRewardRow>> = [
    {
      key: 'name',
      header: t('rewards.columns.name'),
      cell: (r) => (
        <div {...stylex.props(styles.nameCell)}>
          <span {...stylex.props(styles.name)}>{r.name}</span>
          {r.description ? (
            <span {...stylex.props(styles.description)}>{r.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'type',
      header: t('rewards.columns.type'),
      cell: (r) => (
        <span {...stylex.props(styles.typeCell)}>
          <Icon name={REWARD_TYPE_ICONS[r.type]} {...stylex.props(styles.typeIcon)} />
          <Badge tone={REWARD_TYPE_TONES[r.type]}>{t(`rewardTypes.${r.type}`)}</Badge>
        </span>
      ),
    },
    {
      key: 'pointsCost',
      header: t('rewards.columns.pointsCost'),
      align: 'right',
      cell: (r) => (
        <span {...stylex.props(styles.points)}>
          {t('rewards.pointsValue', { points: formatPoints(r.pointsCost, locale) })}
        </span>
      ),
    },
    {
      key: 'stock',
      header: t('rewards.columns.stock'),
      align: 'right',
      cell: (r) =>
        r.stock != null ? (
          <span {...stylex.props(styles.stock)}>{formatPoints(r.stock, locale)}</span>
        ) : (
          <span {...stylex.props(styles.muted)}>{t('rewards.unlimited')}</span>
        ),
    },
    {
      key: 'status',
      header: t('rewards.columns.status'),
      cell: (r) => (
        <Badge tone={r.active ? 'success' : 'ink'}>
          {r.active ? t('rewards.active') : t('rewards.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) =>
        canManage ? (
          <div {...stylex.props(styles.actionsCell)}>
            <Btn
              v="ghost"
              size="icon"
              icon={r.active ? 'eyeOff' : 'eye'}
              aria-label={
                r.active
                  ? t('rewards.deactivateFor', { name: r.name })
                  : t('rewards.activateFor', { name: r.name })
              }
              title={r.active ? t('rewards.deactivate') : t('rewards.activate')}
              disabled={busy}
              onClick={() => toggle(r)}
            />
            <Btn
              v="ghost"
              size="icon"
              icon="settings"
              aria-label={t('rewards.editFor', { name: r.name })}
              title={t('rewards.edit')}
              onClick={() => setDialog({ kind: 'edit', reward: r })}
            />
            <Btn
              v="ghost"
              size="icon"
              icon="trash"
              aria-label={t('rewards.deleteFor', { name: r.name })}
              title={t('rewards.delete')}
              onClick={() => setDialog({ kind: 'delete', reward: r })}
            />
          </div>
        ) : null,
    },
  ];

  const emptyState = (
    <div {...stylex.props(styles.emptyWrap)}>
      <span {...stylex.props(styles.emptyIcon)}>
        <Icon name="award" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('rewards.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canManage ? t('rewards.emptyHintWrite') : t('rewards.emptyHintRead')}
      </p>
    </div>
  );

  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headingWrap)}>
          <h2 {...stylex.props(styles.headingTitle)}>{t('rewards.heading')}</h2>
          <p {...stylex.props(styles.headingHint)}>{t('rewards.subheading')}</p>
        </div>
        {canManage ? (
          <Btn v="primary" size="md" icon="plus" onClick={() => setDialog({ kind: 'create' })}>
            {t('rewards.newReward')}
          </Btn>
        ) : null}
      </div>

      <DataTable<LoyaltyRewardRow>
        columns={columns}
        rows={rewards}
        rowKey={(r) => r.id}
        empty={emptyState}
        caption={t('rewards.caption')}
      />

      {dialog?.kind === 'create' ? (
        <RewardFormDialog mode="create" onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <RewardFormDialog mode="edit" seed={dialog.reward} onClose={() => setDialog(null)} />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.reward);
          }
        }}
        title={t('rewards.deleteTitle')}
        message={
          dialog?.kind === 'delete' ? t('rewards.deleteMessage', { name: dialog.reward.name }) : ''
        }
        confirmLabel={t('rewards.delete')}
        cancelLabel={t('rewards.cancel')}
        danger
        busy={busy}
      />
    </div>
  );
}
