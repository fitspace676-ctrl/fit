// Locale-correct date and time formatting that does NOT depend on the runtime
// having the locale's data.
//
// The same defect `./number-format.ts` exists for, and worse to look at:
// `Intl.DateTimeFormat('ka', …)` resolves to `ka` in Node and to `en-US` in
// Chromium, which ships no Georgian data. Measured, on the same date:
//
//     Node     6 აგვ. 2026     14:30
//     Chromium Aug 6, 2026     02:30 PM
//
// So a Georgian user saw English month names and a twelve-hour clock, and any
// SSR-ed component rendering a date mismatched on hydration.
//
// The names and patterns below are CLDR's, transcribed for the two locales the
// platform ships, and `date-format.spec.ts` asserts them against Node's own ICU
// across every option shape the codebase uses — so the tables cannot drift from
// CLDR without the suite saying so.
//
// Everything here is pure: no `Intl` call on any code path, hence identical
// output in Node, in a browser, and in a test.

import { defaultLocale, isLocale, type Locale } from '../index';

/** Month names, January first. */
const MONTHS: Record<Locale, { short: string[]; long: string[] }> = {
  ka: {
    short: ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'],
    long: [
      'იანვარი',
      'თებერვალი',
      'მარტი',
      'აპრილი',
      'მაისი',
      'ივნისი',
      'ივლისი',
      'აგვისტო',
      'სექტემბერი',
      'ოქტომბერი',
      'ნოემბერი',
      'დეკემბერი',
    ],
  },
  en: {
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    long: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
  },
};

/** Weekday names, MONDAY first — not `Date.getUTCDay()`'s Sunday-first order. */
const WEEKDAYS: Record<Locale, { short: string[]; long: string[] }> = {
  ka: {
    short: ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი'],
    long: ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა'],
  },
  en: {
    short: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    long: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
};

export interface DateTimeFormatOptions {
  weekday?: 'short' | 'long';
  day?: 'numeric' | '2-digit';
  month?: 'numeric' | '2-digit' | 'short' | 'long';
  year?: 'numeric' | '2-digit';
  hour?: 'numeric' | '2-digit';
  minute?: 'numeric' | '2-digit';
  /**
   * Override the locale's own clock. Georgian is 24-hour and English 12-hour by
   * default; a surface that wants one shape everywhere says so here.
   */
  hour12?: boolean;
  /** CLDR's medium date: the same fields as `{ year, month: 'short', day }`. */
  dateStyle?: 'medium';
  /**
   * Only `'UTC'` is honoured; anything else formats in UTC too and is a bug at the
   * call site. The whole reporting layer is UTC — see `report-window.util.ts` —
   * and a formatter that silently applied the viewer's zone would put a bucket on
   * the wrong day.
   */
  timeZone?: string;
}

export interface DateTimeFormatter {
  format(value: Date): string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Build a formatter for `locale`, falling back to the platform default for a
 * locale the platform does not ship.
 *
 * Drop-in for `new Intl.DateTimeFormat(locale, options)` across the console.
 * Everything is read in UTC; see {@link DateTimeFormatOptions.timeZone}.
 */
export function createDateTimeFormat(
  locale: string,
  options: DateTimeFormatOptions = {},
): DateTimeFormatter {
  const resolved: Locale = isLocale(locale) ? locale : baseLocale(locale);
  const opts: DateTimeFormatOptions =
    options.dateStyle === 'medium'
      ? { ...options, year: 'numeric', month: 'short', day: 'numeric' }
      : options;

  return {
    format(value: Date): string {
      const parts: string[] = [];

      const weekday =
        opts.weekday === undefined
          ? undefined
          : WEEKDAYS[resolved][opts.weekday][(value.getUTCDay() + 6) % 7];
      const day =
        opts.day === undefined
          ? undefined
          : opts.day === '2-digit'
            ? pad(value.getUTCDate())
            : String(value.getUTCDate());
      const month =
        opts.month === undefined
          ? undefined
          : opts.month === 'short' || opts.month === 'long'
            ? MONTHS[resolved][opts.month][value.getUTCMonth()]
            : opts.month === '2-digit'
              ? pad(value.getUTCMonth() + 1)
              : String(value.getUTCMonth() + 1);
      const year =
        opts.year === undefined
          ? undefined
          : opts.year === '2-digit'
            ? pad(value.getUTCFullYear() % 100)
            : String(value.getUTCFullYear());

      // An ALL-NUMERIC date is a different pattern, not a composition: CLDR
      // writes it `06.08.2026` in Georgian and `08/06/2026` in English, with no
      // spaces and its own separator.
      const numericMonth = opts.month === 'numeric' || opts.month === '2-digit';
      if (numericMonth && day !== undefined && year !== undefined) {
        const separator = resolved === 'ka' ? '.' : '/';
        const ordered = resolved === 'ka' ? [day, month, year] : [month, day, year];
        const numeric = ordered.join(separator);
        return weekday === undefined ? numeric : `${weekday}, ${numeric}`;
      }

      // Field ORDER is the locale's, and the separators depend on what they sit
      // between — CLDR's own patterns, pinned by the spec:
      //   ka  6 აგვ. 2026   ·  ხუთ, 6 აგვ   ·  აგვისტო, 2026
      //   en  Aug 6, 2026   ·  Thu, Aug 6   ·  August 2026
      //
      // The weekday's comma belongs BETWEEN it and what follows, so a weekday on
      // its own carries none.
      if (weekday !== undefined) parts.push(weekday);
      const afterWeekday = parts.length;
      if (resolved === 'ka') {
        if (day !== undefined) parts.push(day);
        if (month !== undefined) parts.push(day === undefined ? month : ` ${month}`);
        if (year !== undefined) {
          const separator = month === undefined ? '' : opts.month === 'short' ? '. ' : ', ';
          parts.push(`${separator}${year}`);
        }
      } else {
        if (month !== undefined) parts.push(month);
        if (day !== undefined) parts.push(month === undefined ? day : ` ${day}`);
        if (year !== undefined) {
          const separator = day !== undefined ? ', ' : month !== undefined ? ' ' : '';
          parts.push(`${separator}${year}`);
        }
      }
      if (weekday !== undefined && parts.length > afterWeekday) {
        parts[0] = `${weekday}, `;
      }

      const date = parts.join('');
      const time = formatTime(resolved, value, opts);
      if (time === '') return date;
      return date === '' ? time : `${date}, ${time}`;
    },
  };
}

/** `HH:mm` in Georgian, `hh:mm AM/PM` in English — CLDR's clock per locale. */
function formatTime(locale: Locale, value: Date, options: DateTimeFormatOptions): string {
  if (options.hour === undefined && options.minute === undefined) return '';
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();

  const twelveHour = options.hour12 ?? locale === 'en';
  if (!twelveHour) {
    const hour = options.hour === '2-digit' ? pad(hours) : String(hours);
    return options.minute === undefined ? hour : `${hour}:${pad(minutes)}`;
  }

  const half = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour = options.hour === '2-digit' ? pad(half) : String(half);
  const clock = options.minute === undefined ? hour : `${hour}:${pad(minutes)}`;
  return options.hour === undefined ? clock : `${clock} ${suffix}`;
}

/** The shipped locale a tag like `ka-GE` belongs to, else the platform default. */
function baseLocale(tag: string): Locale {
  const base = tag.split('-')[0] ?? '';
  return isLocale(base) ? base : defaultLocale;
}
