// Pure, dependency-free filter model for the classes page (T3.5).
//
// The classes page fetches one week of occurrences at a time (T3.4) and renders
// them in a calendar / list. T3.5 lets a visitor narrow that set by class type,
// trainer, location, and time of day. Because the whole visible window is
// already in memory, filtering is a pure client transform — instant, no refetch
// — and the available options are *derived from the loaded data*: a visitor can
// only filter by a type / trainer / location that actually occurs that week.
//
// These helpers stay free of React and any date library (matching `date-utils`)
// so the filter bar, the browser orchestrator, and the server page can all share
// one definition of "what passes" and "how it serialises to the URL".

import type { ClassInstanceCard } from '@fit/types';

/** Time-of-day band a card's start time falls into. `any` disables the facet. */
export type TimeBand = 'any' | 'morning' | 'afternoon' | 'evening';

/** The selectable bands in display order (the `any` default is implicit). */
export const TIME_BANDS = ['morning', 'afternoon', 'evening'] as const satisfies readonly Exclude<
  TimeBand,
  'any'
>[];

/** Hour-of-day boundaries between the bands: `[morning, afternoon)` split points. */
const AFTERNOON_FROM = 12;
const EVENING_FROM = 17;

/**
 * Active filter selection. `types` is a multi-select set of category names (a
 * card passes if its category is in the set, or the set is empty); `trainer` and
 * `location` are single names (`null` = no constraint); `time` is one band.
 */
export interface ClassFilterState {
  types: string[];
  trainer: string | null;
  location: string | null;
  time: TimeBand;
}

/** The empty selection — everything passes. */
export const EMPTY_FILTERS: ClassFilterState = {
  types: [],
  trainer: null,
  location: null,
  time: 'any',
};

/** A class type paired with its display colour, for the type pills. */
export interface TypeFacet {
  name: string;
  color: string;
}

/** The distinct option values present across the loaded instances, each sorted. */
export interface ClassFacets {
  types: TypeFacet[];
  trainers: string[];
  locations: string[];
}

/**
 * Collect the distinct, alphabetically-sorted facet values from `instances`.
 * Each type keeps the colour of its first occurrence so the pill matches the
 * card. Empty strings (an unnamed trainer / location) are skipped — there is
 * nothing meaningful to filter by.
 */
export function deriveFacets(instances: ClassInstanceCard[]): ClassFacets {
  const types = new Map<string, string>();
  const trainers = new Set<string>();
  const locations = new Set<string>();

  for (const instance of instances) {
    if (instance.category && !types.has(instance.category)) {
      types.set(instance.category, instance.color);
    }
    if (instance.trainerName) {
      trainers.add(instance.trainerName);
    }
    if (instance.locationName) {
      locations.add(instance.locationName);
    }
  }

  return {
    types: [...types.entries()]
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    trainers: [...trainers].sort((a, b) => a.localeCompare(b)),
    locations: [...locations].sort((a, b) => a.localeCompare(b)),
  };
}

/** The time band an ISO instant falls into, in the visitor's local zone. */
export function bandOf(iso: string): Exclude<TimeBand, 'any'> {
  const hour = new Date(iso).getHours();
  if (hour < AFTERNOON_FROM) {
    return 'morning';
  }
  if (hour < EVENING_FROM) {
    return 'afternoon';
  }
  return 'evening';
}

/**
 * Narrow `instances` to those matching every active facet (logical AND across
 * facets; OR within the multi-select `types`). An empty / `null` / `any` facet
 * imposes no constraint, so `EMPTY_FILTERS` returns the list unchanged.
 */
export function applyFilters(
  instances: ClassInstanceCard[],
  filters: ClassFilterState,
): ClassInstanceCard[] {
  const typeSet = filters.types.length > 0 ? new Set(filters.types) : null;

  return instances.filter((instance) => {
    if (typeSet && !typeSet.has(instance.category)) {
      return false;
    }
    if (filters.trainer && instance.trainerName !== filters.trainer) {
      return false;
    }
    if (filters.location && instance.locationName !== filters.location) {
      return false;
    }
    if (filters.time !== 'any' && bandOf(instance.startsAt) !== filters.time) {
      return false;
    }
    return true;
  });
}

/** True when any facet is constraining the result (drives the "Clear" affordance). */
export function hasActiveFilters(filters: ClassFilterState): boolean {
  return (
    filters.types.length > 0 ||
    filters.trainer !== null ||
    filters.location !== null ||
    filters.time !== 'any'
  );
}

/** Raw filter params as read from the URL (all optional strings). */
export interface RawFilterParams {
  type?: string;
  trainer?: string;
  location?: string;
  time?: string;
}

const TIME_BAND_SET = new Set<TimeBand>(['any', 'morning', 'afternoon', 'evening']);

/**
 * Parse the URL's filter params into a {@link ClassFilterState}, tolerating
 * anything malformed: `?type=` is comma-separated and de-duplicated, a blank
 * trainer / location becomes `null`, and an unknown `time` falls back to `any`.
 * Mirrors {@link writeFilterParams} so a round-trip is lossless.
 */
export function parseFilters(raw: RawFilterParams): ClassFilterState {
  const types = raw.type
    ? [
        ...new Set(
          raw.type
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ]
    : [];
  const trainer = raw.trainer?.trim() ? raw.trainer.trim() : null;
  const location = raw.location?.trim() ? raw.location.trim() : null;
  const time = raw.time && TIME_BAND_SET.has(raw.time as TimeBand) ? (raw.time as TimeBand) : 'any';

  return { types, trainer, location, time };
}

/**
 * Write the active facets onto `params` (mutating it), skipping any facet at its
 * default so a clean URL stays clean. The inverse of {@link parseFilters}.
 */
export function writeFilterParams(params: URLSearchParams, filters: ClassFilterState): void {
  if (filters.types.length > 0) {
    params.set('type', filters.types.join(','));
  }
  if (filters.trainer) {
    params.set('trainer', filters.trainer);
  }
  if (filters.location) {
    params.set('location', filters.location);
  }
  if (filters.time !== 'any') {
    params.set('time', filters.time);
  }
}
