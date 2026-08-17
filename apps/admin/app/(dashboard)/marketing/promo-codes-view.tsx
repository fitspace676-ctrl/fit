'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { PromoCodeRow } from '@fit/types';
import { Badge, Button, ConfirmDialog, DataTable, type Column } from '@fit/ui-kit';
import { Icon, useToast } from '@/components/ui';
import { PromoFormDialog } from './promo-form-dialog';
import { deletePromoAction, togglePromoAction } from './actions';
import { PROMO_STATUS_TONES, formatDate, formatDiscount, formatMoney } from './marketing-meta';

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
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
  codeCell: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  code: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    letterSpacing: '0.03em',
    color: 'var(--color-text-primary)',
  },
  description: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    maxWidth: '18rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  discount: { fontWeight: 500, color: 'var(--color-text-primary)' },
  muted: { color: 'var(--color-text-secondary)' },
  usage: { fontVariantNumeric: 'tabular-nums' },
  dateMono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  expired: { color: 'var(--color-error)' },
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
  | { kind: 'edit'; promo: PromoCodeRow }
  | { kind: 'delete'; promo: PromoCodeRow }
  | null;

/** Whether a code's expiry has passed (past codes read as expired regardless of status). */
function isExpired(promo: PromoCodeRow, now: number): boolean {
  return promo.expiryDate !== null && new Date(promo.expiryDate).getTime() < now;
}

/**
 * The Promo Codes tab (T12.9): the gym's discount codes on the Astryx DataTable
 * with discount, usage/limit, expiry and status columns, and — behind
 * `MarketingManage` — New Promo Code plus per-row edit, an active/inactive
 * toggle, and delete. Wired to the T12.7 promo-code API through the Server
 * Actions; the server page stays the source of truth and re-renders on refresh.
 */
export function PromoCodesView({
  promoCodes,
  canManage,
}: {
  promoCodes: PromoCodeRow[];
  canManage: boolean;
}) {
  const t = useTranslations('admin.marketing');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, startBusy] = useTransition();
  // A stable "now" for the render pass so every row's expiry compares consistently.
  const now = Date.now();

  function toggle(promo: PromoCodeRow): void {
    startBusy(async () => {
      const next = promo.status === 'active' ? 'inactive' : 'active';
      const result = await togglePromoAction(promo.id, next);
      if (result.ok) {
        toast(next === 'active' ? t('promo.activated') : t('promo.deactivated'), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmDelete(promo: PromoCodeRow): void {
    startBusy(async () => {
      const result = await deletePromoAction(promo.id);
      if (result.ok) {
        setDialog(null);
        toast(t('promo.deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  const columns: ReadonlyArray<Column<PromoCodeRow>> = [
    {
      key: 'code',
      header: t('promo.columns.code'),
      cell: (p) => (
        <div {...stylex.props(styles.codeCell)}>
          <span {...stylex.props(styles.code)}>{p.code}</span>
          {p.description ? (
            <span {...stylex.props(styles.description)}>{p.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'discount',
      header: t('promo.columns.discount'),
      cell: (p) => <span {...stylex.props(styles.discount)}>{formatDiscount(p, locale)}</span>,
    },
    {
      key: 'minPurchase',
      header: t('promo.columns.minPurchase'),
      cell: (p) =>
        p.minPurchase != null ? (
          formatMoney(p.minPurchase, locale)
        ) : (
          <span {...stylex.props(styles.muted)}>—</span>
        ),
    },
    {
      key: 'usage',
      header: t('promo.columns.usage'),
      cell: (p) => (
        <span {...stylex.props(styles.usage)}>
          {p.usageLimit != null
            ? t('promo.usageOf', { used: p.usedCount, limit: p.usageLimit })
            : t('promo.usageUnlimited', { used: p.usedCount })}
        </span>
      ),
    },
    {
      key: 'expiry',
      header: t('promo.columns.expiry'),
      cell: (p) => {
        if (!p.expiryDate) {
          return <span {...stylex.props(styles.muted)}>{t('promo.noExpiry')}</span>;
        }
        const expired = isExpired(p, now);
        return (
          <span {...stylex.props(styles.dateMono, expired && styles.expired)}>
            {formatDate(p.expiryDate, locale)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: t('promo.columns.status'),
      cell: (p) =>
        isExpired(p, now) ? (
          <Badge tone="pending" label={t('promo.expired')} />
        ) : (
          <Badge tone={PROMO_STATUS_TONES[p.status]} label={t(`promo.status.${p.status}`)} />
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) =>
        canManage ? (
          <div {...stylex.props(styles.actionsCell)}>
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={p.status === 'active' ? t('promo.deactivate') : t('promo.activate')}
              onClick={() => toggle(p)}
              disabled={busy}
              icon={
                <Icon
                  name={p.status === 'active' ? 'eyeOff' : 'eye'}
                  {...stylex.props(styles.kitGlyph)}
                />
              }
              label={
                p.status === 'active'
                  ? t('promo.deactivateFor', { code: p.code })
                  : t('promo.activateFor', { code: p.code })
              }
            />
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={t('promo.edit')}
              onClick={() => setDialog({ kind: 'edit', promo: p })}
              icon={<Icon name="settings" {...stylex.props(styles.kitGlyph)} />}
              label={t('promo.editFor', { code: p.code })}
            />
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={t('promo.delete')}
              onClick={() => setDialog({ kind: 'delete', promo: p })}
              icon={<Icon name="trash" {...stylex.props(styles.kitGlyph)} />}
              label={t('promo.deleteFor', { code: p.code })}
            />
          </div>
        ) : null,
    },
  ];

  const emptyState = (
    <div {...stylex.props(styles.emptyWrap)}>
      <span {...stylex.props(styles.emptyIcon)}>
        <Icon name="ticket" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('promo.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canManage ? t('promo.emptyHintWrite') : t('promo.emptyHintRead')}
      </p>
    </div>
  );

  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headingWrap)}>
          <h2 {...stylex.props(styles.headingTitle)}>{t('promo.heading')}</h2>
          <p {...stylex.props(styles.headingHint)}>{t('promo.subheading')}</p>
        </div>
        {canManage ? (
          <Button
            variant="primary"
            size="card"
            onClick={() => setDialog({ kind: 'create' })}
            icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
            label={t('promo.newPromo')}
          />
        ) : null}
      </div>

      <DataTable<PromoCodeRow>
        columns={columns}
        rows={promoCodes}
        rowKey={(p) => p.id}
        empty={emptyState}
        caption={t('promo.caption')}
      />

      {dialog?.kind === 'create' ? (
        <PromoFormDialog mode="create" onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <PromoFormDialog mode="edit" seed={dialog.promo} onClose={() => setDialog(null)} />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.promo);
          }
        }}
        title={t('promo.deleteTitle')}
        description={
          dialog?.kind === 'delete' ? t('promo.deleteMessage', { code: dialog.promo.code }) : ''
        }
        confirmLabel={t('promo.delete')}
        cancelLabel={t('wizard.cancel')}
        confirmVariant="destructive"
        loading={busy}
      />
    </div>
  );
}
