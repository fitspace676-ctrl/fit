'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AdminServiceRow } from '@fit/types';
import { Avatar, Badge, Button, Card, ConfirmDialog } from '@fit/ui-kit';
import { formatPrice } from '../shop/format-price';
import { archiveServiceAction, deleteServiceAction, restoreServiceAction } from './actions';
import { ServiceDrawer } from './service-drawer';

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem 1.25rem',
  },
  main: { display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 },
  cover: {
    width: '4rem',
    height: '2.5rem',
    flexShrink: 0,
    objectFit: 'cover',
    borderRadius: 'var(--radius-element)',
  },
  text: { display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  sub: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  meta: { display: 'flex', alignItems: 'center', gap: '1rem' },
  price: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  actions: { display: 'flex', gap: '0.5rem' },
  empty: {
    paddingBlock: '2.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

export function ServicesList({
  services,
  canWrite,
}: {
  services: AdminServiceRow[];
  canWrite: boolean;
}) {
  const t = useTranslations('admin.services');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<AdminServiceRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggle(service: AdminServiceRow): void {
    startTransition(async () => {
      const action = service.status === 'ACTIVE' ? archiveServiceAction : restoreServiceAction;
      const result = await action(service.id);
      if (result.ok) router.refresh();
      else window.alert(result.error);
    });
  }

  function confirmDelete(): void {
    const service = toDelete;
    if (!service) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteServiceAction(service.id);
      if (result.ok) {
        setToDelete(null);
        router.refresh();
      } else {
        setDeleteError(result.error);
      }
    });
  }

  if (services.length === 0) {
    return (
      <Card padding="none">
        <p {...stylex.props(styles.empty)}>{t('list.empty')}</p>
      </Card>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => {
          if (!pending) setToDelete(null);
        }}
        onConfirm={confirmDelete}
        title={t('list.deleteTitle')}
        description={
          toDelete
            ? deleteError
              ? `${t('list.confirmDelete', { name: toDelete.name })} ${deleteError}`
              : t('list.confirmDelete', { name: toDelete.name })
            : ''
        }
        confirmLabel={t('list.delete')}
        cancelLabel={t('form.cancel')}
        confirmVariant="destructive"
        loading={pending}
      />
      <ul {...stylex.props(styles.list)}>
        {services.map((service) => (
          <li key={service.id}>
            <Card padding="none" xstyle={styles.row}>
              <div {...stylex.props(styles.main)}>
                {service.coverUrl ? (
                  <img src={service.coverUrl} alt="" {...stylex.props(styles.cover)} />
                ) : null}
                <Avatar name={service.staff.name} src={service.staff.photoUrl} size={40} />
                <div {...stylex.props(styles.text)}>
                  <span {...stylex.props(styles.title)}>
                    {service.type === 'PERSONAL_TRAINING'
                      ? t('list.ptTitle', { staff: service.staff.name })
                      : service.name}
                    <Badge
                      tone={service.type === 'PERSONAL_TRAINING' ? 'positive' : 'neutral'}
                      label={t(`type.${service.type}`)}
                    />
                    {service.category ? (
                      <Badge tone="neutral" label={service.category.name} />
                    ) : null}
                    {service.status === 'ARCHIVED' ? (
                      <Badge tone="neutral" label={t('list.archivedBadge')} />
                    ) : null}
                  </span>
                  <span {...stylex.props(styles.sub)}>
                    {service.staff.name} · {t('list.minutes', { count: service.durationMinutes })}
                  </span>
                </div>
              </div>
              <div {...stylex.props(styles.meta)}>
                <span {...stylex.props(styles.price)}>
                  {formatPrice(service.priceMinor, service.currency)}
                </span>
                {canWrite ? (
                  <div {...stylex.props(styles.actions)}>
                    <ServiceDrawer
                      mode="edit"
                      service={service}
                      trigger={<Button variant="secondary" size="inline" label={t('list.edit')} />}
                    />
                    <Button
                      variant="secondary"
                      size="inline"
                      label={service.status === 'ACTIVE' ? t('list.archive') : t('list.restore')}
                      onClick={() => toggle(service)}
                    />
                    {service.status === 'ARCHIVED' ? (
                      <Button
                        variant="secondary"
                        size="inline"
                        label={t('list.delete')}
                        onClick={() => {
                          setDeleteError(null);
                          setToDelete(service);
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
