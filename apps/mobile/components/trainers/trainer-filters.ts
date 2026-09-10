// The roster's filter model — a pure port of
// `apps/web/src/components/trainers/trainer-filters.ts`, narrowed to what the
// phone shows.
//
// Web offers three facets (specialty, location, free-text name) and keeps them
// in the URL. The mobile list keeps two — a search field and a row of specialty
// chips — because `member.trainers` carries copy for exactly those two
// (`search`, `searchPlaceholder`, `clear`, `all`, `noMatch.*`) and no location
// picker. That is D10 doing its job: the member catalogue describes the mobile
// screen, and a location filter here would need a string nobody wrote.
//
// FILTERING IS AN IN-MEMORY PASS OVER THE LOADED ROSTER, NEVER A REFETCH.
// `GET /trainers` returns the gym's whole roster in one response with no query
// beyond `gymId`, so a filter that hit the wire would fetch the same bytes and
// throw most of them away — and, on a phone, would do it once per keystroke.
//
// Pure and renderer-free on purpose, so the interesting logic is testable
// without mounting a screen.

import type { TrainerCard } from '@fit/types';

/** What the list is currently narrowed by. */
export interface TrainerFilterState {
  /** Selected specialties. Empty means "all". OR within the set. */
  readonly specialties: readonly string[];
  /** The raw contents of the search field. */
  readonly search: string;
}

/** No filter at all — what `member.trainers.noMatch.action` resets to. */
export const EMPTY_TRAINER_FILTERS: TrainerFilterState = { specialties: [], search: '' };

/**
 * Every specialty present on the roster, de-duplicated and sorted.
 *
 * `localeCompare` is a `String` method, not `Intl`, and the lint ban is on
 * `toLocale*` / `Intl.*` — but Hermes' collation is not Georgian-aware either,
 * so this sorts by code unit for a stable, locale-independent chip order
 * rather than one that differs between a phone and a test.
 */
export function deriveSpecialties(trainers: readonly TrainerCard[]): string[] {
  const seen = new Set<string>();
  for (const trainer of trainers) {
    for (const specialty of trainer.specialties) {
      if (specialty.trim().length > 0) seen.add(specialty);
    }
  }
  return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The roster narrowed by the active filters.
 *
 * AND across facets, OR within specialties — web's semantics exactly. Search
 * matches the NAME only (not the bio), which is what `searchPlaceholder`
 * ("Search by name" / "მოძებნე სახელით") promises.
 */
export function applyTrainerFilters(
  trainers: readonly TrainerCard[],
  filters: TrainerFilterState,
): TrainerCard[] {
  const selected = filters.specialties.length > 0 ? new Set(filters.specialties) : null;
  const query = filters.search.trim().toLowerCase();

  return trainers.filter((trainer) => {
    if (selected !== null && !trainer.specialties.some((value) => selected.has(value))) {
      return false;
    }
    if (query !== '' && !trainer.name.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
}

/** Is anything narrowing the list? Drives whether the reset action is offered. */
export function hasActiveTrainerFilters(filters: TrainerFilterState): boolean {
  return filters.specialties.length > 0 || filters.search.trim() !== '';
}

/** Toggle one specialty chip, preserving the order the chips are drawn in. */
export function toggleSpecialty(
  filters: TrainerFilterState,
  specialty: string,
): TrainerFilterState {
  const present = filters.specialties.includes(specialty);
  return {
    ...filters,
    specialties: present
      ? filters.specialties.filter((value) => value !== specialty)
      : [...filters.specialties, specialty],
  };
}

/**
 * The truncating line under a trainer's name — specialties first, then where
 * they work.
 *
 * ` · ` is web's own separator (`locationNames.join(' · ')` in `TrainerCard`),
 * kept so the two surfaces read identically. It is punctuation, not copy: no
 * catalogue carries it and no locale changes it.
 */
export function trainerMetaLine(trainer: TrainerCard): string {
  return [...trainer.specialties, ...trainer.locationNames].join(' · ');
}

/**
 * The Georgian script, in all three of its Unicode blocks.
 *
 * Mkhedruli (`10D0`–`10FF`) is what Georgian is written in and it is CASELESS.
 * Unicode 11 nevertheless gave it an uppercase mapping onto **Mtavruli**
 * (`1C90`–`1CBF`), so `'ნინო'.toUpperCase()` really does return `'ᲜᲘᲜᲝ'` — and
 * Mtavruli is a display style reserved for all-caps headings and signage, not
 * a capital letter. A monogram built that way spells a member's trainer's
 * initials in a typeface Georgians read as SHOUTING, and it does it only in the
 * app's primary language, which is exactly the class of bug an
 * English-speaking developer never sees. Asomtavruli (`10A0`–`10CF`) and
 * Nuskhuri (`2D00`–`2D2F`) are the liturgical scripts, included for
 * completeness.
 */
const GEORGIAN = /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/;

/**
 * The monogram drawn when a trainer has no photo.
 *
 * Taken from the FIRST character of up to two words. `Avatar` requires the
 * caller to supply this precisely because initial-taking is locale-specific and
 * the design package does not know the locale — and {@link GEORGIAN} is what
 * that sentence means in practice: Latin initials are upper-cased, Georgian
 * ones are left exactly as written.
 */
export function trainerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return words
    .map((word) => {
      const first = [...word][0] ?? '';
      return GEORGIAN.test(first) ? first : first.toUpperCase();
    })
    .join('');
}
