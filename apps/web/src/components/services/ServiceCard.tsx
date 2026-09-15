'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { ServiceCard as ServiceCardModel } from '@fit/types';
import { Avatar, Badge, ButtonLink, Card } from '@/src/components/ui/kit';
import { formatMoney } from '@/lib/shop';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
    backgroundColor: 'var(--color-background-card)',
  },
  cover: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: 'var(--radius-element)',
  },
  head: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem' },
  headText: { minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  titleRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' },
  name: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.0625rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  staff: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  description: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  price: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  perSession: { fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-secondary)' },
});

export interface ServiceCardProps {
  service: ServiceCardModel;
  locale: string;
}

/**
 * One service on the portal: cover, name, who delivers it, price per session
 * and duration, and the button that books a session. The "when it runs" table
 * that used to open here is gone: a service has no schedule, its slots are
 * opened one by one and picked on the booking page.
 */
export function ServiceCard({ service, locale }: ServiceCardProps) {
  const t = useTranslations('services');

  return (
    <Card padding="none" xstyle={styles.card}>
      {service.coverUrl ? (
        <img src={service.coverUrl} alt="" {...stylex.props(styles.cover)} />
      ) : null}
      <div {...stylex.props(styles.head)}>
        <Avatar src={service.staff.photoUrl ?? undefined} name={service.staff.name} size={48} />
        <div {...stylex.props(styles.headText)}>
          <div {...stylex.props(styles.titleRow)}>
            <h2 {...stylex.props(styles.name)}>
              {service.type === 'PERSONAL_TRAINING'
                ? t('ptTitle', { staff: service.staff.name })
                : service.name}
            </h2>
            <Badge
              tone={service.type === 'PERSONAL_TRAINING' ? 'positive' : 'neutral'}
              label={t(`type.${service.type}`)}
            />
            {service.category ? <Badge tone="neutral" label={service.category} /> : null}
          </div>
          <p {...stylex.props(styles.staff)}>
            {t('card.with', { staff: service.staff.name })} ·{' '}
            {t('card.minutes', { count: service.durationMinutes })}
          </p>
        </div>
      </div>

      {service.description ? (
        <p {...stylex.props(styles.description)}>{service.description}</p>
      ) : null}

      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.price)}>
          {formatMoney(service.priceMinor, service.currency, locale)}{' '}
          <span {...stylex.props(styles.perSession)}>{t('card.perSession')}</span>
        </span>
      </div>

      <ButtonLink
        href={`/member/services/${service.id}`}
        variant="primary"
        size="card"
        label={t('card.bookSession')}
        fullWidth
      />
    </Card>
  );
}
