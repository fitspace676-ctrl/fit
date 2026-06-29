import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { buttonClasses, Card, Icon } from '@/src/components/ui';

/**
 * Shown on the class detail page when the id resolves to no occurrence for the
 * active gym — an unknown / cross-tenant id, or a transient load failure. Offers
 * a one-tap route back to the schedule rather than a dead end. Purely
 * presentational.
 */
export function ClassNotFound() {
  const t = useTranslations('classes');

  return (
    <Card glow className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-white/10 dark:text-brand-300"
      >
        <Icon name="search" className="h-6 w-6" sw={2} />
      </span>
      <p className="font-display text-base font-bold text-ink-900 dark:text-white">
        {t('detail.notFound.title')}
      </p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
        {t('detail.notFound.subtitle')}
      </p>
      <Link href="/classes" className={buttonClasses('outline', 'sm', 'mt-1')}>
        {t('detail.notFound.action')}
      </Link>
    </Card>
  );
}
