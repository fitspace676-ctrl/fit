import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import { ClassesTabs } from '@/components/classes-tabs';
import { buttonClasses } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Classes · Bookings — Fit Admin',
  description:
    'Class bookings are created when a member reserves a class occurrence, and are managed from the schedule roster and each member’s record.',
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
  panelActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
});

/**
 * The Classes hub's Bookings tab. Bookings in our model are held against a class
 * occurrence's roster and surfaced per member; there is no gym-wide bookings
 * listing endpoint, so this tab keeps the hub's structural parity with the
 * reference admin and routes staff to the schedule (to manage a class roster) or
 * a member's record (to see their bookings and attendance).
 */
export default async function BookingsPage() {
  const t = await getTranslations('admin.bookingsHub');
  const tn = await getTranslations('admin.nav');

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <ClassesTabs />

      <div {...stylex.props(styles.panel)}>
        <p {...stylex.props(styles.panelText)}>{t('description')}</p>
        <div {...stylex.props(styles.panelActions)}>
          <Link href="/classes/schedule" className={buttonClasses('primary', 'sm')}>
            {t('cta')}
          </Link>
          {/* 'outline' is a buttonClasses variant, not the Tailwind utility of the same name. */}
          <Link href="/members" className={buttonClasses('outline', 'sm') /* tw-guardrail-allow */}>
            {tn('members')}
          </Link>
        </div>
      </div>
    </div>
  );
}
