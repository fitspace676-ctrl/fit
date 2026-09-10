// @fit/mobile — the classes screen's arithmetic: weeks, days, buckets, filters.
//
// ===========================================================================
// WHY THIS IS A SEPARATE, REACT-FREE MODULE.
//
// Every number the classes stack renders is derived from one array of
// `ClassInstanceCard`s: which days have a dot, which bucket a card falls in,
// how many filters are active, what the day strip says. Left in the screen,
// each of those is a `useMemo` a test can only reach by mounting a navigator —
// which is how the deleted app ended up with zero coverage on exactly this
// kind of logic. Nothing here imports React or `react-native`.
//
// (It is tested from `schedule.test.tsx` rather than a `.spec.ts`, because
// `vitest.config.ts` includes only `lib/**` and `hooks/**` — the same shape
// `components/auth/auth-error.ts` already uses.)
//
// ---------------------------------------------------------------------------
// TIMES ARE READ IN THE DEVICE'S ZONE, NOT THE GYM'S. A KNOWN DEVIATION.
//
// `apps/web` renders every class time in the gym's IANA zone
// (`ClassesBrowser` → `formatZoned` → `new Intl.DateTimeFormat(…, { timeZone })`).
// The mobile app CANNOT: `apps/mobile/eslint.config.mjs` bans `Intl` outright,
// because no runtime we ship carries Georgian locale data, and there is no
// zone-arithmetic implementation on this side of the boundary. So every time
// below is the device's wall clock.
//
// For the one-gym-one-city product this is invisible; for a member travelling,
// a 18:00 class reads as 17:00. That is a real difference from web and it is
// written down here rather than discovered later. Note the web's OWN filter
// model already does this (`class-filters.ts:bandOf` calls `getHours()`), so
// the *bucketing* has always been device-local on both surfaces.
//
// ---------------------------------------------------------------------------
// THE `localWallClock` SHIFT.
//
// `createDateTimeFormat` from `@fit/i18n` reads every field with `getUTC*` —
// deliberately, because the reporting layer is UTC. Feeding it an instant
// therefore renders UTC, not the phone's clock. Shifting the instant by its own
// `getTimezoneOffset()` first makes the UTC fields equal the local wall clock,
// which is the standard trick and, crucially, needs no `Intl`. The offset is
// read off the instance, so a DST boundary inside the week is handled per
// instant rather than per week.
// ===========================================================================

import { createDateTimeFormat, type Locale } from '@fit/i18n';
import type { ClassInstanceCard } from '@fit/types';

const MS_PER_MINUTE = 60_000;

/** Days in the strip — Monday-first, matching `startOfWeek` and CLDR's tables. */
export const DAYS_IN_WEEK = 7;

/**
 * The three time-of-day buckets the artboard groups a day into, in order.
 *
 * The names are the `member.classes.periods.*` keys verbatim, so the screen
 * looks up copy by the bucket rather than by a parallel switch.
 */
export const PERIODS = ['morning', 'afternoon', 'evening'] as const;

/** One of {@link PERIODS}. */
export type Period = (typeof PERIODS)[number];

/**
 * Hour boundaries between the buckets — `[0,12) [12,17) [17,24)`.
 *
 * The same split as `apps/web/src/components/classes/class-filters.ts` and as
 * the artboard's own `PERIODS` table. Written once so the two cannot drift.
 */
const AFTERNOON_FROM = 12;
const EVENING_FROM = 17;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * An instant shifted so its **UTC** fields read as the device's local wall
 * clock. Feed this, never the raw instant, to `createDateTimeFormat`.
 */
export function localWallClock(value: Date): Date {
  return new Date(value.getTime() - value.getTimezoneOffset() * MS_PER_MINUTE);
}

/** Local midnight of `value`'s day. */
export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * `n` days after `value`, at the same local time of day.
 *
 * Via `setDate`, not `+ n * 86_400_000`: across a DST boundary the arithmetic
 * form lands an hour early or late, which in the worst case moves a Sunday
 * evening class onto Monday.
 */
