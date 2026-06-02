import { defineRouting } from 'next-intl/routing';
import { defaultLocale, locales } from '@fit/i18n';

/**
 * Locale routing config shared by the middleware, the navigation helpers, and
 * the request config. Locales and the default come from `@fit/i18n` so web and
 * admin can't drift. `localePrefix: 'always'` makes `/ka/...` (default) and
 * `/en/...` the canonical URLs — a bare `/` redirects to `/ka`.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
});
