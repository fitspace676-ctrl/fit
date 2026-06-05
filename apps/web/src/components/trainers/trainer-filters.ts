// Pure, dependency-free filter model for the trainers index (T3.6).
//
// The trainers page fetches the gym's full roster once and renders it as a card
// grid. The filter cards let a visitor narrow that set by specialty, location,
// and a free-text name search. Because the whole roster is already in memory,
// filtering is a pure client transform — instant, no refetch — and the
// available options are *derived from the loaded data*: a visitor can only
// filter by a specialty / location that some trainer actually has.
//
// These helpers stay free of React so the filter bar, the browser orchestrator,
// and the server page can share one definition of "what passes" and "how it
// serialises to the URL" (mirrors the classes `class-filters` module).

import type { TrainerCard } from '@fit/types';

/**
 * Active filter selection. `specialties` is a multi-select set of specialty
 * names (a trainer passes if it has any selected specialty, or the set is
 * empty); `location` is a single name (`null` = no constraint); `search` is a
 * case-insensitive substring matched against the trainer name (`''` = no
 * constraint).
 */
export interface TrainerFilterState {
  specialties: string[];
  location: string | null;
  search: string;
}

/** The empty selection — every trainer passes. */
export const EMPTY_FILTERS: TrainerFilterState = {
  specialties: [],
  location: null,
  search: '',
};

/** The distinct option values present across the loaded trainers, each sorted. */
export interface TrainerFacets {
  specialties: string[];
  locations: string[];
}

/**
 * Collect the distinct, alphabetically-sorted facet values from `trainers`.
 * Empty strings are skipped — there is nothing meaningful to filter by.
 */
export function deriveFacets(trainers: TrainerCard[]): TrainerFacets {
  const specialties = new Set<string>();
  const locations = new Set<string>();

  for (const trainer of trainers) {
    for (const specialty of trainer.specialties) {
      if (specialty) {
        specialties.add(specialty);
      }
    }
    for (const location of trainer.locationNames) {
      if (location) {
        locations.add(location);
      }
    }
  }

  return {
    specialties: [...specialties].sort((a, b) => a.localeCompare(b)),
    locations: [...locations].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Narrow `trainers` to those matching every active facet (logical AND across
 * facets; OR within the multi-select `specialties`). An empty / `null` / blank
 * facet imposes no constraint, so `EMPTY_FILTERS` returns the list unchanged.
 */
export function applyFilters(trainers: TrainerCard[], filters: TrainerFilterState): TrainerCard[] {
  const specialtySet = filters.specialties.length > 0 ? new Set(filters.specialties) : null;
  const query = filters.search.trim().toLowerCase();

  return trainers.filter((trainer) => {
    if (specialtySet && !trainer.specialties.some((value) => specialtySet.has(value))) {
      return false;
    }
    if (filters.location && !trainer.locationNames.includes(filters.location)) {
      return false;
    }
    if (query && !trainer.name.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

/** True when any facet is constraining the result (drives the "Clear" affordance). */
export function hasActiveFilters(filters: TrainerFilterState): boolean {
  return (
    filters.specialties.length > 0 || filters.location !== null || filters.search.trim() !== ''
  );
}

/** Raw filter params as read from the URL (all optional strings). */
export interface RawFilterParams {
  specialty?: string;
  location?: string;
  q?: string;
}

/**
 * Parse the URL's filter params into a {@link TrainerFilterState}, tolerating
 * anything malformed: `?specialty=` is comma-separated and de-duplicated, a
 * blank location becomes `null`, and a blank `q` becomes `''`. Mirrors
 * {@link writeFilterParams} so a round-trip is lossless.
 */
export function parseFilters(raw: RawFilterParams): TrainerFilterState {
  const specialties = raw.specialty
    ? [
        ...new Set(
          raw.specialty
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ]
    : [];
  const location = raw.location?.trim() ? raw.location.trim() : null;
  const search = raw.q?.trim() ? raw.q.trim() : '';

  return { specialties, location, search };
}

/**
 * Write the active facets onto `params` (mutating it), skipping any facet at its
 * default so a clean URL stays clean. The inverse of {@link parseFilters}.
 */
export function writeFilterParams(params: URLSearchParams, filters: TrainerFilterState): void {
  if (filters.specialties.length > 0) {
    params.set('specialty', filters.specialties.join(','));
  }
  if (filters.location) {
    params.set('location', filters.location);
  }
  const search = filters.search.trim();
  if (search) {
    params.set('q', search);
  }
}
