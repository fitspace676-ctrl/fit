import { getRequestConfig } from 'next-intl/server';
import { isLocale } from '@fit/i18n';
import { platformMessages } from '@fit/i18n/platform';
import { routing } from './routing';

/**
 * Per-request i18n config consumed by next-intl's server APIs (loaded via the
 * `createNextIntlPlugin` wrapper in `next.config.mjs`). Resolves the locale
 * from the `[locale]` route segment, falling back to English when the segment
 * is missing or unsupported, then hands next-intl the matching platform
 * catalogue from `@fit/i18n/platform`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: platformMessages[locale],
  };
});
