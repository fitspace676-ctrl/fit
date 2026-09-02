import * as stylex from '@stylexjs/stylex';
import { getLocale, getTranslations } from 'next-intl/server';
import { serviceLabel, type MemberServiceSession } from '@fit/types';
import { Badge, Card, type BadgeTone } from '@/src/components/ui/kit';
import { formatMoney } from '@/lib/shop';
import { formatZoned, formatZonedTime } from '../classes/date-utils';

const TONE: Record<MemberServiceSession['status'], BadgeTone> = {
  OPEN: 'neutral',
  BOOKED: 'positive',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

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
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '1rem 1.25rem',
  },
  main: { display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 },
  title: { margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' },
  sub: { margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  meta: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' },
  invoice: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  link: {
    color: 'var(--color-text-accent)',
    textDecoration: { default: 'none', ':hover': 'underline' },
  },
});

/** The member's sessions of one service (or all), each with its invoice state. */
export async function MySessions({
  sessions,
  timeZone,
}: {
  sessions: MemberServiceSession[];
  timeZone: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('services.mine'), getLocale()]);
  if (sessions.length === 0) return null;
  return (
    <ul {...stylex.props(styles.list)}>
      {sessions.map((s) => (
        <li key={s.id}>
          <Card padding="none" xstyle={styles.row}>
            <div {...stylex.props(styles.main)}>
              <p {...stylex.props(styles.title)}>
                {formatZoned(s.startsAt, timeZone, locale, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · {formatZonedTime(s.startsAt, timeZone)}
              </p>
              <p {...stylex.props(styles.sub)}>{serviceLabel(s.serviceName, s.staffName)}</p>
            </div>
            <div {...stylex.props(styles.meta)}>
              <Badge tone={TONE[s.status]} label={t(`status.${s.status}`)} />
              {s.invoice ? (
                <span {...stylex.props(styles.invoice)}>
                  <a href={`/api/invoices/${s.invoice.id}`} {...stylex.props(styles.link)}>
                    {s.invoice.number}
                  </a>{' '}
                  · {formatMoney(s.invoice.amount, s.invoice.currency, locale)} ·{' '}
                  {t(`invoice.${s.invoice.status}`)}
                </span>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
