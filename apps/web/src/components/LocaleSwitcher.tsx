'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { locales } from '@fit/i18n';
import type { Locale } from '@fit/i18n';

/** One year, in seconds — how long an explicit locale choice is remembered. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Header language switcher. Renders one link per locale (`ქართული | English`),
 * pointing at the current path under the other locale, and persists the choice
 * in the `NEXT_LOCALE` cookie on click so a returning visitor keeps their
 * language. `usePathname()` returns the locale-less path, so the `Link`'s
 * `locale` prop is enough to build the prefixed href.
 */
export function LocaleSwitcher() {
  const activeLocale = useLocale();
  const t = useTranslations('common.language');
  const pathname = usePathname();

  function persist(locale: Locale): void {
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  }

  return (
    <div className="flex items-center gap-1 text-sm" aria-label={t('label')}>
      {locales.map((locale, index) => (
        <span key={locale} className="flex items-center">
          {index > 0 && (
            <span className="px-1 text-slate-300" aria-hidden="true">
              |
            </span>
          )}
          <Link
            href={pathname}
            locale={locale}
            onClick={() => persist(locale)}
            aria-current={locale === activeLocale ? 'true' : undefined}
            className={
              locale === activeLocale
                ? 'font-semibold text-brand-600'
                : 'text-slate-500 hover:text-brand-600'
            }
          >
            {t(locale)}
          </Link>
        </span>
      ))}
    </div>
  );
}
