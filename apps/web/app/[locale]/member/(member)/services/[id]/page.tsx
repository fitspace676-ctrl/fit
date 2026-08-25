import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId, getActiveGymTimezone } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchServices } from '@/lib/services';
import { fetchMyServiceSessions } from '@/lib/my-service-sessions';
import { formatMoney } from '@/lib/shop';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { Avatar, Badge } from '@/src/components/ui/kit';
import { SlotCalendar } from '@/src/components/services/SlotCalendar';
import { MySessions } from '@/src/components/services/MySessions';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.75rem' },
  back: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    alignSelf: 'flex-start',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    textDecoration: 'none',
  },
  backIcon: { height: '1rem', width: '1rem', transform: 'rotate(180deg)' },
  header: { display: 'flex', alignItems: 'flex-start', gap: '1rem' },
  headText: { display: 'flex', flexDirection: 'column', gap: '0.375rem', minWidth: 0 },
  titleRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: { default: '1.5rem', '@media (min-width: 640px)': '1.875rem' },
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  sub: { margin: 0, fontSize: '0.9375rem', color: 'var(--color-text-secondary)' },
  description: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  sectionTitle: {
    margin: 0,
    marginBottom: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  sectionHint: {
    margin: 0,
    marginBottom: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

export const metadata: Metadata = {
  title: 'Book a session - FormaCore',
  description: 'Pick a free slot and book your session.',
};

export const dynamic = 'force-dynamic';

/**
 * One service's booking page: what it is and costs, the week calendar of open
 * slots (the same slots staff opened on the console's PT calendar), and, for a
 * signed-in member, their own sessions of this service with each invoice.
 */
export default async function ServiceBookingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, activeLocale, gymId, timeZone, session] = await Promise.all([
    getTranslations('services'),
    getLocale(),
    getActiveGymId(),
    getActiveGymTimezone(),
    getServerSession(),
  ]);
  if (!gymId) notFound();

  const services = await fetchServices({ gymId }).catch(() => []);
  const service = services.find((s) => s.id === id);
  if (!service) notFound();

  const mine = session
    ? (await fetchMyServiceSessions().catch(() => [])).filter((s) => s.serviceId === id)
    : [];

  const title =
    service.type === 'PERSONAL_TRAINING'
      ? t('ptTitle', { staff: service.staff.name })
      : service.name;

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/member/services" {...stylex.props(styles.back)}>
        <Icon name="arrow" sw={2} {...stylex.props(styles.backIcon)} />
        {t('detail.back')}
      </Link>

      <header {...stylex.props(styles.header)}>
        <Avatar src={service.staff.photoUrl ?? undefined} name={service.staff.name} size={64} />
        <div {...stylex.props(styles.headText)}>
          <div {...stylex.props(styles.titleRow)}>
            <h1 {...stylex.props(styles.title)}>{title}</h1>
            <Badge
              tone={service.type === 'PERSONAL_TRAINING' ? 'positive' : 'neutral'}
              label={t(`type.${service.type}`)}
            />
          </div>
          <p {...stylex.props(styles.sub)}>
            {t('card.with', { staff: service.staff.name })} ·{' '}
            {t('card.minutes', { count: service.durationMinutes })} ·{' '}
            {formatMoney(service.priceMinor, service.currency, activeLocale)} {t('card.perSession')}
          </p>
          {service.description ? (
            <p {...stylex.props(styles.description)}>{service.description}</p>
          ) : null}
        </div>
      </header>

      {mine.length > 0 ? (
        <section>
          <h2 {...stylex.props(styles.sectionTitle)}>{t('mine.title')}</h2>
          <MySessions sessions={mine} timeZone={timeZone} />
        </section>
      ) : null}

      <section>
        <h2 {...stylex.props(styles.sectionTitle)}>{t('detail.pickSlot')}</h2>
        <p {...stylex.props(styles.sectionHint)}>{t('detail.pickSlotHint')}</p>
        <SlotCalendar gymId={gymId} service={service} timeZone={timeZone} />
      </section>
    </div>
  );
}
