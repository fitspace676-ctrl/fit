import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ClassesTabs } from '@/components/classes-tabs';
import { buttonClasses } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Classes · PT Calendar — Fit Admin',
  description:
    'Personal-training sessions are scheduled as personal-category classes with an assigned trainer, on the weekly schedule.',
};

export const dynamic = 'force-dynamic';

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
        <Link href="/classes/schedule" className={buttonClasses('primary', 'sm')}>
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
