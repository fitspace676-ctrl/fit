'use client';

// @fit/admin — the home-screen banner reel (T1.16).
//
// The member app's carousel, in the order it will be drawn: position, artwork,
// destination, run window, derived status, the manual on/off switch, and — behind
// `MarketingManage` — new / edit / delete plus move up / move down.
//
// REORDERING IS BUTTONS, NOT DRAG. `PATCH /marketing/banners/reorder` takes the
// whole list and renumbers it in one transaction, so the two are the same request
// either way; a pair of arrows is what the rest of this console does, works from a
// keyboard, and does not need a pointer library for a list that is rarely more
// than a handful of slides.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { Banner } from '@fit/types';
import { Badge, Button, ConfirmDialog, DataTable, Switch, type Column } from '@fit/ui-kit';
import { Icon, useToast } from '@/components/ui';
import { BannerFormDrawer } from './banner-form-drawer';
import { deleteBannerAction, reorderBannersAction, toggleBannerAction } from './actions';
import { BANNER_STATUS_TONES, bannerStatus } from './banner-status';
import { formatDate } from '../marketing-meta';

const styles = stylex.create({
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
  orderCell: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem' },
  position: {
    minWidth: '1.25rem',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  bannerCell: { display: 'flex', alignItems: 'center', gap: '0.625rem' },
  // 2:1 — the shape the phone draws, so a row's thumbnail is a small version of
  // the slide rather than a differently-cropped one.
  thumbFrame: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    height: '2.5rem',
    width: '5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-surface-muted)',
    color: 'var(--color-text-secondary)',
  },
  thumb: { height: '100%', width: '100%', objectFit: 'cover' },
  thumbIcon: { width: '1rem', height: '1rem' },
  title: { fontWeight: 500, color: 'var(--color-text-primary)' },
  muted: { color: 'var(--color-text-secondary)' },
  link: {
    display: 'block',
    maxWidth: '16rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  window: {
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
});

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; banner: Banner }
  | { kind: 'delete'; banner: Banner }
  | null;

/**
 * The list with `index` swapped one place towards `direction`, or `null` when
 * that would fall off either end.
 */
function moved(banners: Banner[], index: number, direction: -1 | 1): Banner[] | null {
  const target = index + direction;
  const row = banners[index];
  if (row === undefined || target < 0 || target >= banners.length) {
    return null;
  }
  const next = [...banners];
  next.splice(index, 1);
  next.splice(target, 0, row);
  return next;
}

