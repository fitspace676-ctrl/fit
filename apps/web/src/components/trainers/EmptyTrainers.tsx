import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';

/**
 * Empty state shown when the active gym has no trainers (or there is no tenant
 * in scope). Purely presentational — the parent decides when to render it.
 */
export function EmptyTrainers() {
  const t = useTranslations('trainers');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-200 bg-ink-50 px-6 py-16 text-center dark:border-white/10 dark:bg-white/5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
        <Icon name="dumbbell" className="h-7 w-7" sw={2} />
      </span>
      <p className="font-display text-base font-extrabold tracking-tight text-ink-900 dark:text-white">
        {t('empty.title')}
      </p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">{t('empty.subtitle')}</p>
    </div>
  );
}
