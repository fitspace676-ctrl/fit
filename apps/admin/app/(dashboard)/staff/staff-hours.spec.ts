import { describe, expect, it } from 'vitest';
import type { ShiftSlotRow } from '@fit/types';
import { blocksFromShifts, hoursFromShifts } from './staff-form-fields';

/** A stored shift row; only the three fields the fold reads ever vary. */
function shift(dayOfWeek: number, startTime: string, endTime: string): ShiftSlotRow {
  return {
    id: `${dayOfWeek}-${startTime}`,
    staffId: 'gm-1',
    dayOfWeek,
    startTime,
    endTime,
    location: null,
  };
}

describe('blocksFromShifts', () => {
  it('keeps both halves of a split shift, in start order', () => {
    // A coach's mirrored week may hold two blocks on one day; the single-block
    // fold `hoursFromShifts` drops the second, which is why the read-only view
    // groups the rows instead.
    const blocks = blocksFromShifts([shift(1, '14:00', '18:00'), shift(1, '09:00', '12:00')]);

    expect(blocks[1]).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ]);
  });

  it('gives every weekday an entry, empty for a day off', () => {
    const blocks = blocksFromShifts([shift(0, '09:00', '17:00')]);

    expect(blocks).toHaveLength(7);
    expect(blocks[0]).toEqual([{ start: '09:00', end: '17:00' }]);
    expect(blocks[6]).toEqual([]);
  });
});

describe('hoursFromShifts', () => {
  it('folds a split day to its first block, since the editor holds one a day', () => {
    const hours = hoursFromShifts([shift(1, '09:00', '12:00'), shift(1, '14:00', '18:00')]);

    expect(hours[1]).toEqual({ on: true, start: '09:00', end: '12:00' });
  });
});