export function addDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** Local midnight of `value`'s **Monday** — the week the strip shows. */
export function startOfWeek(value: Date): Date {
  const day = startOfDay(value);
  // `getDay()` is Sunday-first (0); the strip is Monday-first.
  const offset = (day.getDay() + 6) % DAYS_IN_WEEK;
  return addDays(day, -offset);
}

/** The seven local midnights of the week starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  const days: Date[] = [];
  for (let index = 0; index < DAYS_IN_WEEK; index += 1) {
    days.push(addDays(weekStart, index));
  }
  return days;
}

/**
 * The `[from, to]` window `GET /class-instances` is asked for — the whole week,
 * as ISO-8601 instants.
 *
 * `to` is the *end* of Sunday rather than the start of the next Monday: the
 * server treats the range as inclusive-overlapping and `listClassInstancesQuery`
 * only refines `from <= to`, so a half-open bound would be a needless edge.
 */
export function weekWindow(weekStart: Date): { from: string; to: string } {
  const start = startOfWeek(weekStart);
  return {
    from: start.toISOString(),
    to: new Date(addDays(start, DAYS_IN_WEEK).getTime() - 1).toISOString(),
  };
}

/** `YYYY-MM-DD` in the device's zone — the key a day's classes are bucketed by. */
export function dayKey(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Do two instants fall on the same local day? */
export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** Which bucket an occurrence's start falls into, in the device's zone. */
export function periodOf(startsAt: string): Period {
  const hour = new Date(startsAt).getHours();
  if (hour < AFTERNOON_FROM) return 'morning';
  if (hour < EVENING_FROM) return 'afternoon';
  return 'evening';
}

/** The occurrences that start on `day`, in the order the server sent them. */
export function classesOn(instances: readonly ClassInstanceCard[], day: Date): ClassInstanceCard[] {
  const key = dayKey(day);
  return instances.filter((instance) => dayKey(new Date(instance.startsAt)) === key);
}

/**
 * How many classes each day of the week holds, keyed by {@link dayKey}.
 *
 * The strip's dot is the ONLY thing on a `DayCell` that says a day has classes,
 * and the count is what its `accessibilityLabel` has to spell out — so both come
 * from here rather than from two passes that could disagree.
 */
export function countsByDay(instances: readonly ClassInstanceCard[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const instance of instances) {
    const key = dayKey(new Date(instance.startsAt));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** A time-of-day bucket with at least one class in it. */
export interface PeriodGroup {
  period: Period;
  items: ClassInstanceCard[];
}

/**
 * A day's classes as morning / afternoon / evening, **empty buckets dropped**.
 *
 * The artboard renders no header for a bucket with nothing in it, and an empty
 * "Afternoon" rule over a gap reads as a failed load.
 */
export function groupByPeriod(instances: readonly ClassInstanceCard[]): PeriodGroup[] {
  return PERIODS.map((period) => ({
    period,
    items: instances.filter((instance) => periodOf(instance.startsAt) === period),
  })).filter((group) => group.items.length > 0);
}

/** A class's length in whole minutes, from the two instants on the card. */
export function durationMinutes(startsAt: string, endsAt: string): number {
  const span = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return Math.max(0, Math.round(span / MS_PER_MINUTE));
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * The three facets the mobile screen filters on — category (the chip rail),
 * trainer and location (the sheet). `null` means "no constraint".
 *
 * Narrower than web's `ClassFilterState`, on purpose: web has a multi-select
 * `types[]` and a fourth `time` band, and the artboard has neither — the time
 * band is redundant here because the whole day is already drawn as three
 * time-of-day sections.
 */
export interface ClassFilterState {
  category: string | null;
  trainer: string | null;
  location: string | null;
}

/** Everything passes. */
export const EMPTY_FILTERS: ClassFilterState = {
  category: null,
  trainer: null,
  location: null,
};

/**
 * How many facets are constraining the result — the number in the filter
 * button's badge.
 *
 * The category chip counts, exactly as it does on the artboard
 * (`mobile-classes.tsx:196-199`): a member who narrowed to "Spin" from the rail
 * and then forgot has the same problem as one who narrowed by trainer.
 */
export function activeFilterCount(filters: ClassFilterState): number {
  return (
    (filters.category === null ? 0 : 1) +
    (filters.trainer === null ? 0 : 1) +
    (filters.location === null ? 0 : 1)
  );
}

/** Narrow `instances` to those matching every active facet. */
export function applyFilters(
  instances: readonly ClassInstanceCard[],
  filters: ClassFilterState,
): ClassInstanceCard[] {
  return instances.filter((instance) => {
    if (filters.category !== null && instance.category !== filters.category) return false;
    if (filters.trainer !== null && instance.trainerName !== filters.trainer) return false;
    if (filters.location !== null && instance.locationName !== filters.location) return false;
    return true;
  });
}

/** A category name and the colour the API ships for it. */
export interface CategoryFacet {
  name: string;
  color: string;
}

/** The distinct values present in the loaded week. */
export interface ClassFacets {
  categories: CategoryFacet[];
  trainers: string[];
  locations: string[];
}

/**
 * Collect the options from the loaded week, in **first-appearance order**.
 *
 * Deliberately NOT alphabetical, which is what web does: sorting Georgian needs
 * a collator, `String.prototype.localeCompare` is `Intl` wearing a different
 * hat, and a byte-order sort of Georgian reads as random. First-appearance is
 * the schedule's own order (the server returns `startsAt` ascending), so the
 * rail leads with what is on soonest — which is also the more useful order on
 * a phone.
 *
 * An empty name is skipped: `trainerName` / `locationName` are empty strings
 * when the template has none, and "filter by ␀" is not an option.
 */
export function deriveFacets(instances: readonly ClassInstanceCard[]): ClassFacets {
  const categories = new Map<string, string>();
  const trainers: string[] = [];
  const locations: string[] = [];

  for (const instance of instances) {
    if (instance.category !== '' && !categories.has(instance.category)) {
      categories.set(instance.category, instance.color);
    }
    if (instance.trainerName !== '' && !trainers.includes(instance.trainerName)) {
      trainers.push(instance.trainerName);
    }
    if (instance.locationName !== '' && !locations.includes(instance.locationName)) {
      locations.push(instance.locationName);
    }
  }

  return {
    categories: [...categories.entries()].map(([name, color]) => ({ name, color })),
    trainers,
    locations,
  };
}

// ---------------------------------------------------------------------------
// Formatting. Every one of these goes through `@fit/i18n`, never `Intl`.
// ---------------------------------------------------------------------------

/** `18:00` in Georgian, `06:00 PM` in English — each locale's own clock. */
export function formatTime(iso: string, locale: Locale): string {
  return createDateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    localWallClock(new Date(iso)),
  );
}

/** `ხუთშაბათი, 6 აგვისტო` / `Thursday, August 6` — the hero's date line. */
export function formatLongDay(iso: string, locale: Locale): string {
  return createDateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(localWallClock(new Date(iso)));
}

/** `აგვისტო, 2026` / `August 2026` — the screen's eyebrow. */
export function formatMonth(value: Date, locale: Locale): string {
  return createDateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    localWallClock(value),
  );
}

/** `ხუთ` / `Thu` — a day cell's caption. */
export function formatWeekdayShort(value: Date, locale: Locale): string {
  return createDateTimeFormat(locale, { weekday: 'short' }).format(localWallClock(value));
}

/** `ხუთშაბათი, 6 აგვისტო` / `Thursday, August 6` for a `Date` rather than an ISO string. */
export function formatLongDate(value: Date, locale: Locale): string {
  return createDateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(localWallClock(value));
}

/**
 * The day of the month, as digits.
 *
 * Not routed through a formatter: `String(n)` is the same output in both
 * locales (Georgian uses Western digits) and the day cell sets it in tabular
 * mono, where a formatter's grouping separators would be actively wrong.
 */
export function dayOfMonth(value: Date): string {
  return String(value.getDate());
}
