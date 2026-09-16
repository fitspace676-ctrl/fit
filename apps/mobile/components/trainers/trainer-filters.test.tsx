// The roster filter model. Pure functions, no renderer — but a `.test.tsx`
// under jest-expo rather than a `.spec.ts` under Vitest, because
// `vitest.config.ts` includes only `lib/**` and `hooks/**` (and `app/**`), so a
// spec here would be run by NEITHER runner. The extension split is the
// enforcement mechanism; this file stays on the side that actually runs.
import type { TrainerCard } from '@fit/types';

import {
  EMPTY_TRAINER_FILTERS,
  applyTrainerFilters,
  deriveSpecialties,
  hasActiveTrainerFilters,
  toggleSpecialty,
  trainerInitials,
  trainerMetaLine,
} from './trainer-filters';

function trainer(overrides: Partial<TrainerCard> & { id: string; name: string }): TrainerCard {
  return {
    headline: '',
    bio: '',
    avatarUrl: null,
    specialties: [],
    locationNames: [],
    ...overrides,
  };
}

const ROSTER: TrainerCard[] = [
  trainer({
    id: 't1',
    name: 'Nino Beridze',
    specialties: ['Spin', 'CrossFit'],
    locationNames: ['Main Floor'],
  }),
  trainer({ id: 't2', name: 'Sandro Kapanadze', specialties: ['Yoga'] }),
  trainer({ id: 't3', name: 'Ana Gvazava', specialties: ['Spin', '  '] }),
];

describe('deriveSpecialties', () => {
  it('de-duplicates across the roster and drops blanks', () => {
    expect(deriveSpecialties(ROSTER)).toEqual(['CrossFit', 'Spin', 'Yoga']);
  });

  it('is empty for a roster nobody has tagged', () => {
    expect(deriveSpecialties([trainer({ id: 'x', name: 'X' })])).toEqual([]);
  });
});

describe('applyTrainerFilters', () => {
  it('returns the whole roster when nothing is selected', () => {
    expect(applyTrainerFilters(ROSTER, EMPTY_TRAINER_FILTERS)).toHaveLength(3);
  });

  it('ORs within specialties', () => {
    const result = applyTrainerFilters(ROSTER, { specialties: ['Yoga', 'CrossFit'], search: '' });
    expect(result.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('matches the name case-insensitively, and only the name', () => {
    expect(applyTrainerFilters(ROSTER, { specialties: [], search: 'nino' })).toHaveLength(1);
    // `searchPlaceholder` promises "Search by name"; a specialty must not match.
    expect(applyTrainerFilters(ROSTER, { specialties: [], search: 'Spin' })).toHaveLength(0);
  });

  it('ANDs a specialty with a search', () => {
    const result = applyTrainerFilters(ROSTER, { specialties: ['Spin'], search: 'ana' });
    expect(result.map((t) => t.id)).toEqual(['t3']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(applyTrainerFilters(ROSTER, { specialties: [], search: '   ' })).toHaveLength(3);
  });
});

describe('toggleSpecialty / hasActiveTrainerFilters', () => {
  it('adds then removes, leaving the original object untouched', () => {
    const once = toggleSpecialty(EMPTY_TRAINER_FILTERS, 'Spin');
    expect(once.specialties).toEqual(['Spin']);
    expect(EMPTY_TRAINER_FILTERS.specialties).toEqual([]);
    expect(toggleSpecialty(once, 'Spin').specialties).toEqual([]);
  });

  it('knows when the list is narrowed', () => {
    expect(hasActiveTrainerFilters(EMPTY_TRAINER_FILTERS)).toBe(false);
    expect(hasActiveTrainerFilters({ specialties: [], search: '  ' })).toBe(false);
    expect(hasActiveTrainerFilters({ specialties: ['Spin'], search: '' })).toBe(true);
    expect(hasActiveTrainerFilters({ specialties: [], search: 'a' })).toBe(true);
  });
});

describe('trainerMetaLine', () => {
  it("joins specialties then locations with web's own separator", () => {
    expect(trainerMetaLine(ROSTER[0] as TrainerCard)).toBe('Spin · CrossFit · Main Floor');
  });

  it('is empty when there is nothing to say, so the row omits the line', () => {
    expect(trainerMetaLine(trainer({ id: 'x', name: 'X' }))).toBe('');
  });
});

describe('trainerInitials', () => {
  it('takes the first character of up to two words', () => {
    expect(trainerInitials('Nino Beridze')).toBe('NB');
    expect(trainerInitials('Ana Maria Gvazava')).toBe('AM');
    expect(trainerInitials('Cher')).toBe('C');
  });

  it('handles Georgian, which has no case at all', () => {
    // The reason `Avatar` takes `initials` as a prop rather than deriving them:
    // uppercasing is a no-op here and the design package does not know that.
    expect(trainerInitials('ნინო ბერიძე')).toBe('ნბ');
  });

  it('survives an empty or whitespace-only name', () => {
    expect(trainerInitials('   ')).toBe('');
  });
});
