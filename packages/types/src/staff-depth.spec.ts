import { describe, expect, it } from 'vitest';
import {
  createStaffSchema,
  listTimeOffQuerySchema,
  shiftSlotInputSchema,
  updateStaffScheduleSchema,
  workingNowQuerySchema,
} from './staff-depth';
import { listStaffQuerySchema } from './staff';

const shift = { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };

describe('shiftSlotInputSchema — the branch a shift staffs', () => {
  it('takes a branch id', () => {
    expect(shiftSlotInputSchema.parse({ ...shift, locationId: 'loc-1' })).toMatchObject({
      locationId: 'loc-1',
    });
  });

  it('accepts a shift with no branch, and leaves it unattributed', () => {
    // A rota is a PLAN. An unpicked branch stays null rather than defaulting onto
    // the gym's main site — defaulting asserts somebody stood at a door they were
    // never at, which is exactly the wrong failure for a plan. (A check-in
    // defaults, because it records something that really happened.)
    expect(shiftSlotInputSchema.parse(shift).locationId).toBeUndefined();
  });

  it('has no way to write free text any more', () => {
    // Stage 6 replaced a free-text `location` field with this FK, and the
    // replacement is not a rename. The strings that survive on old rows are a
    // QUEUE for an operator — each one named no branch of this gym — and a
    // schedule editor that could still mint new ones would keep that queue
    // growing forever. Zod strips the unknown key, so the value cannot reach the
    // database by any route.
    const parsed = shiftSlotInputSchema.parse({ ...shift, location: 'Studio B' }) as Record<
      string,
      unknown
    >;
    expect(parsed).not.toHaveProperty('location');
  });

  it('still rejects an end at or before the start', () => {
    expect(shiftSlotInputSchema.safeParse({ ...shift, endTime: '09:00' }).success).toBe(false);
  });

  it('carries the branch through both schedule-writing bodies', () => {
    const withBranch = { ...shift, locationId: 'loc-1' };
    expect(updateStaffScheduleSchema.parse({ shifts: [withBranch] }).shifts[0]).toMatchObject({
      locationId: 'loc-1',
    });
    expect(
      createStaffSchema.parse({ firstName: 'Nino', role: 'TRAINER', workingHours: [withBranch] })
        .workingHours[0],
    ).toMatchObject({ locationId: 'loc-1' });
  });
});

describe('workingNowQuerySchema', () => {
  it('accepts a branch, and accepts nothing at all', () => {
    // The endpoint took NO query before Stage 6 — not by choice, but because a
    // shift's only branch was free text nobody could join on. Omitting it still
    // answers gym-wide, so an un-updated caller sees no change.
    expect(workingNowQuerySchema.parse({ locationId: 'loc-1' }).locationId).toBe('loc-1');
    expect(workingNowQuerySchema.parse({}).locationId).toBeUndefined();
  });

  it('rejects an empty branch id rather than treating it as "all"', () => {
    // Three conventions for "all" exist across the console (`'all'`, `''`,
    // `undefined`) and exactly one reaches the API: absence. An empty string is a
    // caller bug, and a 400 says so instead of silently widening the answer.
    expect(workingNowQuerySchema.safeParse({ locationId: '' }).success).toBe(false);
  });
});

describe('the two branch questions a staff query can ask', () => {
  it('offers a branch on the roster and on the time-off queue', () => {
    expect(listStaffQuerySchema.parse({ locationId: 'loc-1' }).locationId).toBe('loc-1');
    expect(listTimeOffQuerySchema.parse({ locationId: 'loc-1' }).locationId).toBe('loc-1');
  });

  it('leaves both gym-wide when omitted', () => {
    expect(listStaffQuerySchema.parse({}).locationId).toBeUndefined();
    expect(listTimeOffQuerySchema.parse({}).locationId).toBeUndefined();
  });
});

describe('createStaffSchema — branch assignments', () => {
  it('defaults to no assignments, which means "we do not know where they work"', () => {
    // Accepted deliberately: the form exists so a walk-in trainer can be captured
    // with a name and a role. Such a person is on the gym-wide roster and under no
    // branch filter — visible as a gap rather than wrongly placed.
    expect(createStaffSchema.parse({ firstName: 'Nino', role: 'TRAINER' })).toMatchObject({
      assignedLocationIds: [],
      workingHours: [],
    });
  });
});
