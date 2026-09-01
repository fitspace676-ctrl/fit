// @fit/admin — the weekly-rota grid's branch round trip (Stage 6).
//
// Saving a staff profile REPLACES the member's whole schedule, so anything the
// day grid cannot hold is something the save deletes. Before Stage 6 a shift had
// nothing to lose; now it has a branch, and the grid has to carry it through an
// edit that never mentions branches — otherwise a manager who fixes a typo in
// somebody's phone number silently unattributes their entire rota.
//
// The other half is the fallback: a rota built while the console is scoped to a
// branch should land there without anyone saying so twice, and a rota built in
// "All locations" should stay unattributed rather than being defaulted onto the
// gym's default branch. A shift is a PLAN — defaulting one asserts that a named
// person will stand at a named door, which nobody said.

import { describe, expect, it } from 'vitest';
import type { ShiftSlotRow } from '@fit/types';
import { defaultHours, hoursFromShifts, toWorkingHours } from './staff-form-fields';

/** One stored shift row; only the fields the grid reads are meaningful. */
function shift(overrides: Partial<ShiftSlotRow> = {}): ShiftSlotRow {
  return {
    id: 's-1',
    staffId: 'gm-1',
    dayOfWeek: 0,
    startTime: '09:00',
    endTime: '17:00',
    locationId: null,
    locationName: null,
    unresolvedLocation: null,
    ...overrides,
  };
}

describe('hoursFromShifts → toWorkingHours', () => {
  it("keeps each day's own branch across an edit that never touches branches", () => {
    const stored = [
      shift({ id: 's-mon', dayOfWeek: 0, locationId: 'loc-vake', locationName: 'Vake' }),
      shift({
        id: 's-tue',
        dayOfWeek: 1,
        locationId: 'loc-saburtalo',
        locationName: 'Saburtalo',
      }),
    ];

    expect(toWorkingHours(hoursFromShifts(stored))).toEqual([
      { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', locationId: 'loc-vake' },
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', locationId: 'loc-saburtalo' },
    ]);
  });

  // The regression that motivates this file: editing under one branch must not
  // rewrite a day a manager assigned to another.
  it("does not let the console's active branch overwrite a day that already has one", () => {
    const stored = [shift({ dayOfWeek: 0, locationId: 'loc-saburtalo' })];

    expect(toWorkingHours(hoursFromShifts(stored), 'loc-vake')).toEqual([
      { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', locationId: 'loc-saburtalo' },
    ]);
  });

  // A surviving free-text label named no branch of this gym. There is no write
  // path that can put one back, so carrying it into an editable form would only
  // keep the operator's queue growing; the shift round-trips as unattributed,
  // which is what it has been since the migration.
  it('drops a surviving free-text label rather than round-tripping it', () => {
    const stored = [shift({ dayOfWeek: 0, unresolvedLocation: 'Main Floor' })];

    expect(toWorkingHours(hoursFromShifts(stored))).toEqual([
      { dayOfWeek: 0, startTime: '09:00', endTime: '17:00' },
    ]);
  });
});

describe('toWorkingHours branch fallback', () => {
  it("puts a freshly built rota at the console's active branch", () => {
    const written = toWorkingHours(defaultHours(), 'loc-vake');

    expect(written).toHaveLength(5); // Mon–Fri.
    for (const day of written) {
      expect(day.locationId).toBe('loc-vake');
    }
  });

  // "All locations" mode. Unattributed, never the gym default: a rota is a plan,
  // and a plan may not assert a door nobody named. Same call the Stage 6 migration
  // made for the shifts it could not match.
  it('leaves a rota unattributed when the console shows every branch', () => {
    for (const day of toWorkingHours(defaultHours())) {
      expect(day).not.toHaveProperty('locationId');
    }
  });
});
