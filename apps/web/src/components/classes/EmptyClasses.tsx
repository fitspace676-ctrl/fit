import { useTranslations } from 'next-intl';
import { Card, Icon } from '@/src/components/ui';

/**
 * Empty state shown when the selected week (or the active gym) has no classes to
 * display. Purely presentational — the parent decides when to render it (the API
 * returned zero instances, or there is no tenant in scope).
 */
export function EmptyClasses() {
  const t = useTranslations('classes');

  return (
    <Card glow className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-white/10 dark:text-brand-300"
      >
        <Icon name="calendar" className="h-6 w-6" sw={2} />
      </span>
      <p className="font-display text-base font-bold text-ink-900 dark:text-white">
        {t('empty.title')}
      </p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">{t('empty.subtitle')}</p>
    </Card>
  );
}
