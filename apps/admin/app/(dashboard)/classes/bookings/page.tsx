import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ClassesTabs } from '@/components/classes-tabs';
import { buttonClasses } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Classes · Bookings — Fit Admin',
  description:
    'Class bookings are created when a member reserves a class occurrence, and are managed from the schedule roster and each member’s record.',
};

export const dynamic = 'force-dynamic';

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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      <ClassesTabs />

      <div className="flex flex-col items-start gap-4 rounded-card border border-ink-200 bg-white p-8 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="max-w-xl text-sm text-ink-600 dark:text-ink-300">{t('description')}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/classes/schedule" className={buttonClasses('primary', 'sm')}>
            {t('cta')}
          </Link>
          <Link href="/members" className={buttonClasses('outline', 'sm')}>
            {tn('members')}
          </Link>
        </div>
      </div>
    </div>
  );
}
