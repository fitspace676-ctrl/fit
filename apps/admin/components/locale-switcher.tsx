'use client';

// @fit/admin — console language switcher (formacore).
//
// The console has no `[locale]` route segment, so language is a cookie choice,
// not a URL. This renders a compact `ქა | EN` segmented control in the top bar:
// clicking a locale writes the shared `NEXT_LOCALE` cookie and calls
// `router.refresh()` so the server layout re-renders with the new catalogue —
// the same cookie @fit/web reads, so a member's choice carries into the console.

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { locales, type Locale } from '@fit/i18n';
import { LOCALE_COOKIE } from '@/i18n/locale-cookie';

/** One year, in seconds — how long an explicit locale choice is remembered. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Compact top-bar label per locale (the full names are too wide for the chrome). */
const SHORT_LABEL: Record<Locale, string> = {
  ka: 'ქა',
  en: 'EN',
};

export function LocaleSwitcher() {
  const activeLocale = useLocale();
  const t = useTranslations('admin.common.language');
  const router = useRouter();

  function select(locale: Locale): void {
    if (locale === activeLocale) {
      return;
    }
    document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    router.refresh();
  }

  return (
    <div
      className="hidden items-center rounded-btn border border-ink-200 bg-ink-50 p-0.5 dark:border-white/10 dark:bg-white/[0.04] sm:inline-flex"
      role="group"
      aria-label={t('label')}
    >
      {locales.map((locale) => {
        const active = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => select(locale)}
            aria-pressed={active}
            className={[
              'rounded-btn px-2 py-1 font-mono text-[11px] font-semibold transition-colors',
              active
                ? 'bg-white text-ink-900 shadow-sm dark:bg-white/10 dark:text-white'
                : 'text-ink-400 hover:text-ink-700 dark:hover:text-white',
            ].join(' ')}
          >
            {SHORT_LABEL[locale]}
          </button>
        );
      })}
    </div>
  );
}
