/**
 * The language a transactional email renders in, and how it is decided.
 *
 * Every email the platform sends is written in one of two locales: `en` and
 * `ka`, the two launch languages. Nothing about the recipient is stored beyond
 * the gym they belong to, so the gym's interface language decides for every
 * gym-scoped mail (a receipt, a reminder, a digest), and the language the
 * visitor was using decides for the account mails that happen before a gym is
 * known (registration, a password reset). `ru` and anything else fall back to
 * English until a Russian copy set exists.
 */
export type EmailLocale = 'en' | 'ka';

/** The locale a mail renders in when nothing better is known. */
export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'en';

/** Map a gym's stored interface `language` (`en` / `ka` / `ru`) onto a supported email locale. */
export function resolveEmailLocale(language: string | null | undefined): EmailLocale {
  return language === 'ka' ? 'ka' : 'en';
}

/**
 * Pick the email locale a browser asked for from its `Accept-Language` header
 * (`ka`, `ka-GE,ka;q=0.9,en;q=0.8`, ...). The web app sends the interface
 * language the visitor is reading, so an account mail arrives in the language
 * of the screen that triggered it. Returns `null` when the header names no
 * supported language, so the caller can fall back to the gym's language.
 */
export function parseAcceptLanguage(header: string | string[] | undefined): EmailLocale | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) {
    return null;
  }
  for (const part of raw.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag === 'ka' || tag.startsWith('ka-')) {
      return 'ka';
    }
    if (tag === 'en' || tag.startsWith('en-')) {
      return 'en';
    }
  }
  return null;
}

/** The `Intl` locale tag each email locale formats numbers and dates with. */
const INTL_LOCALE: Record<EmailLocale, string> = { en: 'en-US', ka: 'ka-GE' };

/** Assumed minor units per major unit (USD/EUR/GEL - all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string (`$29.99`,
 * `29,99 ₾`), mirroring the admin's `formatPrice`. Falls back to `29.99 USD`
 * for a currency code `Intl` doesn't recognise so a mail always shows a number.
 */
export function formatEmailMoney(
  amountMinor: number,
  currency: string,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): string {
  const major = amountMinor / MINOR_PER_MAJOR;
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency }).format(
      major,
    );
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/**
 * Format a `YYYY-MM-DD` business day as a readable date in the mail's language
 * (`25 August 2026`, `25 აგვისტო, 2026`). Parsed as UTC noon so no time zone
 * can shift it onto the neighbouring day. A string that isn't a plain date is
 * returned untouched.
 */
export function formatEmailDate(
  isoDate: string,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
