// The classes screen's arithmetic.
//
// A `.test.tsx` for a module with no JSX in it, deliberately: `vitest.config.ts`
// includes only `lib/**` and `hooks/**`, so a `components/**/*.spec.ts` would be
// run by NEITHER runner and fail silently. `components/auth/auth-error.test.tsx`
// and `use-cool-down.test.tsx` already draw the line here.
//
// Every date below is built with the local-time `new Date(y, m, d, h)`
// constructor rather than an ISO string, because the whole point of this module
// is that it works in the DEVICE's zone: an ISO literal would pin the test to
// UTC and pass on a CI box in London while the bucketing was wrong in Tbilisi.
import type { ClassInstanceCard } from '@fit/types';

import {
  DAYS_IN_WEEK,
  EMPTY_FILTERS,
  PERIODS,
  activeFilterCount,
  addDays,
  applyFilters,
  classesOn,
  countsByDay,
  dayKey,
  dayOfMonth,
  deriveFacets,
  durationMinutes,
  formatLongDay,
  formatMonth,
  formatTime,
  formatWeekdayShort,
  groupByPeriod,
  isSameDay,
  localWallClock,
  periodOf,
  startOfDay,
  startOfWeek,
  weekDays,
  weekWindow,
} from './schedule';

/** A card with everything the module reads, and defaults for the rest. */
function card(
  // `Omit` before the intersection, or `startsAt` narrows to `string & Date`
  // and every call site is a type error.
  over: Omit<Partial<ClassInstanceCard>, 'startsAt'> & { startsAt: Date },
): ClassInstanceCard {
  const startsAt = over.startsAt;
  return {
    id: over.id ?? `c-${String(startsAt.getTime())}`,
    title: over.title ?? 'Spin Express',
    startsAt: startsAt.toISOString(),
    endsAt: over.endsAt ?? new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
    trainerName: over.trainerName ?? 'Sandro K.',
    trainerId: over.trainerId ?? null,
    trainerAvatarUrl: over.trainerAvatarUrl ?? null,
    locationName: over.locationName ?? 'Main Floor',
    capacity: over.capacity ?? 24,
    bookedCount: over.bookedCount ?? 20,
    category: over.category ?? 'Spin',
    color: over.color ?? '#8F8F8B',
    imageUrl: over.imageUrl ?? null,
  };
}

describe('weeks and days', () => {
  it('starts the week on Monday, whatever day it is handed', () => {
    // 2026-08-06 is a Thursday.
    const monday = startOfWeek(new Date(2026, 7, 6, 18, 30));
    expect(dayKey(monday)).toBe('2026-08-03');
    expect(monday.getHours()).toBe(0);

    // A Sunday belongs to the week that STARTED, not the one about to.
    expect(dayKey(startOfWeek(new Date(2026, 7, 9, 23, 0)))).toBe('2026-08-03');
    // A Monday is its own week's start.
    expect(dayKey(startOfWeek(new Date(2026, 7, 3, 0, 1)))).toBe('2026-08-03');
  });

  it('lays out seven days from the Monday', () => {
    const days = weekDays(startOfWeek(new Date(2026, 7, 6)));
    expect(days).toHaveLength(DAYS_IN_WEEK);
    expect(days.map(dayKey)).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ]);
  });

  it('steps days by the calendar, not by 86_400_000', () => {
    // The arithmetic form lands an hour out across a DST boundary; `setDate`
    // keeps the local time of day, which is what a schedule strip needs.
    const from = new Date(2026, 2, 28, 12, 0);
    expect(addDays(from, 3).getHours()).toBe(12);
    expect(dayKey(addDays(from, 3))).toBe('2026-03-31');
  });

  it('asks the API for the whole week, from Monday 00:00 to Sunday 23:59:59.999', () => {
    const { from, to } = weekWindow(new Date(2026, 7, 6));
    expect(new Date(from).getTime()).toBe(new Date(2026, 7, 3).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 7, 10).getTime() - 1);
    // `listClassInstancesQuerySchema` refuses an inverted range up front.
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });

  it('compares days, not instants', () => {
    expect(isSameDay(new Date(2026, 7, 6, 0, 0), new Date(2026, 7, 6, 23, 59))).toBe(true);
    expect(isSameDay(new Date(2026, 7, 6, 23, 59), new Date(2026, 7, 7, 0, 0))).toBe(false);
  });

  it('zeroes the clock and pads the key', () => {
    expect(startOfDay(new Date(2026, 0, 5, 9, 30)).getHours()).toBe(0);
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dayOfMonth(new Date(2026, 0, 5))).toBe('5');
  });
});

describe('time-of-day buckets', () => {
  it('splits at 12:00 and 17:00, in the device zone', () => {
    expect(periodOf(new Date(2026, 7, 6, 0, 0).toISOString())).toBe('morning');
    expect(periodOf(new Date(2026, 7, 6, 11, 59).toISOString())).toBe('morning');
    expect(periodOf(new Date(2026, 7, 6, 12, 0).toISOString())).toBe('afternoon');
    expect(periodOf(new Date(2026, 7, 6, 16, 59).toISOString())).toBe('afternoon');
    expect(periodOf(new Date(2026, 7, 6, 17, 0).toISOString())).toBe('evening');
    expect(periodOf(new Date(2026, 7, 6, 23, 59).toISOString())).toBe('evening');
  });

  it('names its buckets exactly as `member.classes.periods` does', () => {
    expect(PERIODS).toEqual(['morning', 'afternoon', 'evening']);
  });

  it('drops empty buckets — an "Afternoon" rule over a gap reads as a failed load', () => {
    const groups = groupByPeriod([
      card({ startsAt: new Date(2026, 7, 6, 8, 0) }),
      card({ startsAt: new Date(2026, 7, 6, 19, 0) }),
      card({ startsAt: new Date(2026, 7, 6, 20, 0) }),
    ]);
    expect(groups.map((group) => group.period)).toEqual(['morning', 'evening']);
    expect(groups[1]?.items).toHaveLength(2);
  });

  it('keeps the buckets in artboard order even when the data is not', () => {
    const groups = groupByPeriod([
      card({ startsAt: new Date(2026, 7, 6, 19, 0) }),
      card({ startsAt: new Date(2026, 7, 6, 8, 0) }),
      card({ startsAt: new Date(2026, 7, 6, 13, 0) }),
    ]);
    expect(groups.map((group) => group.period)).toEqual(['morning', 'afternoon', 'evening']);
  });
});

