import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import { ClassesTabs } from '@/components/classes-tabs';
import { buttonClasses } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Classes · PT Calendar — Fit Admin',
  description:
    'Personal-training sessions are scheduled as personal-category classes with an assigned trainer, on the weekly schedule.',
};

export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '2rem',
  },
  panelText: {
    margin: 0,
    maxWidth: '36rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The Classes hub's PT Calendar tab. Personal training in our model is a class
 * with a personal category and an assigned trainer, so PT sessions live on the
 * same weekly schedule board rather than a separate calendar backend. This tab
 * keeps the hub's structural parity with the reference admin and routes staff to
 * the schedule, where PT sessions are viewed and booked.
 */
export default async function PtCalendarPage() {
  const t = await getTranslations('admin.ptHub');

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <ClassesTabs />

      <div {...stylex.props(styles.panel)}>
        <p {...stylex.props(styles.panelText)}>{t('description')}</p>
        <Link href="/classes/schedule" className={buttonClasses('primary', 'sm')}>
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
