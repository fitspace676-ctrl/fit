import { defineRouting } from 'next-intl/routing';
import { isLocale, locales, type Locale } from '@fit/i18n';

/**
 * Locale routing for the marketing site, shared by the middleware, the
 * navigation helpers and the request config.
 *
 * The locale list comes from `@fit/i18n` so the site cannot ship a language the
 * product does not have, but the default is this site's own: the marketing
 * pages launched in English and keep their unprefixed URLs (`/`, `/pricing`),
 * while Georgian lives under `/ka` (`localePrefix: 'as-needed'`). That differs
 * from the member portal, which is Georgian-first and prefixes every URL.
 *
 * `localeDetection` is off so a URL always means one language: `/` is English
 * for every visitor, `/ka` is Georgian, and neither `Accept-Language` nor the
 * `NEXT_LOCALE` cookie the switcher writes redirects anyone. Turn it on to send
 * returning visitors to the language they last chose.
 */
export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: false,
});

/** The locale a locale-prefixed (or unprefixed, i.e. English) pathname names. */
export function localeFromPathname(pathname: string): Locale {
  const [, first] = pathname.split('/');
  return first && isLocale(first) ? first : routing.defaultLocale;
}
