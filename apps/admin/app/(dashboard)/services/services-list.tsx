'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { formatServiceSchedule, type AdminServiceRow } from '@fit/types';
import { Avatar, Badge, Button, Card } from '@fit/ui-kit';
import { formatPrice } from '../shop/format-price';
import { archiveServiceAction, restoreServiceAction } from './actions';
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
  const router = useRouter();
  const [, startTransition] = useTransition();

  function toggle(service: AdminServiceRow): void {
    startTransition(async () => {
      const action = service.status === 'ACTIVE' ? archiveServiceAction : restoreServiceAction;
      const result = await action(service.id);
      if (result.ok) router.refresh();
      else window.alert(result.error);
    });
  }

  if (services.length === 0) {
    return (
      <Card padding="none">
        <p {...stylex.props(styles.empty)}>No services here yet.</p>
      </Card>
    );
  }

  return (
    <ul {...stylex.props(styles.list)}>
      {services.map((service) => (
        <li key={service.id}>
          <Card padding="none" xstyle={styles.row}>
            <div {...stylex.props(styles.main)}>
              <Avatar name={service.staff.name} src={service.staff.photoUrl} size={40} />
              <div {...stylex.props(styles.text)}>
                <span {...stylex.props(styles.title)}>
                  {service.name}
                  <Badge
                    tone={service.type === 'PERSONAL_TRAINING' ? 'positive' : 'neutral'}
                    label={service.type === 'PERSONAL_TRAINING' ? 'Personal training' : 'Custom'}
                  />
                  {service.status === 'ARCHIVED' ? <Badge tone="neutral" label="Archived" /> : null}
                </span>
                <span {...stylex.props(styles.sub)}>
                  {service.staff.name} · {service.durationMinutes} min
                  {service.schedule ? ` · ${formatServiceSchedule(service.schedule)}` : ''}
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
                    trigger={<Button variant="secondary" size="inline" label="Edit" />}
                  />
                  <Button
                    variant="secondary"
                    size="inline"
                    label={service.status === 'ACTIVE' ? 'Archive' : 'Restore'}
                    onClick={() => toggle(service)}
                  />
                </div>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
