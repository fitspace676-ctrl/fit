import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, messages } from '@fit/i18n';
import { LOCALE_COOKIE } from './locale-cookie';

/**
 * Per-request i18n config for the admin console (loaded via the
 * `createNextIntlPlugin` wrapper in `next.config.mjs`). The console has no
 * `[locale]` route segment — it lives under a fixed `/admin` base path — so the
 * active locale comes from the `NEXT_LOCALE` cookie instead of the URL, falling
 * back to the platform default (`ka`) when the cookie is missing or unsupported.
 * next-intl's server APIs (`getTranslations`, `getLocale`) and the client
 * provider both read the locale + catalogue returned here.
 */
export default getRequestConfig(async () => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = cookie && isLocale(cookie) ? cookie : defaultLocale;

  return {
    locale,
    messages: messages[locale],
  };
});
