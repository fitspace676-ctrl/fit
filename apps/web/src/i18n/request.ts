import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, messages } from '@fit/i18n';

/**
 * Per-request i18n config consumed by next-intl's server APIs (loaded via the
 * `createNextIntlPlugin` wrapper in `next.config.mjs`). Resolves the locale
 * from the `[locale]` route segment, falling back to the default when the
 * segment is missing or unsupported, then hands next-intl the matching
 * message catalogue from `@fit/i18n`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: messages[locale],
  };
});
