import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';

/**
 * Shown on the trainer detail page when the id resolves to no trainer for the
 * active gym — an unknown / cross-tenant id, or (until the trainer model lands)
 * any id, since the roster is still empty. Offers a one-tap route back to the
 * index rather than a dead end. Purely presentational.
 */
export function TrainerNotFound() {
  const t = useTranslations('trainers');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
      <span aria-hidden className="text-3xl">
        🔍
      </span>
      <p className="text-base font-semibold text-slate-900">{t('detail.notFound.title')}</p>
      <p className="max-w-sm text-sm text-slate-500">{t('detail.notFound.subtitle')}</p>
      <Link
        href="/trainers"
        className="rounded-card border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        {t('detail.notFound.action')}
      </Link>
    </div>
  );
}
