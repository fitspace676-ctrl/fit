import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { ServicesBrowser } from '@/src/components/services/ServicesBrowser';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  header: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
});

export const metadata: Metadata = {
  title: 'Services - FormaCore',
  description: 'Personal sessions and other services the gym offers.',
};

/** The active gym is resolved from the request `Host`, so never prerender. */
export const dynamic = 'force-dynamic';

/**
 * Public services catalogue: personal training and the gym's other services,
 * each with its price and duration, and the way in to booking a session.
 * Pure discovery, reachable signed-out like the trainers index.
 */
export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, gymId] = await Promise.all([getTranslations('services'), getActiveGymId()]);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>
      <ServicesBrowser gymId={gymId} />
    </div>
  );
}
