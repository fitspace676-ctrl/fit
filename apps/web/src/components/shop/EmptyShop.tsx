import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';

/**
 * Empty state shown when the active gym has no products (or there is no tenant
 * in scope). Purely presentational — the parent decides when to render it.
 */
export function EmptyShop() {
  const t = useTranslations('shop');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-ink-200 bg-ink-50/60 px-6 py-16 text-center dark:border-white/10 dark:bg-white/5">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400 dark:bg-white/10 dark:text-ink-300"
      >
        <Icon name="bag" className="h-6 w-6" sw={1.9} />
      </span>
      <p className="text-base font-semibold text-ink-900 dark:text-white">
        {t('browse.empty.title')}
      </p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
        {t('browse.empty.subtitle')}
      </p>
    </div>
  );
}