export function BannersView({ banners, canManage }: { banners: Banner[]; canManage: boolean }) {
  const t = useTranslations('admin.marketing.banners');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, startBusy] = useTransition();
  // A stable "now" for the render pass, so every row's status is decided against
  // the same instant rather than drifting mid-table.
  const now = Date.now();
  // The reel arrives already in carousel order, so a row's position IS its index —
  // resolved through a map rather than `indexOf` per cell, which would re-scan the
  // list once for every row drawn.
  const positions = new Map(banners.map((banner, index) => [banner.id, index]));

  function toggle(banner: Banner): void {
    startBusy(async () => {
      const result = await toggleBannerAction(banner.id, !banner.isActive);
      if (result.ok) {
        toast(banner.isActive ? t('deactivated') : t('activated'), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function move(index: number, direction: -1 | 1): void {
    const next = moved(banners, index, direction);
    if (next === null) {
      return;
    }
    startBusy(async () => {
      // The whole reel, not the moved pair: a partial list renumbers only the ids
      // it names and leaves the rest sitting on their old positions.
      const result = await reorderBannersAction({ ids: next.map((banner) => banner.id) });
      if (result.ok) {
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmDelete(banner: Banner): void {
    startBusy(async () => {
      const result = await deleteBannerAction(banner.id);
      if (result.ok) {
        setDialog(null);
        toast(t('deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  /** A banner's run window as one line, or the "always on" dash. */
  function windowLabel(banner: Banner): string {
    if (banner.startsAt === null && banner.endsAt === null) {
      return t('windowAlways');
    }
    const from = banner.startsAt ? formatDate(banner.startsAt, locale) : t('windowOpenStart');
    const to = banner.endsAt ? formatDate(banner.endsAt, locale) : t('windowOpenEnd');
    return `${from} → ${to}`;
  }

  const columns: ReadonlyArray<Column<Banner>> = [
    {
      key: 'order',
      header: t('columns.order'),
      cell: (banner) => {
        const index = positions.get(banner.id) ?? 0;
        return (
          <span {...stylex.props(styles.orderCell)}>
            <span {...stylex.props(styles.position)}>{index + 1}</span>
            {canManage ? (
              <>
                <Button
                  variant="ghost"
                  size="card"
                  iconOnly
                  title={t('moveUp')}
                  onClick={() => move(index, -1)}
                  disabled={busy || index === 0}
                  icon={<Icon name="chevronUp" {...stylex.props(styles.kitGlyph)} />}
                  label={t('moveUpFor', { name: banner.title ?? t('untitled') })}
                />
                <Button
                  variant="ghost"
                  size="card"
                  iconOnly
                  title={t('moveDown')}
                  onClick={() => move(index, 1)}
                  disabled={busy || index === banners.length - 1}
                  icon={<Icon name="chevronDown" {...stylex.props(styles.kitGlyph)} />}
                  label={t('moveDownFor', { name: banner.title ?? t('untitled') })}
                />
              </>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'banner',
      header: t('columns.banner'),
      cell: (banner) => (
        <div {...stylex.props(styles.bannerCell)}>
          <span {...stylex.props(styles.thumbFrame)}>
            {banner.imageUrl ? (
              <img
                src={banner.imageUrl}
                alt={banner.title ?? t('image.alt')}
                {...stylex.props(styles.thumb)}
              />
            ) : (
              <Icon name="camera" {...stylex.props(styles.thumbIcon)} />
            )}
          </span>
          {banner.title ? (
            <span {...stylex.props(styles.title)}>{banner.title}</span>
          ) : (
            <span {...stylex.props(styles.muted)}>{t('untitled')}</span>
          )}
        </div>
      ),
    },
    {
      key: 'link',
      header: t('columns.link'),
      cell: (banner) =>
        banner.linkUrl ? (
          <span {...stylex.props(styles.link)} title={banner.linkUrl}>
            {banner.linkUrl}
          </span>
        ) : (
          <span {...stylex.props(styles.muted)}>{t('noLink')}</span>
        ),
    },
    {
      key: 'window',
      header: t('columns.window'),
      cell: (banner) => <span {...stylex.props(styles.window)}>{windowLabel(banner)}</span>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (banner) => {
        const status = bannerStatus(banner, now);
        return <Badge tone={BANNER_STATUS_TONES[status]} label={t(`status.${status}`)} />;
      },
    },
    {
      key: 'active',
      header: t('columns.active'),
      cell: (banner) => (
        <Switch
          hideLabel
          label={
            banner.isActive
              ? t('deactivateFor', { name: banner.title ?? t('untitled') })
              : t('activateFor', { name: banner.title ?? t('untitled') })
          }
          checked={banner.isActive}
          onChange={() => toggle(banner)}
          disabled={!canManage || busy}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (banner) =>
        canManage ? (
          <div {...stylex.props(styles.actionsCell)}>
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={t('edit')}
              onClick={() => setDialog({ kind: 'edit', banner })}
              icon={<Icon name="settings" {...stylex.props(styles.kitGlyph)} />}
              label={t('editFor', { name: banner.title ?? t('untitled') })}
            />
            <Button
              variant="ghost"
              size="card"
              iconOnly
              title={t('delete')}
              onClick={() => setDialog({ kind: 'delete', banner })}
              icon={<Icon name="trash" {...stylex.props(styles.kitGlyph)} />}
              label={t('deleteFor', { name: banner.title ?? t('untitled') })}
            />
          </div>
        ) : null,
    },
  ];

  const emptyState = (
    <div {...stylex.props(styles.emptyWrap)}>
      <span {...stylex.props(styles.emptyIcon)}>
        <Icon name="camera" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>
        {canManage ? t('emptyHintWrite') : t('emptyHintRead')}
      </p>
    </div>
  );

  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headingWrap)}>
          <h2 {...stylex.props(styles.headingTitle)}>{t('heading')}</h2>
          <p {...stylex.props(styles.headingHint)}>{t('subheading')}</p>
        </div>
        {canManage ? (
          <Button
            variant="primary"
            size="card"
            onClick={() => setDialog({ kind: 'create' })}
            icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
            label={t('newBanner')}
          />
        ) : null}
      </div>

      <DataTable<Banner>
        columns={columns}
        rows={banners}
        rowKey={(banner) => banner.id}
        empty={emptyState}
        caption={t('caption')}
      />

      {dialog?.kind === 'create' ? (
        <BannerFormDrawer mode="create" onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <BannerFormDrawer mode="edit" seed={dialog.banner} onClose={() => setDialog(null)} />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.banner);
          }
        }}
        title={t('deleteTitle')}
        description={
          dialog?.kind === 'delete'
            ? t('deleteMessage', { name: dialog.banner.title ?? t('untitled') })
            : ''
        }
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        confirmVariant="destructive"
        loading={busy}
      />
    </div>
  );
}