describe('the day strip', () => {
  const week = [
    card({ id: 'a', startsAt: new Date(2026, 7, 6, 8, 0) }),
    card({ id: 'b', startsAt: new Date(2026, 7, 6, 18, 0) }),
    card({ id: 'c', startsAt: new Date(2026, 7, 7, 10, 0) }),
  ];

  it('counts per day, which is what the dot AND the spoken label read', () => {
    expect(countsByDay(week)).toEqual({ '2026-08-06': 2, '2026-08-07': 1 });
  });

  it('selects a day without re-sorting the server order', () => {
    expect(classesOn(week, new Date(2026, 7, 6)).map((instance) => instance.id)).toEqual([
      'a',
      'b',
    ]);
    expect(classesOn(week, new Date(2026, 7, 8))).toEqual([]);
  });
});

describe('filters', () => {
  const week = [
    card({
      id: 'a',
      category: 'Spin',
      trainerName: 'Ana G.',
      locationName: 'Studio A',
      startsAt: new Date(2026, 7, 6, 8, 0),
    }),
    card({
      id: 'b',
      category: 'Boxing',
      trainerName: 'Nika B.',
      locationName: 'Main Floor',
      startsAt: new Date(2026, 7, 6, 19, 0),
    }),
    card({
      id: 'c',
      category: 'Spin',
      trainerName: 'Nika B.',
      locationName: 'Studio A',
      startsAt: new Date(2026, 7, 7, 9, 0),
    }),
  ];

  it('passes everything when nothing is set', () => {
    expect(applyFilters(week, EMPTY_FILTERS)).toHaveLength(3);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('ANDs across facets', () => {
    const filtered = applyFilters(week, {
      category: 'Spin',
      trainer: 'Nika B.',
      location: null,
    });
    expect(filtered.map((instance) => instance.id)).toEqual(['c']);
  });

  it('counts the CATEGORY toward the badge, exactly as the artboard does', () => {
    expect(activeFilterCount({ category: 'Spin', trainer: null, location: null })).toBe(1);
    expect(activeFilterCount({ category: 'Spin', trainer: 'Ana G.', location: 'Studio A' })).toBe(
      3,
    );
  });

  it('derives options in schedule order and skips unnamed ones', () => {
    const facets = deriveFacets([
      ...week,
      card({
        id: 'd',
        category: 'Yoga',
        trainerName: '',
        locationName: '',
        startsAt: new Date(2026, 7, 7, 7, 0),
      }),
    ]);
    // First appearance, NOT alphabetical: sorting Georgian needs a collator and
    // `localeCompare` is `Intl` wearing a different hat.
    expect(facets.categories.map((facet) => facet.name)).toEqual(['Spin', 'Boxing', 'Yoga']);
    expect(facets.categories[0]?.color).toBe('#8F8F8B');
    expect(facets.trainers).toEqual(['Ana G.', 'Nika B.']);
    expect(facets.locations).toEqual(['Studio A', 'Main Floor']);
  });
});

describe('durations', () => {
  it('is whole minutes, never negative', () => {
    const start = new Date(2026, 7, 6, 18, 0);
    expect(durationMinutes(start.toISOString(), new Date(2026, 7, 6, 18, 45).toISOString())).toBe(
      45,
    );
    expect(durationMinutes(start.toISOString(), new Date(2026, 7, 6, 17, 0).toISOString())).toBe(0);
  });
});

describe('formatting — locale-correct, and never `Intl`', () => {
  const at = new Date(2026, 7, 6, 18, 5);

  it('shifts an instant so the formatter reads the LOCAL wall clock', () => {
    const shifted = localWallClock(at);
    expect(shifted.getUTCHours()).toBe(at.getHours());
    expect(shifted.getUTCDate()).toBe(at.getDate());
  });

  it('gives each locale its own clock', () => {
    expect(formatTime(at.toISOString(), 'ka')).toBe('18:05');
    expect(formatTime(at.toISOString(), 'en')).toBe('06:05 PM');
  });

  it('writes the day the way CLDR does, in each locale', () => {
    expect(formatLongDay(at.toISOString(), 'en')).toBe('Thursday, August 6');
    expect(formatLongDay(at.toISOString(), 'ka')).toBe('ხუთშაბათი, 6 აგვისტო');
  });

  it('names the month and the weekday from the catalogue tables', () => {
    expect(formatMonth(at, 'en')).toBe('August 2026');
    expect(formatMonth(at, 'ka')).toBe('აგვისტო, 2026');
    expect(formatWeekdayShort(at, 'en')).toBe('Thu');
    expect(formatWeekdayShort(at, 'ka')).toBe('ხუთ');
  });
});
