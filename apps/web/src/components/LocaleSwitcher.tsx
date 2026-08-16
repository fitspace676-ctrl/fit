'use client';

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { locales } from '@fit/i18n';
import type { Locale } from '@fit/i18n';

/** One year, in seconds — how long an explicit locale choice is remembered. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// FormaCore redesign — the KA / EN segmented control from the artboards.
//
// It replaces a `ქართული | English` pair of links, which had two problems the
// new direction makes obvious: it was the last thing on these screens still
// painted in the retired Aurora indigo (`text-brand-600` against `text-slate-*`,
// neither of which is in the palette any more), and spelling both languages out
// made a nav item out of what the artboards treat as a two-letter toggle.
//
// The control states the current language rather than offering the other one:
// the active code is filled lime, the alternative sits quiet beside it — the
// same "show both, mark one" rule as the theme switch in the member header.

const styles = stylex.create({
  // Same track as the theme switch — same height, same border, same fill. The
  // two now stand side by side in the member header, and they are the same class
  // of object: a two-state segmented control that says which one you are on. On
  // `--fc-tile` the language track vanished into the canvas in dark mode while
  // the theme track beside it kept a visible edge, which read as two different
  // kinds of control rather than a pair.
  track: {
    display: 'flex',
    height: '2.5rem',
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-control)',
    padding: '0.25rem',
  },
  option: {
    display: 'grid',
    height: '2rem',
    placeItems: 'center',
    borderRadius: 'calc(var(--radius-inner) - 0.25rem)',
    paddingInline: '0.75rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    textDecoration: 'none',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  idle: {
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  active: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
});

/**
 * Language switcher. Renders one option per locale as its two-letter code,
 * pointing at the current path under that locale, and persists the choice in the
 * `NEXT_LOCALE` cookie on click so a returning visitor keeps their language.
 * `usePathname()` returns the locale-less path, so the `Link`'s `locale` prop is
 * enough to build the prefixed href.
 */
export function LocaleSwitcher() {
  const activeLocale = useLocale();
  const t = useTranslations('common.language');
  const pathname = usePathname();

  function persist(locale: Locale): void {
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  }

  return (
    <div {...stylex.props(styles.track)} role="group" aria-label={t('label')}>
      {locales.map((locale) => {
        const current = locale === activeLocale;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            onClick={() => persist(locale)}
            aria-current={current ? 'true' : undefined}
            // The visible label is the code; the full language name stays
            // available to screen readers, which should not have to expand
            // "KA" themselves.
            aria-label={t(locale)}
            {...stylex.props(styles.option, current ? styles.active : styles.idle)}
          >
            {locale}
          </Link>
        );
      })}
    </div>
  );
}
