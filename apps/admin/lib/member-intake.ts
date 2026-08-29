// @fit/admin — Add-Member drawer helpers.

import {
  gymSettingsStoredSchema,
  startDateBounds,
  type GymMemberIntakeSettings,
  type GymSettings,
  type GymStartDatePolicy,
} from '@fit/types';

/**
 * The inclusive `[min, max]` days a membership may be scheduled to begin on, as
 * `YYYY-MM-DD` strings — the Add-Member form's `<input type="date">` bounds.
 */
export interface StartDateWindow {
  min: string;
  max: string;
}

/**
 * What the Add-Member form needs out of the gym's settings: which fields to ask
 * for, and which days the start-date picker may offer.
 *
 * One object because they travel together through every host of that form — the
 * roster's drawer, the standalone page, and the POS till's drawer — and a second
 * loose prop threaded down the same three chains is a second thing to forget.
 */
export interface MemberIntakeConfig {
  intake: GymMemberIntakeSettings;
  startDateWindow: StartDateWindow;
}

/**
 * The inclusive day window a membership may be scheduled to begin on.
 *
 * Computed on the SERVER, from the gym's own settings, and handed to the form as
 * a prop. Two reasons it is not worked out in the browser: the window is anchored
 * on "today in the GYM's time zone", which the staff laptop's clock does not know
 * (a manager in Berlin adding a member to a Tbilisi gym must get Tbilisi's today);
 * and a value derived from `Date.now()` during render differs between the server
 * pass and the client pass, which is a hydration mismatch.
 *
 * The maths itself is `@fit/types`' {@link startDateBounds}, not a copy of it, so
 * the day this form offers is a day the API will accept.
 */
export function gymStartDateWindow(policy: GymStartDatePolicy, timeZone: string): StartDateWindow {
  return startDateBounds(policy, gymToday(timeZone));
}

/**
 * Project the gym's settings onto what the Add-Member form reads.
 *
 * `null` is the "settings call failed" case, and it resolves to the contract's
 * own defaults rather than to nothing: a dead settings round trip must not close
 * the desk, so the drawer still opens, asking for the built-in fields. Every
 * caller shares this one fallback so the roster, the standalone page and the till
 * cannot degrade differently.
 */
export function memberIntakeConfig(settings: GymSettings | null): MemberIntakeConfig {
  const defaults = gymSettingsStoredSchema.parse({});
  const intake = settings?.memberIntake ?? defaults.memberIntake;
  const policy = settings?.startDatePolicy ?? defaults.startDatePolicy;
  const timeZone = settings?.locale.timezone ?? defaults.locale.timezone;
  return { intake, startDateWindow: gymStartDateWindow(policy, timeZone) };
}

/**
 * Today's calendar date in `timeZone`, as `YYYY-MM-DD`.
 *
 * Assembled from `formatToParts` rather than a locale format string: the only
 * locale that renders ISO order by default is `en-CA`, and relying on a browser
 * shipping that locale's data to get the *ordering* of a date right is how you
 * end up with `01/09/2026` in a comparison. An unknown zone falls back to the
 * runtime's own, which is what `Intl` would do anyway.
 */
function gymToday(timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch {
    // `Intl` throws a `RangeError` on a zone it does not know. The stored zone is
    // schema-validated, so this is the hand-edited-settings case; a date in the
    // runtime's own zone beats throwing on the way to rendering a roster.
    format = new Intl.DateTimeFormat('en-US', options);
  }
  const parts = format.formatToParts(new Date());
  const part = (type: 'year' | 'month' | 'day'): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Compose the single `name` the API stores from the drawer's first-name and
 * (optional, UI-only) surname inputs. Both are trimmed; empty parts are dropped
 * so `("Ana", "")` → `"Ana"` and `("Ana", "Beridze")` → `"Ana Beridze"`.
 */
export function composeName(name: string, surname: string): string {
  return [name.trim(), surname.trim()].filter(Boolean).join(' ');
}
