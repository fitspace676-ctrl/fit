import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { buttonClasses, Icon } from '@/src/components/ui';

/**
 * Shown on the trainer detail page when the id resolves to no trainer for the
 * active gym — an unknown / cross-tenant id, or (until the trainer model lands)
 * any id, since the roster is still empty. Offers a one-tap route back to the
 * index rather than a dead end. Purely presentational.
 */
export function TrainerNotFound() {
  const t = useTranslations('trainers');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-200 bg-ink-50 px-6 py-16 text-center dark:border-white/10 dark:bg-white/5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
        <Icon name="search" className="h-7 w-7" sw={2} />
      </span>
      <p className="font-display text-base font-extrabold tracking-tight text-ink-900 dark:text-white">
        {t('detail.notFound.title')}
      </p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
        {t('detail.notFound.subtitle')}
      </p>
      <Link href="/trainers" className={buttonClasses('outline', 'sm', 'mt-1')}>
        {t('detail.notFound.action')}
      </Link>
    </div>
  );
}
