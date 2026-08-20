// Trainer-facing date-time labels, formatted so the server and the browser can
// never disagree.
//
// The previous formatters called `toLocaleTimeString`/`toLocaleString` with the
// active locale, which breaks two ways at once:
//
//   - Chromium ships no Georgian ICU data, so `Intl(…, 'ka')` silently falls
//     back to `en-US` in the browser while Node resolves the real `ka` — the
//     SSR text ("ორშ 11:35") and the hydrated text ("Mon 11:35 AM") differed,
//     and every trainer card raised a hydration error.
//   - They read the VIEWER's clock, not the gym's — the same defect the
//     schedule board fixed with `zonedClock` (see week.ts).
//
// So: times come from `zonedClock` (numeric, locale-free, gym zone) and date
// words from `@fit/i18n`'s `createDateTimeFormat`, whose CLDR tables are pure
// TypeScript — identical output in Node, in any browser, and in a test.

import { createDateTimeFormat } from '@fit/i18n';
import { zonedClock, zonedToday } from '../classes/schedule/week';

const DAY_MS = 86_400_000;

/**
 * Format an upcoming class instant into the roster card's "next class" footer,
 * e.g. "დღეს 18:00", "ხვალ 07:30", or "ორშ 18:00" — read on the gym's clock.
 * `t` resolves the `relative.today` / `relative.tomorrow` keys.
 */
export function formatNextClass(
  iso: string,
  t: (key: string) => string,
  locale: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = zonedClock(date, timeZone);
  const dayDiff = Math.round(
    (zonedToday(date, timeZone).getTime() - zonedToday(now, timeZone).getTime()) / DAY_MS,
  );
  const day =
    dayDiff === 0
      ? t('relative.today')
      : dayDiff === 1
        ? t('relative.tomorrow')
        : // `zonedToday` yields the gym-date at UTC midnight, so the formatter's
          // UTC read names the gym's weekday, not the server's.
          createDateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
            zonedToday(date, timeZone),
          );
  return `${day} ${time}`;
}

/**
 * Format an ISO instant as a short date-time on the gym's clock — "ორშ, 24 აგვ,
 * 11:35" / "Mon, Aug 24, 11:35" — or an em dash when absent or invalid.
 */
export function formatClassDateTime(
  iso: string | null | undefined,
  locale: string,
  timeZone: string,
): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const day = createDateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(zonedToday(date, timeZone));
  return `${day}, ${zonedClock(date, timeZone)}`;
}
