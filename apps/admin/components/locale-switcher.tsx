'use client';

// @fit/admin — console language switcher.
//
// The console has no `[locale]` route segment, so language is a cookie choice,
// not a URL. This renders a compact `ქა | EN` control in the top bar on the
// kit's `SegmentedControl`: choosing a locale writes the shared `NEXT_LOCALE`
// cookie and calls `router.refresh()` so the server layout re-renders with the
// new catalogue — the same cookie @fit/web reads, so a member's choice carries
// into the console.

import * as stylex from '@stylexjs/stylex';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { SegmentedControl } from '@fit/ui-kit';
import { locales } from '@fit/i18n';
import type { Locale } from '@fit/i18n';
import { LOCALE_COOKIE } from '@/i18n/locale-cookie';

/** One year, in seconds — how long an explicit locale choice is remembered. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Compact top-bar label per locale (the full names are too wide for the chrome). */
const SHORT_LABEL: Record<Locale, string> = {
  ka: 'ქა',
  en: 'EN',
};

const styles = stylex.create({
  // The control is chrome, not primary content — hide it on the narrowest
  // viewports where the top bar is already tight (parity with the old switcher).
  root: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'inline-flex',
    },
  },
});

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
    <SegmentedControl
      label={t('label')}
      value={activeLocale as Locale}
      onChange={select}
      options={locales.map((locale) => ({ value: locale, label: SHORT_LABEL[locale] }))}
      xstyle={styles.root}
    />
  );
}
