import { useTranslations } from 'next-intl';

/**
 * Empty state shown when the active gym has no products (or there is no tenant
 * in scope). Purely presentational — the parent decides when to render it.
 */
export function EmptyShop() {
  const t = useTranslations('shop');

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
      <span aria-hidden className="text-3xl">
        🛍️
      </span>
      <p className="text-base font-semibold text-slate-900">{t('browse.empty.title')}</p>
      <p className="max-w-sm text-sm text-slate-500">{t('browse.empty.subtitle')}</p>
    </div>
  );
}
